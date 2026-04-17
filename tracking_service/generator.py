"""HTML generator for tracking pages."""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

from jinja2 import Environment, FileSystemLoader, select_autoescape

from .models import OrderPayload, ShippingAddress

ROOT = Path(__file__).resolve().parent
TEMPLATES_DIR = ROOT / "templates"
DATA_DIR = ROOT / "data"
ORDERS_DIR = DATA_DIR / "orders"
GENERATED_DIR = DATA_DIR / "generated"

SELLER_NAME = "One Shop"
DOWNLOAD_FILE_NAME = "RoyalMail-verification.pdf"
# Shown when payload does not include orderPlacedAt / expectedDeliveryBy.
PLACEHOLDER_ORDER_PLACED_AT = "14 April 2026"
PLACEHOLDER_EXPECTED_DELIVERY_BY = "22 April 2026"
PLACEHOLDER_FILE_RELPATH = "/static/files/placeholder.pdf"
STATIC_BASE = "/static/royalmail"

SHIPPING_METHOD_LABELS: Dict[str, str] = {
    "standard": "Royal Mail Tracked 48",
    "tracked": "Royal Mail Tracked 24",
    "express": "Royal Mail Special Delivery",
    "next-day": "Royal Mail Special Delivery",
}

CURRENCY_SYMBOLS: Dict[str, str] = {
    "GBP": "\u00a3",
    "EUR": "\u20ac",
    "USD": "$",
}


@dataclass
class GeneratedPage:
    order_number: str
    html_path: Path
    payload_path: Path


def _env() -> Environment:
    return Environment(
        loader=FileSystemLoader(str(TEMPLATES_DIR)),
        autoescape=select_autoescape(["html", "xml"]),
        trim_blocks=True,
        lstrip_blocks=True,
    )


def _format_money(cents: int, currency: str) -> str:
    symbol = CURRENCY_SYMBOLS.get(currency.upper(), currency.upper() + " ")
    amount = cents / 100
    return f"{symbol}{amount:,.2f}"


def _shipping_address_display_lines(address: ShippingAddress) -> list[str]:
    """UK-style block: street (and optional flat line), CITY, postcode, COUNTRY — all caps for city and country."""
    lines: list[str] = []
    street = address.streetAddress.strip()
    if street:
        lines.append(street)
    apt = (address.aptSuiteFloor or "").strip()
    if apt:
        lines.append(apt)
    city = address.city.strip()
    if city:
        lines.append(city.upper())
    postcode = address.zipCode.strip()
    if postcode:
        lines.append(postcode)
    country = address.country.strip()
    if country:
        lines.append(country.upper())
    return lines


def _placed_at_date_only(value: str) -> str:
    """Strip trailing time from human-readable placed-at strings (e.g. ', 09:42')."""
    s = value.strip()
    return re.sub(r",\s*\d{1,2}:\d{2}(?:\s*[aApP][mM])?\s*$", "", s, flags=re.IGNORECASE)


def _build_view_model(payload: OrderPayload) -> Dict[str, Any]:
    customer = payload.customer
    address = payload.shippingAddress
    items = [
        {
            "name": it.name,
            "variant": it.variant,
            "quantity": it.quantity,
            "price": _format_money(it.priceCents, payload.currency),
        }
        for it in payload.items
    ]
    address_lines = _shipping_address_display_lines(address)
    placed_raw = payload.orderPlacedAt or PLACEHOLDER_ORDER_PLACED_AT
    placed_at = _placed_at_date_only(placed_raw)
    expected_by = payload.expectedDeliveryBy or PLACEHOLDER_EXPECTED_DELIVERY_BY
    return {
        "page_title": f"Tracking \u00b7 {payload.orderNumber} \u00b7 Royal Mail",
        "static_base": STATIC_BASE,
        "download_href": PLACEHOLDER_FILE_RELPATH,
        "download_filename": DOWNLOAD_FILE_NAME,
        "seller_name": SELLER_NAME,
        "order": {
            "number": payload.orderNumber,
            "total": _format_money(payload.totalCents, payload.currency),
            "currency": payload.currency.upper(),
            "placed_at": placed_at,
            "expected_delivery": expected_by,
        },
        "customer": {
            "fullName": f"{customer.firstName} {customer.lastName}".strip(),
            "email": customer.email,
            "phone": customer.phone,
        },
        "shipping": {
            "method_key": payload.shippingMethod,
            "method_label": SHIPPING_METHOD_LABELS.get(
                payload.shippingMethod, payload.shippingMethod.title()
            ),
            "address_lines": address_lines,
        },
        "items": items,
    }


def render_html(payload: OrderPayload) -> str:
    env = _env()
    template = env.get_template("royalmail/order.html.jinja")
    return template.render(**_build_view_model(payload))


def save_order_and_render(payload: OrderPayload) -> GeneratedPage:
    ORDERS_DIR.mkdir(parents=True, exist_ok=True)
    out_dir = GENERATED_DIR / payload.orderNumber
    out_dir.mkdir(parents=True, exist_ok=True)

    payload_path = ORDERS_DIR / f"{payload.orderNumber}.json"
    payload_path.write_text(
        json.dumps(payload.model_dump(), ensure_ascii=False, indent=2),
        encoding="utf-8",
    )

    html = render_html(payload)
    html_path = out_dir / "index.html"
    html_path.write_text(html, encoding="utf-8", newline="\n")

    return GeneratedPage(
        order_number=payload.orderNumber,
        html_path=html_path,
        payload_path=payload_path,
    )
