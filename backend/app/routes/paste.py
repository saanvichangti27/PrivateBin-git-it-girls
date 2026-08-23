from fastapi import APIRouter, HTTPException, Request, Depends, status
from datetime import datetime, timedelta, timezone
from slowapi import Limiter
from slowapi.util import get_remote_address

from app.schemas import PasteCreate, PasteCreateResponse, PasteResponse, FailureReportResponse
from app.id_generator import generate_paste_id
from app.redis_client import get_redis, RedisWrapper

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def create_paste_logic(payload: PasteCreate, redis_db: RedisWrapper) -> PasteCreateResponse:
    """Store a new encrypted paste in Redis with TTL, view limit, and burn threshold."""
    paste_id = generate_paste_id(8)
    key = f"paste:{paste_id}"

    created_at = datetime.now(timezone.utc).isoformat()
    expires_at = (datetime.now(timezone.utc) + timedelta(seconds=payload.ttl)).isoformat()
    # -1 means no view limit.
    remaining_views = payload.max_views if payload.max_views is not None else -1

    redis_db.hset(key, {
        "ciphertext": payload.ciphertext,
        "iv": payload.iv,
        "salt": payload.salt,
        "remaining_views": remaining_views,
        "burn_threshold": payload.burn_threshold,
        "created_at": created_at,
        "expires_at": expires_at,
    })
    redis_db.expire(key, payload.ttl)

    return PasteCreateResponse(
        id=paste_id,
        expires_at=expires_at,
        remaining_views=payload.max_views,  # None when no limit set
        burn_threshold=payload.burn_threshold,
    )


def get_paste_logic(paste_id: str, redis_db: RedisWrapper) -> PasteResponse:
    """Fetch a paste, decrement view counter, and burn on exhaustion."""
    key = f"paste:{paste_id}"
    paste_data = redis_db.hgetall(key)

    if not paste_data or "ciphertext" not in paste_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paste not found or has expired/burned.",
        )

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
    )


def report_failure_logic(paste_id: str, redis_db: RedisWrapper) -> FailureReportResponse:
    """Increment failed decryption counter; auto-burn paste if threshold reached."""
    key = f"paste:{paste_id}"
    failed_key = f"{key}:failed"

    if not redis_db.exists(key):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Paste not found or already burned.",
        )

    burn_threshold_str = redis_db.hget(key, "burn_threshold")
    burn_threshold = int(burn_threshold_str) if burn_threshold_str else 5

    attempts = redis_db.incr(failed_key)

    # Keep the failure counter expiry in sync with the paste expiry.
    paste_ttl = redis_db.ttl(key)
    if paste_ttl > 0:
        redis_db.expire(failed_key, paste_ttl)

    if attempts >= burn_threshold:
        redis_db.delete(key, failed_key)
        return FailureReportResponse(
            burned=True,
            attempts_remaining=0,
            message="Paste burned permanently due to excessive failed decryption attempts.",
        )

    return FailureReportResponse(
        burned=False,
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
    return get_paste_logic(paste_id, redis_db)


@router.post("/paste/{paste_id}/report-failure", response_model=FailureReportResponse, tags=["Paste"])
@limiter.limit("15/minute")
async def report_failure(
    request: Request,
    paste_id: str,
    redis_db: RedisWrapper = Depends(get_redis),
):
    return report_failure_logic(paste_id, redis_db)
