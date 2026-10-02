import re
from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

Status = Literal["new", "read", "replied", "archived"]


class ContactIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30)
    service: str = Field(min_length=2, max_length=100)
    message: str = Field(min_length=10, max_length=5000)
    website: str = Field(default="", max_length=200)  # honeypot: real visitors leave this empty

    @field_validator("name", "phone", "service", "message", mode="before")
    @classmethod
    def strip_text(cls, v):
        return v.strip() if isinstance(v, str) else v

    @field_validator("phone")
    @classmethod
    def phone_format(cls, v: str) -> str:
        if not re.fullmatch(r"[0-9+()\-\s.]{7,30}", v):
            raise ValueError("Enter a valid phone number")
        return v


class ContactAck(BaseModel):
    ok: bool = True
    message: str


class MessageOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: str
    phone: str
    service: str
    message: str
    status: str
    admin_notes: str
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class MessagePage(BaseModel):
    items: list[MessageOut]
    total: int
    page: int
    page_size: int
    pages: int


class MessageUpdate(BaseModel):
    status: Optional[Status] = None
    admin_notes: Optional[str] = Field(default=None, max_length=5000)


class Stats(BaseModel):
    total: int
    new: int
    replied: int
    today: int
    last_7_days: int


class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=60)
    password: str = Field(min_length=1, max_length=200)


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str


class MeOut(BaseModel):
    username: str
