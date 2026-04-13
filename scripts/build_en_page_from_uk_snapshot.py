# -*- coding: utf-8 -*-
"""
Собирает английскую страницу отзывов из UK-снапшота Trustpilot и подключает тот же
клиентский слой, что и у DE-версии (reviews-app.js).

Шаги:
  1) clone_page.clone_page — HTML + локальные assets в review-page/en/
  2) Замена бренда донора → One Shop / oneshops.co (как apply_review_text_replacements_en)
  3) Подстановка canonical / og:* для trustpilot.oneshops.co
  4) Вставка <script src="reviews-app.js?..."> перед </body>

Запуск из корня репозитория:
  python scripts/build_en_page_from_uk_snapshot.py
  python scripts/build_en_page_from_uk_snapshot.py --no-clone
"""
from __future__ import annotations

import argparse
import importlib.util
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from clone_page import clone_page  # noqa: E402

_spec = importlib.util.spec_from_file_location(
    "apply_review_text_replacements_en",
    ROOT / "review-page" / "tools" / "apply_review_text_replacements_en.py",
)
_mod = importlib.util.module_from_spec(_spec)
assert _spec.loader is not None
_spec.loader.exec_module(_mod)
brand_xform = _mod.xform

DEFAULT_UK_URL = "https://uk.trustpilot.com/review/highrollas.cc"
EN_DIR = ROOT / "review-page" / "en"
SCRIPT_VER = "20260414-uk-snapshot"
CANONICAL = "https://trustpilot.oneshops.co/"
OG_IMAGE = "https://trustpilot.oneshops.co/og-trust-card-one-shop.png?v=20260327"

DE_STARS = (
    ROOT
    / "review-page"
    / "assets"
    / "cdn.trustpilot.net"
    / "brand-assets"
    / "4.1.0"
    / "stars"
)

# Тот же локальный логотип, что и у DE-страницы (review-page/logo-oneshop.png).
LOGO_ONESHOP = "logo-oneshop.png"
_LOGO_PICTURE_HEADER_RE = re.compile(
    r'<picture class="business-profile-image_containmentWrapper__xJZjr profile-image_logo__UEQ4H" data-cpl="true">[\s\S]*?</picture>',
    re.IGNORECASE,
)
_LOGO_PICTURE_HTML = (
    '<picture class="business-profile-image_containmentWrapper__xJZjr profile-image_logo__UEQ4H" data-cpl="true">'
    f'<source srcset="{LOGO_ONESHOP}" type="image/avif"/>'
    f'<source srcset="{LOGO_ONESHOP}" type="image/jpeg"/>'
    f'<img alt="One Shop-Logo" class="business-profile-image_image__V14jr" src="{LOGO_ONESHOP}"/>'
    "</picture>"
)
# UK donor BU и One Shop BU в кеше consumersiteimages — любые <picture> с этими путями → logo-oneshop.png
_LOGO_BU_IDS_FOR_PICTURE = ("65a8f486fe59a0421a2a19f2", "64852503bdcb3cc9a772228c")
_TPD_S3_LOGO_RE = re.compile(
    r"https://s3-eu-west-1\.amazonaws\.com/tpd/logos/[a-f0-9]{24}/0x0\.png"
)
_TPD_S3_LOGO_REL_RE = re.compile(
    r"//s3-eu-west-1\.amazonaws\.com/tpd/logos/[a-f0-9]{24}/0x0\.png"
)


def ensure_logo_oneshop_png(en_out: Path) -> None:
    """Копирует logo-oneshop.png рядом с index.html (как на DE)."""
    src = ROOT / "review-page" / LOGO_ONESHOP
    if not src.is_file():
        print("Missing source logo:", src)
        return
    dest = en_out / LOGO_ONESHOP
    shutil.copy2(src, dest)
    print("Copied", LOGO_ONESHOP, "->", dest)


def _replace_picture_blocks_containing(html: str, needle: str) -> tuple[str, int]:
    """Только внутри одного <picture>...</picture>, без «захвата» соседней разметки."""
    out: list[str] = []
    pos = 0
    replaced = 0
    low = needle.lower()

    while True:
        start = html.lower().find("<picture", pos)
        if start < 0:
            out.append(html[pos:])
            break
        end = html.lower().find("</picture>", start)
        if end < 0:
            out.append(html[pos:])
            break
        end_close = end + len("</picture>")
        chunk = html[start:end_close]
        if low in chunk.lower():
            chunk = _LOGO_PICTURE_HTML
            replaced += 1
        out.append(html[pos:start])
        out.append(chunk)
        pos = end_close

    return "".join(out), replaced


