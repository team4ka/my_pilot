"""
Strip executable scripts and tracking iframes from review-page/evaluate/index.html
so the page renders as static HTML/CSS only (no Next hydration, reCAPTCHA loops, telemetry).

Keeps: stylesheets, __NEXT_DATA__ (application/json), evaluate-local.css + evaluate-local.js
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup
except ImportError:
    print("Need: pip install beautifulsoup4", file=sys.stderr)
    sys.exit(1)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_PATH = ROOT / "review-page" / "evaluate" / "index.html"

# Third-party iframes → endless requests / blocking on localhost
def clean_evaluate_form_snapshot(soup: BeautifulSoup) -> None:
    """Убрать тестовый текст из снимка; сброс звёзд до «пусто» (без гидрации React)."""
    ta = soup.find("textarea", id="review-text")
    if ta is not None:
        ta.clear()
    tit = soup.find("input", id="review-title")
    if tit is not None:
        tit["value"] = ""
    for inp in soup.find_all("input", attrs={"name": "star-selector"}):
        if inp.has_attr("checked"):
            del inp["checked"]
    for img in soup.find_all("img"):
        src = img.get("src") or ""
        if "/stars/stars-" in src and "trustpilot" in src:
            img["src"] = re.sub(r"stars-\d+\.svg", "stars-0.svg", src)


IFRAME_BLOCK_SUBSTR = (
    "google.com",
    "gstatic.com",
    "facebook.com",
    "fbcdn.net",
    "doubleclick.net",
    "googletagmanager.com",
    "recaptcha",
    "hcaptcha",
    "hotjar.com",
    "segment.com",
    "segment.io",
)


def apply_static_snapshot(path: Path) -> None:
    html = path.read_text(encoding="utf-8")
    soup = BeautifulSoup(html, "html.parser")

    # --- scripts ---
    for script in list(soup.find_all("script")):
        src = script.get("src") or ""
        if "evaluate-local.js" in src:
            continue
        if src:
            script.decompose()
            continue
        typ = (script.get("type") or "").lower()
        if typ == "application/json" or typ == "application/ld+json":
            continue
        script.decompose()

    # --- iframes ---
    for iframe in list(soup.find_all("iframe")):
        src = iframe.get("src") or ""
        if any(b in src for b in IFRAME_BLOCK_SUBSTR):
            iframe.decompose()

    # --- preload/prefetch scripts & noisy prefetches ---
    for link in list(soup.find_all("link")):
        rel = " ".join(link.get("rel") or []).lower()
        href = link.get("href") or ""
        if link.get("as") == "script":
            link.decompose()
            continue
        if "prefetch" in rel or "preload" in rel:
            if any(
                x in href
                for x in (
                    "segment",
                    "hotjar",
                    "googleads",
                    "doubleclick",
                    "facebook",
                    "googletagmanager",
                    "analytics",
                )
            ):
                link.decompose()

    head = soup.head
    body = soup.body
    # Убрать старые evaluate-local (часто BS4 склеивает link+script в невалидный </link>)
    for tag in list(soup.find_all(["link", "script"])):
        href = tag.get("href") or ""
        src = tag.get("src") or ""
        if "evaluate-local.css" in href or "evaluate-local.js" in src:
            tag.decompose()
    if head:
        link = soup.new_tag("link", rel="stylesheet", href="evaluate-local.css")
        head.append(link)
    if body:
        body.append(soup.new_tag("script", src="evaluate-local.js"))

    clean_evaluate_form_snapshot(soup)

    out = str(soup)
    out = out.replace("</link>", "")
    # BeautifulSoup may drop some minified quirks; ensure doctype
    if not out.lstrip().lower().startswith("<!doctype"):
        out = "<!DOCTYPE html>\n" + out
    path.write_text(out, encoding="utf-8")
    print(f"Static snapshot written: {path}")


def main() -> None:
    p = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not p.is_file():
        print(f"Not found: {p}", file=sys.stderr)
        sys.exit(1)
    apply_static_snapshot(p)


if __name__ == "__main__":
    main()
