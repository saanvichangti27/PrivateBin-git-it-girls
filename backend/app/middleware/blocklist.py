from fastapi import Request, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from slowapi.util import get_remote_address

from app.redis_client import get_redis

class BlocklistMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        ip = get_remote_address(request)
        redis_db = get_redis()
        
        # Check if IP is in the blocklist
        # The key we set was `block:{ip}`
        if redis_db.client:
            try:
                is_blocked = redis_db.client.exists(f"block:{ip}")
                if is_blocked:
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"detail": "Your IP address has been temporarily blocked due to suspicious activity."},
                    )
            except Exception:
                pass # Fail open if Redis is down
                
        response = await call_next(request)
        return response
