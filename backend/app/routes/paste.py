import secrets
from fastapi import APIRouter, HTTPException, Request, Depends, Query, status
from datetime import datetime, timedelta, timezone
import uuid
import json
import hashlib
from slowapi import Limiter
from slowapi.util import get_remote_address
from collections import defaultdict
from user_agents import parse

from app.schemas import PasteCreate, PasteCreateResponse, PasteResponse, FailureReportResponse, AnalyticsResponse, AccessLog
from app.id_generator import generate_paste_id
from app.redis_client import get_redis, RedisWrapper
from app.security import (
    get_client_ip,
    record_access_event,
    get_access_logs,
    track_ip_failure_and_check_block,
)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

def create_paste_logic(payload: PasteCreate, redis_db: RedisWrapper) -> PasteCreateResponse:
    """Store a new encrypted paste in Redis with TTL, view limit, and burn threshold."""
    paste_id = generate_paste_id(8)
    creator_token = secrets.token_urlsafe(16)
    key = f"paste:{paste_id}"
    admin_token = str(uuid.uuid4())

    created_at = datetime.now(timezone.utc).isoformat()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=payload.ttl)).isoformat()
    remaining_views = payload.max_views if payload.max_views is not None else -1

    data = {
        "ciphertext": payload.ciphertext,
        "iv": payload.iv,
        "salt": payload.salt,
        "remaining_views": remaining_views,
        "total_views": 0,
        "burn_threshold": payload.burn_threshold,
        "created_at": created_at,
        "expires_at": expires_at,
        "admin_token": admin_token,
        "status": "active"
    }
    
    redis_db.hset(key, data)
    redis_db.expire(key, payload.ttl)

    # Log creation event
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    record_access_event(
        redis_db=redis_db,
        paste_id=paste_id,
        event_type="CREATED",
        ip=client_ip,
        user_agent=user_agent,
        ttl=payload.ttl,
        details=f"TTL: {payload.ttl}s, Max views: {payload.max_views or 'Unlimited'}",
    )

    return PasteCreateResponse(
        id=paste_id,
        admin_token=admin_token,
        expires_at=expires_at,
        remaining_views=payload.max_views,
        burn_threshold=payload.burn_threshold,
    )


def log_access(redis_db: RedisWrapper, paste_id: str, request: Request, success: bool):
    key = f"paste:{paste_id}:logs"
    ip = get_remote_address(request)
    ip_hash = hashlib.sha256(ip.encode()).hexdigest()[:12]
    user_agent = request.headers.get("user-agent", "Unknown")[:50]
    log_entry = json.dumps({
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "ip_hash": ip_hash,
        "user_agent": user_agent,
        "success": success
    })
    # We must use the raw client for RPUSH, or fallback to something if not supported.
    # The current RedisWrapper doesn't have rpush. Let's add it or use raw client.
    if redis_db.client:
        try:
            redis_db.client.rpush(key, log_entry)
            redis_db.client.expire(key, 86400 * 7) # Keep logs for max 7 days
        except:
            pass


def get_paste_logic(paste_id: str, request: Request, redis_db: RedisWrapper) -> PasteResponse:
    """Fetch a paste, decrement view counter, log access, and burn on exhaustion."""
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)
    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")

    if not paste_data or "ciphertext" not in paste_data:
        log_access(redis_db, paste_id, request, False)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paste not found or has been destroyed/expired.",
        )
        
    if paste_data.get("status") == "locked":
        log_access(redis_db, paste_id, request, False)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This paste is temporarily locked due to suspicious activity.",
        )

    log_access(redis_db, paste_id, request, True)
    redis_db.hincrby(key, "total_views", 1)

    # Check if locked
    if str(paste_data.get("is_locked", "0")) == "1":
        record_access_event(
            redis_db,
            paste_id,
            "LOCKED_ACCESS_ATTEMPT",
            client_ip,
            user_agent,
            details="Access denied: Link is locked.",
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail="This secret is temporarily locked due to suspicious activity. The creator must unlock it.",
        )

    # Increment total view count
    redis_db.hincrby(key, "total_views", 1)

    remaining_views = int(paste_data.get("remaining_views", -1))
    is_last_view = False

    if remaining_views > 0:
        remaining_views = redis_db.hincrby(key, "remaining_views", -1)
        if remaining_views <= 0:
            is_last_view = True
            remaining_views = 0
            # Mark burned and erase ciphertext for security while preserving metadata for creator dashboard
            redis_db.hset(key, {"burned": "1", "ciphertext": "", "iv": "", "salt": ""})
            redis_db.delete(f"{key}:failed")
            record_access_event(
                redis_db,
                paste_id,
                "BURNED_VIEW_LIMIT",
                client_ip,
                user_agent,
                details="Paste destroyed after final view.",
            )

    record_access_event(
        redis_db,
        paste_id,
        "VIEWED",
        client_ip,
        user_agent,
        details=f"View served. Remaining views: {remaining_views if remaining_views >= 0 else 'Unlimited'}",
    )

    return PasteResponse(
        id=paste_id,
        ciphertext=paste_data["ciphertext"],
        iv=paste_data["iv"],
        salt=paste_data["salt"],
        remaining_views=remaining_views if remaining_views > 0 else 0,
        expires_at=paste_data.get("expires_at", ""),
        status=paste_data.get("status", "active")
    )


