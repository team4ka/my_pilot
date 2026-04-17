"""Pydantic schemas for the tracking generation API."""
from __future__ import annotations

from typing import List, Literal, Optional

from pydantic import BaseModel, EmailStr, Field


class Customer(BaseModel):
    firstName: str = Field(min_length=1, max_length=200)
    lastName: str = Field(min_length=1, max_length=200)
    email: EmailStr
    phone: str = Field(min_length=3, max_length=50)


class ShippingAddress(BaseModel):
    streetAddress: str = Field(min_length=1, max_length=500)
    aptSuiteFloor: Optional[str] = None
    city: str = Field(min_length=1, max_length=200)
    zipCode: str = Field(min_length=1, max_length=20)
    country: str = Field(min_length=1, max_length=200)


class OrderItem(BaseModel):
    name: str = Field(min_length=1, max_length=500)
    variant: Optional[str] = None
    quantity: int = Field(gt=0)
    priceCents: int = Field(ge=0)


Region = Literal["uk", "de"]
ShippingMethod = Literal["standard", "express", "tracked", "next-day"]


class OrderPayload(BaseModel):
    orderNumber: str = Field(pattern=r"^[A-Za-z0-9._\-]{3,64}$")
    region: Region
    customer: Customer
    shippingAddress: ShippingAddress
    shippingMethod: ShippingMethod
    items: List[OrderItem] = Field(min_length=1)
    totalCents: int = Field(ge=0)
    currency: str = Field(min_length=3, max_length=3)
    # Human-readable dates for the tracking UI (optional; placeholders used when omitted).
    orderPlacedAt: Optional[str] = Field(None, max_length=120)
    expectedDeliveryBy: Optional[str] = Field(None, max_length=120)


class GenerateResponse(BaseModel):
    trackingUrl: str


class ErrorResponse(BaseModel):
    error: str
