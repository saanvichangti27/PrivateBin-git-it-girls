import hashlib
import json
import os
import httpx
from datetime import datetime, timezone
from typing import List, Optional
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.redis_client import get_redis

SALT = os.getenv("SECURITY_SALT", "privatebin_secure_salt_v1")


def get_client_ip(request: Request) -> str:
    """Extract real client IP considering reverse proxies."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "127.0.0.1"


def anonymize_ip(ip: str) -> str:
    """Return a GDPR-compliant anonymized hash of the IP address."""
    digest = hashlib.sha256(f"{ip}:{SALT}".encode()).hexdigest()[:12]
    # If IPv4, include subnet prefix for contextual geo/network insight
    parts = ip.split(".")
    if len(parts) == 4:
        return f"{parts[0]}.{parts[1]}.*.* ({digest})"
    return f"anon-{digest}"


def record_access_event(
    redis_db,
    paste_id: str,
    event_type: str,
    ip: str,
    user_agent: Optional[str] = None,
    ttl: int = 86400,
    details: str = "",
) -> None:
    """Log an access or security event for a specific paste."""
    location = "Unknown"
    if ip and not ip.startswith("127.") and not ip.startswith("192.168.") and not ip.startswith("10.") and ip != "localhost":
        try:
            with httpx.Client(timeout=1.5) as client:
                resp = client.get(f"http://ip-api.com/json/{ip}")
                if resp.status_code == 200:
                    data = resp.json()
                    if data.get("status") == "success":
                        city = data.get("city", "")
                        country = data.get("countryCode", "")
                        if city and country:
                            location = f"{city}, {country}"
                        elif country:
                            location = country
        except Exception:
            pass

    logs_key = f"paste:{paste_id}:logs"
    entry = {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "event_type": event_type,
        "ip_hash": anonymize_ip(ip),
        "user_agent": (user_agent or "Unknown")[:120],
        "location": location,
        "details": details,
    }
    redis_db.rpush(logs_key, json.dumps(entry))
    redis_db.ltrim(logs_key, -50, -1)  # retain only the last 50 events
    
    current_ttl = redis_db.ttl(f"paste:{paste_id}")
    effective_ttl = current_ttl if current_ttl > 0 else ttl
    redis_db.expire(logs_key, effective_ttl)


def get_access_logs(redis_db, paste_id: str) -> List[dict]:
    """Retrieve recorded access logs (newest first)."""
    logs_key = f"paste:{paste_id}:logs"
    raw_entries = redis_db.lrange(logs_key, 0, -1)
    parsed = []
    for item in raw_entries:
        try:
            parsed.append(json.loads(item))
        except Exception:
            continue
    return list(reversed(parsed))


def track_ip_failure_and_check_block(redis_db, ip: str) -> dict:
    """Track failed decryption attempts per IP and trigger auto-block if threshold is reached."""
    ip_fail_key = f"ip_fails:{ip}"
    fails = redis_db.incr(ip_fail_key)
    
    # 10 minute window for failed attempts counter
    if fails == 1:
        redis_db.expire(ip_fail_key, 600)

    # If an IP has 10 or more failures in 10 minutes, block for 30 minutes (1800s)
    if fails >= 10:
        redis_db.setex(f"blocklist:{ip}", 1800, "1")
        return {"blocked": True, "fails": fails}

    return {"blocked": False, "fails": fails}


def is_ip_blocked(redis_db, ip: str) -> bool:
    """Check if the given IP address is present in the active blocklist."""
    return bool(redis_db.exists(f"blocklist:{ip}"))


def block_ip(redis_db, ip: str, duration_seconds: int = 1800):
    """Explicitly block an IP address."""
    redis_db.setex(f"blocklist:{ip}", duration_seconds, "1")


def unblock_ip(redis_db, ip: str):
    """Explicitly unblock an IP address."""
    redis_db.delete(f"blocklist:{ip}", f"ip_fails:{ip}")


class SecurityBlocklistMiddleware(BaseHTTPMiddleware):
    """Middleware that intercepts requests from blocked IPs and drops them immediately."""

    async def dispatch(self, request: Request, call_next):
        # Health checks bypass blocklist
        if request.url.path == "/health":
            return await call_next(request)

        redis_db = get_redis()
        client_ip = get_client_ip(request)

        if is_ip_blocked(redis_db, client_ip):
            return JSONResponse(
                status_code=403,
                content={
                    "error": "Forbidden: Your IP address has been temporarily blocked due to repeated suspicious activity."
                },
            )

        return await call_next(request)