def report_failure_logic(paste_id: str, request: Request, redis_db: RedisWrapper) -> FailureReportResponse:
    """Increment failed decryption counter; block IP on abuse, auto-burn or lock paste if threshold reached."""
    key = f"paste:{paste_id}"
    failed_key = f"{key}:failed"
    ip = get_remote_address(request)
    ip_fail_key = f"fails:{ip}"

    if not redis_db.exists(key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paste not found or already burned.",
        )
        
    paste_data = redis_db.hgetall(key)
    if paste_data.get("status") == "locked":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This paste is temporarily locked due to suspicious activity.",
        )

    burn_threshold_str = paste_data.get("burn_threshold")
    burn_threshold = int(burn_threshold_str) if burn_threshold_str else 5

    attempts = redis_db.incr(failed_key)
    
    # Global IP fail tracking
    ip_fails = redis_db.incr(ip_fail_key)
    if ip_fails == 1:
        redis_db.expire(ip_fail_key, 600) # Track fails in 10m window
        
    # If IP fails > 10 times in 10 mins, block the IP
    if ip_fails > 10:
        redis_db.client.set(f"block:{ip}", "1", ex=3600) if redis_db.client else None

    paste_ttl = redis_db.ttl(key)
    if paste_ttl > 0:
        redis_db.expire(failed_key, paste_ttl)

    log_access(redis_db, paste_id, request, False)
    redis_db.hincrby(key, "failed_attempts", 1)

    if attempts >= burn_threshold:
        # Instead of burning, let's lock it to prevent brute force but allow creator to unlock
        redis_db.hset(key, {"status": "locked"})
        return FailureReportResponse(
            burned=False,
            locked=True,
            attempts_remaining=0,
            message="Paste locked temporarily due to excessive failed decryption attempts.",
        )

    # Anomaly response: if rapid failures (e.g. >= 3), auto-lock paste for creator safety
    if attempts >= 3 and str(paste_data.get("is_locked", "0")) == "0":
        redis_db.hset(key, {"is_locked": "1"})
        record_access_event(
            redis_db,
            paste_id,
            "AUTO_LOCKED",
            client_ip,
            user_agent,
            details="Link auto-locked due to consecutive failed decryption attempts.",
        )

    return FailureReportResponse(
        burned=False,
        locked=False,
        attempts_remaining=max(0, burn_threshold - attempts),
        message="Invalid access code attempt logged.",
    )


def get_analytics_logic(
    paste_id: str, token: str, redis_db: RedisWrapper
) -> PasteAnalyticsResponse:
    """Fetch security telemetry and access logs for the creator."""
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)

    if not paste_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Secret link not found or has expired.",
        )

    stored_token = paste_data.get("creator_token")
    if not stored_token or stored_token != token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid creator token. Access to analytics denied.",
        )

    failed_key = f"{key}:failed"
    failed_attempts_str = redis_db.get(failed_key)
    failed_attempts = int(failed_attempts_str) if failed_attempts_str else 0

    is_locked = str(paste_data.get("is_locked", "0")) == "1"
    is_burned = str(paste_data.get("burned", "0")) == "1" or not paste_data.get("ciphertext")

    ttl = redis_db.ttl(key)
    status_str = "expired" if ttl == -2 else ("burned" if is_burned else ("locked" if is_locked else "active"))

    remaining_views_raw = int(paste_data.get("remaining_views", -1))
    max_views_raw = int(paste_data.get("max_views", -1))

    access_logs = get_access_logs(redis_db, paste_id)

    views_over_time_map = defaultdict(int)
    device_breakdown_map = defaultdict(int)

    for log in access_logs:
        if log.get("event_type") == "VIEWED":
            date_str = log.get("timestamp", "")[:10]
            if date_str:
                views_over_time_map[date_str] += 1
        
        ua = parse(log.get("user_agent", ""))
        if ua.is_mobile:
            device = "Mobile"
        elif ua.is_tablet:
            device = "Tablet"
        elif ua.is_pc:
            device = "Desktop"
        elif ua.is_bot:
            device = "Bot"
        else:
            device = "Unknown"
        device_breakdown_map[device] += 1

    views_over_time = [{"date": k, "views": v} for k, v in sorted(views_over_time_map.items())]
    device_breakdown = [{"device": k, "count": v} for k, v in device_breakdown_map.items()]

    return PasteAnalyticsResponse(
        id=paste_id,
        status=status_str,
        created_at=paste_data.get("created_at", ""),
        expires_at=paste_data.get("expires_at", ""),
        total_views=int(paste_data.get("total_views", 0)),
        remaining_views=remaining_views_raw if remaining_views_raw >= 0 else None,
        max_views=max_views_raw if max_views_raw > 0 else None,
        failed_attempts=failed_attempts,
        burn_threshold=int(paste_data.get("burn_threshold", 5)),
        is_locked=is_locked,
        views_over_time=views_over_time,
        device_breakdown=device_breakdown,
        access_logs=access_logs,
    )


