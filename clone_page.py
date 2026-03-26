import argparse
import hashlib
import mimetypes
import posixpath
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse, urlunparse

import requests
from bs4 import BeautifulSoup

# Defaults (overridden by CLI)
TARGET_URL = "https://de.trustpilot.com/review/spliff.fr"
OUT_DIR = Path("review-page")
ASSETS_DIR = OUT_DIR / "assets"

USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/123.0.0.0 Safari/537.36"
)

session = requests.Session()
session.headers.update({"User-Agent": USER_AGENT})

# url -> relative local path (from OUT_DIR)
url_map: dict[str, str] = {}


def normalize_url(url: str, base_url: str) -> str:
    full = urljoin(base_url, url.strip())
    parsed = urlparse(full)
    parsed = parsed._replace(fragment="")
    return urlunparse(parsed)


def build_local_asset_path(url: str, content_type: str | None) -> Path:
    parsed = urlparse(url)
    host = parsed.netloc.replace(":", "_").replace(".", "_")  # Keitaro rejects dots in paths
    path = parsed.path or "/"

    if path.endswith("/"):
        path = f"{path}index"

    suffix = Path(path).suffix
    if not suffix:
        guessed = mimetypes.guess_extension((content_type or "").split(";")[0].strip() or "")
        suffix = guessed or ".bin"
        path = f"{path}{suffix}"

    safe_path = Path(path.lstrip("/"))
    query = parsed.query
    if query:
        digest = hashlib.sha1(query.encode("utf-8")).hexdigest()[:10]
        safe_path = safe_path.with_name(f"{safe_path.stem}-{digest}{safe_path.suffix}")

    return Path("assets") / host / safe_path


def local_ref(from_file: Path, target_relative_to_out: Path) -> str:
    rel = posixpath.relpath(
        target_relative_to_out.as_posix(),
        from_file.parent.as_posix() if from_file.parent.as_posix() else ".",
    )
    return rel


def download_asset(url: str, referer: str) -> Path | None:
    if url in url_map:
        return Path(url_map[url])

    try:
        resp = session.get(url, timeout=30, headers={"Referer": referer})
        resp.raise_for_status()
    except Exception:
        return None

    local_rel = build_local_asset_path(url, resp.headers.get("content-type"))
    local_abs = OUT_DIR / local_rel
    local_abs.parent.mkdir(parents=True, exist_ok=True)
    local_abs.write_bytes(resp.content)
    url_map[url] = local_rel.as_posix()
    return local_rel


URL_FUNC_RE = re.compile(r"url\((['\"]?)(.*?)\1\)")
IMPORT_RE = re.compile(r"@import\s+(?:url\()?['\"](.*?)['\"]\)?")


def rewrite_css(css_text: str, css_url: str, css_local_rel: Path) -> str:
    def replace_url(match: re.Match) -> str:
        raw = match.group(2).strip()
        if not raw or raw.startswith("data:"):
            return match.group(0)
        abs_url = normalize_url(raw, css_url)
        local_rel = download_asset(abs_url, css_url)
        if not local_rel:
            return match.group(0)
        ref = local_ref(css_local_rel, local_rel)
        quote = match.group(1) or ""
        return f"url({quote}{ref}{quote})"

    out = URL_FUNC_RE.sub(replace_url, css_text)

    def replace_import(match: re.Match) -> str:
        raw = match.group(1).strip()
        if not raw or raw.startswith("data:"):
            return match.group(0)
        abs_url = normalize_url(raw, css_url)
        local_rel = download_asset(abs_url, css_url)
        if not local_rel:
            return match.group(0)
        ref = local_ref(css_local_rel, local_rel)
        return f'@import "{ref}"'

    return IMPORT_RE.sub(replace_import, out)


def process_css_assets() -> None:
    # Rewrite downloaded CSS files once assets are present
    for url, rel in list(url_map.items()):
        rel_path = Path(rel)
        if rel_path.suffix.lower() != ".css":
            continue
        css_abs = OUT_DIR / rel_path
        if not css_abs.exists():
            continue
        try:
            css_text = css_abs.read_text(encoding="utf-8")
        except UnicodeDecodeError:
            try:
                css_text = css_abs.read_text(encoding="latin-1")
            except Exception:
                continue
        rewritten = rewrite_css(css_text, url, rel_path)
        css_abs.write_text(rewritten, encoding="utf-8")


def rewrite_attr_urls(soup: BeautifulSoup, page_url: str) -> None:
    attr_pairs = [
        ("link", "href"),
        ("script", "src"),
        ("img", "src"),
        ("source", "src"),
        ("video", "src"),
        ("audio", "src"),
        ("iframe", "src"),
    ]
    for tag_name, attr in attr_pairs:
        for tag in soup.find_all(tag_name):
            val = tag.get(attr)
            if not val or val.startswith("data:") or val.startswith("javascript:"):
                continue
            abs_url = normalize_url(val, page_url)
            local_rel = download_asset(abs_url, page_url)
            if not local_rel:
                continue
            tag[attr] = local_ref(Path("index.html"), local_rel)

    # srcset attributes
    for tag in soup.find_all(attrs={"srcset": True}):
        srcset = tag.get("srcset")
        if not srcset:
            continue
        parts = []
        for item in [x.strip() for x in srcset.split(",")]:
            if not item:
                continue
            seg = item.split()
            raw_url = seg[0]
            descriptor = " ".join(seg[1:])
            abs_url = normalize_url(raw_url, page_url)
            local_rel = download_asset(abs_url, page_url)
            if local_rel:
                new_url = local_ref(Path("index.html"), local_rel)
            else:
                new_url = raw_url
            parts.append(f"{new_url} {descriptor}".strip())
        tag["srcset"] = ", ".join(parts)


def clone_page(target_url: str, out_dir: Path) -> None:
    global OUT_DIR, ASSETS_DIR, url_map
    OUT_DIR = Path(out_dir)
    ASSETS_DIR = OUT_DIR / "assets"
    url_map = {}

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    ASSETS_DIR.mkdir(parents=True, exist_ok=True)

    resp = session.get(target_url, timeout=30)
    resp.raise_for_status()
    html = resp.text

    soup = BeautifulSoup(html, "html.parser")
    rewrite_attr_urls(soup, target_url)

    # Keep canonical for attribution/source
    canonical = soup.find("link", rel=lambda x: x and "canonical" in x)
    if canonical and canonical.get("href"):
        canonical["href"] = target_url

    index_path = OUT_DIR / "index.html"
    index_path.write_text(str(soup), encoding="utf-8")

    process_css_assets()

    # Basic attribution notice file
    (OUT_DIR / "SOURCE.txt").write_text(
        "Source URL:\n"
        f"{target_url}\n\n"
        "This local snapshot is for study/modification purposes.\n"
        "Respect original website Terms of Service and copyright.\n",
        encoding="utf-8",
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Clone a webpage for local use or Keitaro landing")
    parser.add_argument("url", nargs="?", default=TARGET_URL, help="URL to clone")
    parser.add_argument("-o", "--out", default=None, help="Output directory (default: derived from URL)")
    args = parser.parse_args()
    url = args.url
    if args.out:
        out = Path(args.out)
    else:
        # Derive folder name from URL (e.g. xbyx.de/blogs/magazin/stress-abbauen -> stress-abbauen)
        parsed = urlparse(url)
        name = Path(parsed.path).name or parsed.netloc.replace(".", "_")
        out = Path(name) if name else Path("cloned")
    clone_page(url, out)
    print(f"Done. Open: {(OUT_DIR / 'index.html').resolve()}")
