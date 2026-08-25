import os
import time
import logging
from typing import Dict, Any, Optional
from dotenv import load_dotenv
import redis

# Load environment variables from .env file
load_dotenv(override=True)

logger = logging.getLogger("uvicorn")

# Seconds to wait before attempting a real Redis reconnect after a failure.
RECONNECT_RETRY_SECONDS = 10


class InMemoryStore:
    """In-memory store fallback for local development when Redis is not running.

    NOTE: this store is per-process. If you run multiple workers
    (e.g. `uvicorn --workers 4`), each worker has its own independent
    fallback state — a paste created on one worker will not be visible
    on another while running in fallback mode.
    """

    def __init__(self):
        self.hashes: Dict[str, Dict[str, Any]] = {}
        self.counters: Dict[str, int] = {}
        self.strings: Dict[str, str] = {}
        self.lists: Dict[str, list] = {}
        self.ttls: Dict[str, float] = {}

    def _is_expired(self, key: str) -> bool:
        expire_time = self.ttls.get(key)
        return bool(expire_time and time.time() > expire_time)

    def _cleanup_if_expired(self, key: str):
        if self._is_expired(key):
            self.delete(key)

    def hset(self, key: str, mapping: Dict[str, Any]):
        self._cleanup_if_expired(key)
        if key not in self.hashes:
            self.hashes[key] = {}
        # Mirror Redis: store all values as strings.
        for k, v in mapping.items():
            self.hashes[key][k] = str(v)
        return len(mapping)

    def hgetall(self, key: str) -> Dict[str, str]:
        self._cleanup_if_expired(key)
        data = self.hashes.get(key, {})
        return {k: str(v) for k, v in data.items()}

    def hget(self, key: str, field: str) -> Optional[str]:
        return self.hgetall(key).get(field)

    def hincrby(self, key: str, field: str, amount: int = 1) -> int:
        self._cleanup_if_expired(key)
        if key not in self.hashes:
            self.hashes[key] = {}
        current = int(self.hashes[key].get(field, 0))
        updated = current + amount
        self.hashes[key][field] = str(updated)
        return updated

    def set(self, key: str, value: Any) -> bool:
        self._cleanup_if_expired(key)
        self.strings[key] = str(value)
        return True

    def setex(self, key: str, time_seconds: int, value: Any) -> bool:
        self.set(key, value)
        self.expire(key, time_seconds)
        return True

    def get(self, key: str) -> Optional[str]:
        self._cleanup_if_expired(key)
        return self.strings.get(key)

    def rpush(self, key: str, *values: str) -> int:
        self._cleanup_if_expired(key)
        if key not in self.lists:
            self.lists[key] = []
        for val in values:
            self.lists[key].append(str(val))
        return len(self.lists[key])

    def lrange(self, key: str, start: int, end: int) -> list:
        self._cleanup_if_expired(key)
        items = self.lists.get(key, [])
        if end == -1:
            return items[start:]
        return items[start : end + 1]

    def ltrim(self, key: str, start: int, end: int) -> bool:
        self._cleanup_if_expired(key)
        if key in self.lists:
            if end == -1:
                self.lists[key] = self.lists[key][start:]
            else:
                self.lists[key] = self.lists[key][start : end + 1]
        return True

    def expire(self, key: str, time_seconds: int) -> bool:
        self.ttls[key] = time.time() + time_seconds
        return True

    def ttl(self, key: str) -> int:
        self._cleanup_if_expired(key)
        key_exists = (
            key in self.hashes
            or key in self.counters
            or key in self.strings
            or key in self.lists
        )
        if not key_exists:
            return -2
        expire_time = self.ttls.get(key)
        if not expire_time:
            return -1
        diff = int(expire_time - time.time())
        return diff if diff > 0 else -2

    def incr(self, key: str) -> int:
        self._cleanup_if_expired(key)
        current = self.counters.get(key, 0)
        updated = current + 1
        self.counters[key] = updated
        return updated

    def delete(self, *keys: str) -> int:
        count = 0
        for k in keys:
            if (
                k in self.hashes
                or k in self.counters
                or k in self.strings
                or k in self.lists
            ):
                self.hashes.pop(k, None)
                self.counters.pop(k, None)
                self.strings.pop(k, None)
                self.lists.pop(k, None)
                self.ttls.pop(k, None)
                count += 1
        return count

    def exists(self, key: str) -> int:
        self._cleanup_if_expired(key)
        return 1 if (
            key in self.hashes
            or key in self.counters
            or key in self.strings
            or key in self.lists
        ) else 0