def toggle_lock_logic(
    paste_id: str, token: str, request: Request, redis_db: RedisWrapper
) -> LockToggleResponse:
    """Creator lock/unlock emergency toggle."""
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)

    if not paste_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Secret link not found or has expired.",
        )

    stored_token = paste_data.get("creator_token")
    if not stored_token or stored_token != token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid creator token.",
        )

    current_lock = str(paste_data.get("is_locked", "0")) == "1"
    new_lock = not current_lock
    redis_db.hset(key, {"is_locked": "1" if new_lock else "0"})

    client_ip = get_client_ip(request)
    user_agent = request.headers.get("User-Agent", "Unknown")
    record_access_event(
        redis_db,
        paste_id,
        "LOCKED_BY_CREATOR" if new_lock else "UNLOCKED_BY_CREATOR",
        client_ip,
        user_agent,
        details="Lock state manually updated by creator.",
    )

    return LockToggleResponse(
        id=paste_id,
        is_locked=new_lock,
        message=f"Secret link {'locked' if new_lock else 'unlocked'} successfully.",
    )


def delete_paste_logic(
    paste_id: str, token: str, redis_db: RedisWrapper
) -> DeleteResponse:
    """Permanently delete a secret and its logs by creator."""
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)

    if not paste_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Secret link not found.",
        )

    stored_token = paste_data.get("creator_token")
    if not stored_token or stored_token != token:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Invalid creator token.",
        )

    redis_db.delete(key, f"{key}:failed", f"{key}:logs")
    return DeleteResponse(id=paste_id, message="Paste and access logs permanently destroyed.")


# ---------------------------------------------------------------------------
# Route definitions
# ---------------------------------------------------------------------------

@router.post("/paste", response_model=PasteCreateResponse, status_code=status.HTTP_201_CREATED, tags=["Paste"])
@limiter.limit("30/minute")
async def create_paste(
    request: Request,
    payload: PasteCreate,
    redis_db: RedisWrapper = Depends(get_redis),
):
    return create_paste_logic(payload, request, redis_db)


@router.get("/paste/{paste_id}", response_model=PasteResponse, tags=["Paste"])
@limiter.limit("60/minute")
async def get_paste(
    request: Request,
    paste_id: str,
    redis_db: RedisWrapper = Depends(get_redis),
):
    return get_paste_logic(paste_id, request, redis_db)


@router.post("/paste/{paste_id}/report-failure", response_model=FailureReportResponse, tags=["Paste"])
@limiter.limit("15/minute")
async def report_failure(
    request: Request,
    paste_id: str,
    redis_db: RedisWrapper = Depends(get_redis),
):
    return report_failure_logic(paste_id, request, redis_db)


@router.get("/paste/{paste_id}/analytics", response_model=AnalyticsResponse, tags=["Paste"])
async def get_analytics(paste_id: str, admin_token: str, redis_db: RedisWrapper = Depends(get_redis)):
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)
    
    if not paste_data or paste_data.get("admin_token") != admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token or paste not found")
        
    logs_data = []
    if redis_db.client:
        try:
            raw_logs = redis_db.client.lrange(f"{key}:logs", 0, -1)
            for log_str in raw_logs:
                logs_data.append(json.loads(log_str))
        except:
            pass

    return AnalyticsResponse(
        id=paste_id,
        status=paste_data.get("status", "active"),
        created_at=paste_data.get("created_at", ""),
        expires_at=paste_data.get("expires_at", ""),
        remaining_views=int(paste_data.get("remaining_views")) if paste_data.get("remaining_views") and paste_data.get("remaining_views") != "-1" else None,
        total_views=int(paste_data.get("total_views", 0)),
        failed_attempts=int(paste_data.get("failed_attempts", 0)),
        logs=logs_data
    )


@router.post("/paste/{paste_id}/unlock", tags=["Paste"])
async def unlock_paste(paste_id: str, admin_token: str, redis_db: RedisWrapper = Depends(get_redis)):
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)
    if not paste_data or paste_data.get("admin_token") != admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token or paste not found")
        
    redis_db.hset(key, {"status": "active"})
    return {"message": "Paste unlocked successfully"}


@router.delete("/paste/{paste_id}", tags=["Paste"])
async def delete_paste(paste_id: str, admin_token: str, redis_db: RedisWrapper = Depends(get_redis)):
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)
    if not paste_data or paste_data.get("admin_token") != admin_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid admin token or paste not found")
        
    redis_db.delete(key, f"{key}:failed", f"{key}:logs")
    return {"message": "Paste burned successfully"}
