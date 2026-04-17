"""Generate tracking pages from a samples file without running the API.

Usage:
    python tracking_service/cli_generate.py
    python tracking_service/cli_generate.py path/to/orders.json

The output goes to `tracking_service/data/generated/<orderNumber>/index.html`.
Each generated page references static assets via `/static/...` paths, so links
will only resolve when served by the FastAPI app:

    uvicorn tracking_service.app:app --reload --port 8088

Then open:  http://127.0.0.1:8088/track-and-verification/ORD-2026-0416-058
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from tracking_service.generator import save_order_and_render  # noqa: E402
from tracking_service.models import OrderPayload  # noqa: E402


def _load_samples(path: Path) -> list[dict]:
    with path.open("r", encoding="utf-8") as f:
        raw = json.load(f)
    if isinstance(raw, dict):
        return [raw]
    if isinstance(raw, list):
        return raw
    raise SystemExit(f"Unsupported samples format in {path}: expected list or object")


def main(argv: list[str]) -> int:
    samples_path = Path(argv[1]) if len(argv) > 1 else HERE / "samples" / "sample_orders.json"
    if not samples_path.exists():
        print(f"Samples file not found: {samples_path}", file=sys.stderr)
        return 2

    orders = _load_samples(samples_path)
    if not orders:
        print("No orders to generate.", file=sys.stderr)
        return 1

    for item in orders:
        payload = OrderPayload.model_validate(item)
        if payload.region != "uk":
            print(f"Skipping {payload.orderNumber}: region '{payload.region}' not implemented yet.")
            continue
        generated = save_order_and_render(payload)
        print(f"Generated: {generated.html_path}")

    print("\nDone. Run the API to preview:")
    print("  uvicorn tracking_service.app:app --reload --port 8088")
    print("Then open: http://127.0.0.1:8088/track-and-verification/<orderNumber>")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