class RedisWrapper:
    """Wrapper that delegates to a real Redis client, with an in-memory
    fallback for local development when Redis isn't reachable.

    The backend is decided once per _call(), not re-decided per sub-step.
    On a Redis failure the wrapper marks itself unhealthy and retries after
    RECONNECT_RETRY_SECONDS — it does NOT flip permanently to fallback for
    the rest of the process lifetime.
    """

    def __init__(self, redis_url: str):
        self.redis_url = redis_url
        self.fallback = InMemoryStore()
        self.client: Optional[redis.Redis] = None
        self._redis_healthy = False
        self._last_failure_time: Optional[float] = None
        self._connect()

    def _connect(self):
        """(Re)attempt to establish a real Redis connection."""
        try:
            # ssl_cert_reqs=None is required for managed TLS Redis services
            # (e.g. Upstash, Redis Cloud) that use rediss:// URLs.
            ssl_kwargs = (
                {"ssl_cert_reqs": None}
                if self.redis_url.startswith("rediss://")
                else {}
            )
            self.client = redis.Redis.from_url(
                self.redis_url,
                decode_responses=True,
                socket_timeout=5.0,
                socket_connect_timeout=5.0,
                **ssl_kwargs,
            )
            self.client.ping()
            self._redis_healthy = True
            self._last_failure_time = None
            logger.info("Connected to Redis server successfully.")
        except Exception as e:
            logger.warning(
                f"Redis connection notice ({e}). Using in-memory store fallback."
            )
            self._redis_healthy = False
            self._last_failure_time = time.time()

    def _should_retry_redis(self) -> bool:
        if self._redis_healthy:
            return False
        if self._last_failure_time is None:
            return True
        return (time.time() - self._last_failure_time) >= RECONNECT_RETRY_SECONDS

    def _use_fallback(self) -> bool:
        if not self._redis_healthy and self._should_retry_redis():
            self._connect()
        return not self._redis_healthy

    def _call(self, method_name: str, *args, **kwargs):
        if not self._use_fallback() and self.client:
            try:
                method = getattr(self.client, method_name)
                return method(*args, **kwargs)
            except Exception as e:
                logger.warning(
                    f"Redis call '{method_name}' failed ({e}). "
                    f"Falling back to in-memory store for this call; "
                    f"will retry Redis in {RECONNECT_RETRY_SECONDS}s."
                )
                self._redis_healthy = False
                self._last_failure_time = time.time()

        return getattr(self.fallback, method_name)(*args, **kwargs)

    def hset(self, key: str, mapping: Dict[str, Any]):
        return self._call("hset", key, mapping=mapping)

    def hgetall(self, key: str) -> Dict[str, str]:
        return self._call("hgetall", key)

    def hget(self, key: str, field: str) -> Optional[str]:
        return self._call("hget", key, field)

    def hincrby(self, key: str, field: str, amount: int = 1) -> int:
        return self._call("hincrby", key, field, amount)

    def set(self, key: str, value: Any):
        return self._call("set", key, value)

    def setex(self, key: str, time_seconds: int, value: Any):
        return self._call("setex", key, time_seconds, value)

    def get(self, key: str) -> Optional[str]:
        return self._call("get", key)

    def rpush(self, key: str, *values: str) -> int:
        if not self._use_fallback() and self.client:
            try:
                return self.client.rpush(key, *values)
            except Exception as e:
                logger.warning(f"Redis call 'rpush' failed ({e}). Falling back.")
                self._redis_healthy = False
                self._last_failure_time = time.time()
        return self.fallback.rpush(key, *values)

    def lrange(self, key: str, start: int, end: int) -> list:
        return self._call("lrange", key, start, end)

    def ltrim(self, key: str, start: int, end: int) -> bool:
        return self._call("ltrim", key, start, end)

    def expire(self, key: str, time_seconds: int):
        return self._call("expire", key, time_seconds)

    def ttl(self, key: str) -> int:
        return self._call("ttl", key)

    def incr(self, key: str) -> int:
        return self._call("incr", key)

    def delete(self, *keys: str) -> int:
        if not self._use_fallback() and self.client:
            try:
                return self.client.delete(*keys)
            except Exception as e:
                logger.warning(
                    f"Redis call 'delete' failed ({e}). "
                    f"Falling back to in-memory store for this call."
                )
                self._redis_healthy = False
                self._last_failure_time = time.time()
        return self.fallback.delete(*keys)

    def exists(self, key: str) -> int:
        return self._call("exists", key)

    def is_healthy(self) -> bool:
        """Expose current backend status, e.g. for a /health endpoint."""
        return self._redis_healthy


redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379")
redis_db = RedisWrapper(redis_url)


def get_redis() -> RedisWrapper:
    return redis_db
