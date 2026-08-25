import os
from datetime import datetime, timezone
from dotenv import load_dotenv
load_dotenv(override=True)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.routes.paste import router as paste_router, limiter
from app.redis_client import get_redis
from app.middleware.blocklist import BlocklistMiddleware

app = FastAPI(
    title="PrivateBin Modernization API",
    description="FastAPI + Redis Backend for Secure Client-Side Secret Sharing",
    version="1.0.0",
)

# Register blocklist middleware BEFORE rate limiter so blocked IPs don't even use tokens
app.add_middleware(BlocklistMiddleware)

# Register slowapi limiter and rate-limit exceeded handler.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS — allow the Vite dev server and the configured production origin.
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[FRONTEND_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paste routes
app.include_router(paste_router)

@app.get("/", tags=["System"])
async def root():
    """Root endpoint to verify the API is running."""
    return {"message": "PrivateBin Modernization API is running. Visit /docs for API documentation."}

@app.get("/health", tags=["System"])
async def health_check():
    """Returns API liveness and Redis store health status."""
    redis_db = get_redis()
    return {
        "status": "ok",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "redis": "connected" if redis_db.is_healthy() else "fallback (in-memory)",
    }
