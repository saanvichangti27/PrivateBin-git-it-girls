from pydantic import BaseModel, Field, field_validator
from typing import Optional, List


class PasteCreate(BaseModel):
    ciphertext: str = Field(..., description="Base64 encoded ciphertext string")
    iv: str = Field(..., description="Base64 encoded 12-byte initialization vector")
    salt: str = Field(..., description="Base64 encoded 16-byte salt")
    ttl: int = Field(default=86400, gt=0, description="Time to live in seconds (default 24h, must be > 0)")
    max_views: Optional[int] = Field(default=None, gt=0, description="Max allowed views before deletion (must be > 0 if set)")
    burn_threshold: int = Field(default=5, ge=1, description="Max allowed failed attempts before burning (minimum 1)")

    @field_validator("ciphertext", "iv", "salt")
    @classmethod
    def must_not_be_blank(cls, v: str, info) -> str:
        if not v or not v.strip():
            raise ValueError(f"{info.field_name} must not be blank.")
        return v


class PasteCreateResponse(BaseModel):
    id: str
    creator_token: str
    expires_at: str
    remaining_views: Optional[int] = None
    burn_threshold: int


class PasteResponse(BaseModel):
    id: str
    ciphertext: str
    iv: str
    salt: str
    remaining_views: int
    expires_at: str
    is_locked: bool = False


class FailureReportResponse(BaseModel):
    burned: bool
    attempts_remaining: int
    message: str


class LogEntrySchema(BaseModel):
    timestamp: str
    event_type: str
    ip_hash: str
    user_agent: str
    location: Optional[str] = "Unknown"
    details: Optional[str] = ""


class TimeSeriesData(BaseModel):
    date: str
    views: int


class DeviceData(BaseModel):
    device: str
    count: int


class PasteAnalyticsResponse(BaseModel):
    id: str
    status: str  # "active", "burned", "expired", "locked"
    created_at: str
    expires_at: str
    total_views: int
    remaining_views: Optional[int] = None
    max_views: Optional[int] = None
    failed_attempts: int
    burn_threshold: int
    is_locked: bool
    views_over_time: List[TimeSeriesData]
    device_breakdown: List[DeviceData]
    access_logs: List[LogEntrySchema]


class LockToggleResponse(BaseModel):
    id: str
    is_locked: bool
    message: str


class DeleteResponse(BaseModel):
    id: str
    message: str
