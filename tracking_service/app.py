"""FastAPI entrypoint for the tracking service."""
from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import ValidationError

from .generator import GENERATED_DIR, save_order_and_render
from .models import GenerateResponse, OrderPayload

ROOT = Path(__file__).resolve().parent
STATIC_DIR = ROOT / "static"
FILES_DIR = ROOT / "files"

app = FastAPI(title="Tracking service", version="0.1.0")


@app.on_event("startup")
def _ensure_dirs() -> None:
    GENERATED_DIR.mkdir(parents=True, exist_ok=True)


app.mount(
    "/static/royalmail",
    StaticFiles(directory=str(STATIC_DIR / "royalmail")),
    name="static-royalmail",
)
app.mount(
    "/static/files",
    StaticFiles(directory=str(FILES_DIR)),
    name="static-files",
)


def _check_auth(request: Request) -> None:
    expected = os.getenv("TRACKING_API_KEY", "").strip()
    if not expected:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="TRACKING_API_KEY is not configured on the server",
        )
    header = request.headers.get("Authorization", "")
    if not header.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing bearer token")
    token = header.split(" ", 1)[1].strip()
    if token != expected:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid api key")


def _public_base_url(request: Request) -> str:
    env_val = os.getenv("PUBLIC_BASE_URL", "").strip().rstrip("/")
    if env_val:
        return env_val
    host = request.headers.get("host", "")
    scheme = request.headers.get("x-forwarded-proto", request.url.scheme)
    return f"{scheme}://{host}".rstrip("/")


@app.post(
    "/api/tracking/generate",
    response_model=GenerateResponse,
    responses={
        400: {"description": "Bad request"},
        401: {"description": "Unauthorized"},
        501: {"description": "Region not implemented yet"},
    },
)
async def generate_tracking(request: Request) -> JSONResponse:
    _check_auth(request)

    try:
        raw = await request.json()
    except Exception:
        return JSONResponse(status_code=400, content={"error": "invalid JSON body"})

    try:
        payload = OrderPayload.model_validate(raw)
    except ValidationError as exc:
        return JSONResponse(status_code=400, content={"error": exc.errors()[0]["msg"]})

    if payload.region != "uk":
        return JSONResponse(
            status_code=501,
            content={"error": f"region '{payload.region}' not implemented yet"},
        )

    try:
        save_order_and_render(payload)
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(status_code=500, content={"error": f"generation failed: {exc}"})

    base = _public_base_url(request)
    return JSONResponse(
        status_code=200,
        content={"trackingUrl": f"{base}/track-and-verification/{payload.orderNumber}"},
    )


@app.get("/track-and-verification/{order_number}", response_class=HTMLResponse)
def get_tracking_page(order_number: str) -> HTMLResponse:
    html_path: Optional[Path] = GENERATED_DIR / order_number / "index.html"
    if not html_path or not html_path.exists():
        raise HTTPException(status_code=404, detail="tracking page not found")
    return HTMLResponse(html_path.read_text(encoding="utf-8"))


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def root_redirect_info() -> HTMLResponse:
    return HTMLResponse(
        "<!doctype html><meta charset='utf-8'>"
        "<title>tracking-service</title>"
        "<p>tracking-service is running. See <code>GET /health</code>, "
        "<code>POST /api/tracking/generate</code>.</p>"
    )


@app.exception_handler(HTTPException)
async def http_error_handler(_: Request, exc: HTTPException) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, content={"error": str(exc.detail)})


_ = FileResponse  # silence unused import in some linters