def patch_logo_oneshop(html: str) -> str:
    """Картинка профиля и URL в данных — локальный logo-oneshop.png (как review-page/index.html)."""
    html, n = _LOGO_PICTURE_HEADER_RE.subn(_LOGO_PICTURE_HTML, html)
    if n:
        print("Replaced header business profile <picture> blocks:", n)
    for bu_id in _LOGO_BU_IDS_FOR_PICTURE:
        needle = f"{bu_id}-198x149"
        html, n2 = _replace_picture_blocks_containing(html, needle)
        if n2:
            print(f"Replaced <picture> blocks containing {needle[:20]}…:", n2)
    html = _TPD_S3_LOGO_RE.sub(LOGO_ONESHOP, html)
    html = _TPD_S3_LOGO_REL_RE.sub(LOGO_ONESHOP, html)
    return html


def sync_star_svgs_to_en(en_out: Path) -> None:
    """clone_page may not fetch every stars-N.svg; copy full set from DE snapshot."""
    dest = (
        en_out
        / "assets"
        / "cdn_trustpilot_net"
        / "brand-assets"
        / "4.1.0"
        / "stars"
    )
    if not DE_STARS.is_dir():
        return
    dest.mkdir(parents=True, exist_ok=True)
    for f in DE_STARS.glob("*.svg"):
        shutil.copy2(f, dest / f.name)
    print("Synced star SVGs ->", dest)


def inject_reviews_app(html: str) -> str:
    if "reviews-app.js" in html:
        return html
    tag = f'<script src="reviews-app.js?v={SCRIPT_VER}"></script>'
    if "</body>" in html:
        return html.replace("</body>", f"{tag}</body>", 1)
    return html + tag


def patch_meta(html: str) -> str:
    html = re.sub(
        r'<html\s+lang="[^"]*"',
        '<html lang="en-GB"',
        html,
        count=1,
    )

    def repl_canonical(m: re.Match[str]) -> str:
        return m.group(1) + CANONICAL + m.group(3)

    html = re.sub(
        r'(<link[^>]+rel="canonical"[^>]+href=")([^"]*)("[^>]*>)',
        repl_canonical,
        html,
        count=1,
    )

    def set_meta(pattern: str, value: str) -> None:
        nonlocal html
        html = re.sub(
            pattern,
            lambda m: m.group(1) + value + m.group(3),
            html,
            count=1,
        )

    set_meta(
        r'(<meta[^>]+property="og:url"[^>]+content=")([^"]*)("[^>]*>)',
        CANONICAL,
    )
    set_meta(
        r'(<meta[^>]+property="og:title"[^>]+content=")([^"]*)("[^>]*>)',
        "One Shop Reviews | Trustpilot",
    )
    set_meta(
        r'(<meta[^>]+property="og:description"[^>]+content=")([^"]*)("[^>]*>)',
        "Read customer service reviews for One Shop on Trustpilot.",
    )
    set_meta(
        r'(<meta[^>]+property="og:image"[^>]+content=")([^"]*)("[^>]*>)',
        OG_IMAGE,
    )
    set_meta(
        r'(<meta[^>]+name="twitter:image"[^>]+content=")([^"]*)("[^>]*>)',
        OG_IMAGE,
    )
    return html


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=DEFAULT_UK_URL)
    ap.add_argument("--out", type=Path, default=EN_DIR)
    ap.add_argument("--no-clone", action="store_true")
    args = ap.parse_args()
    out_dir = args.out.resolve()
    index_path = out_dir / "index.html"

    if not args.no_clone:
        print("Cloning", args.url, "->", out_dir)
        clone_page(args.url, out_dir)

    sync_star_svgs_to_en(out_dir)
    ensure_logo_oneshop_png(out_dir)

    if not index_path.is_file():
        print("Missing", index_path)
        sys.exit(1)

    raw = index_path.read_text(encoding="utf-8")
    raw = brand_xform(raw)
    raw = patch_logo_oneshop(raw)
    raw = patch_meta(raw)
    raw = inject_reviews_app(raw)
    index_path.write_text(raw, encoding="utf-8", newline="\n")
    print("Patched", index_path)


if __name__ == "__main__":
    main()
