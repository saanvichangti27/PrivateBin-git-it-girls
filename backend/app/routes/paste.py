from fastapi import APIRouter, HTTPException, Request, Depends, status
from datetime import datetime, timedelta, timezone
import uuid
import json
import hashlib
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.schemas import PasteCreate, PasteCreateResponse, PasteResponse, FailureReportResponse, AnalyticsResponse, AccessLog
from app.id_generator import generate_paste_id
from app.redis_client import get_redis, RedisWrapper

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

def create_paste_logic(payload: PasteCreate, redis_db: RedisWrapper) -> PasteCreateResponse:
    """Store a new encrypted paste in Redis with TTL, view limit, and burn threshold."""
    paste_id = generate_paste_id(8)
    key = f"paste:{paste_id}"
    admin_token = str(uuid.uuid4())

    created_at = datetime.now(timezone.utc).isoformat()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=payload.ttl)).isoformat()
    # -1 means no view limit.
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

    return PasteCreateResponse(
        id=paste_id,
        admin_token=admin_token,
        expires_at=expires_at,
        remaining_views=payload.max_views,  # None when no limit set
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

    if not paste_data or "ciphertext" not in paste_data:
        log_access(redis_db, paste_id, request, False)
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paste not found or has expired/burned.",
        )
        
    if paste_data.get("status") == "locked":
        log_access(redis_db, paste_id, request, False)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This paste is temporarily locked due to suspicious activity.",
        )

    log_access(redis_db, paste_id, request, True)
    redis_db.hincrby(key, "total_views", 1)

    remaining_views = int(paste_data.get("remaining_views", -1))

    # Only decrement when a view limit was set (remaining_views > 0).
    # remaining_views == -1 means unlimited views.
    if remaining_views > 0:
        remaining_views = redis_db.hincrby(key, "remaining_views", -1)

        if remaining_views <= 0:
            # View budget exhausted — burn paste immediately.
            redis_db.delete(key, f"{key}:failed")
            remaining_views = 0

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

    # Keep the failure counter expiry in sync with the paste expiry.
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

    return FailureReportResponse(
        burned=False,
        locked=False,
        attempts_remaining=max(0, burn_threshold - attempts),
        message="Invalid access code attempt logged.",
    )


# ---------------------------------------------------------------------------
# Route definitions
# NOTE on decorator order with slowapi:
#   @router.<method> must be OUTERMOST (applied last / registered to FastAPI).
#   @limiter.limit   must be CLOSEST to the async def (applied first).
#   Reversing this prevents slowapi from finding the route.
# ---------------------------------------------------------------------------

@router.post("/paste", response_model=PasteCreateResponse, status_code=status.HTTP_201_CREATED, tags=["Paste"])
@limiter.limit("20/hour")
async def create_paste(
    request: Request,
    payload: PasteCreate,
    redis_db: RedisWrapper = Depends(get_redis),
):
    return create_paste_logic(payload, redis_db)


@router.get("/paste/{paste_id}", response_model=PasteResponse, tags=["Paste"])
@limiter.limit("15/minute")
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
