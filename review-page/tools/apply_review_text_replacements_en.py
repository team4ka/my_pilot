# -*- coding: utf-8 -*-
"""
Заменяет Highrollas → One Shop и highrollas.cc → oneshops.co в данных английской версии.

Использование:
  python review-page/tools/apply_review_text_replacements_en.py              # review-page/en/reviews.json
  python review-page/tools/apply_review_text_replacements_en.py path.json
  python review-page/tools/apply_review_text_replacements_en.py --html review-page/en/index.html
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]  # review-page/


REPL: list[tuple[re.Pattern[str], str]] = [
    # Domain first, then name.
    (re.compile(r"(?i)\bwww\.highrollas\.cc\b"), "oneshops.co"),
    (re.compile(r"(?i)\bhighrollas\.cc\b"), "oneshops.co"),
    # Опечатки и сокращения к «High Rollas» (донор UK).
    (re.compile(r"(?i)\bhighrollaz\b"), "One Shop"),
    (re.compile(r"(?i)\bhighrollers\b"), "One Shop"),
    (re.compile(r"(?i)\bhigh\s+rolls\b"), "One Shop"),
    (re.compile(r"(?i)\bhigh\s*rollas\b"), "One Shop"),
    (re.compile(r"(?i)\bhighrollas\b"), "One Shop"),
    # Some reviews include a branded string with emoji stars directly after the name.
    (re.compile(r"(?i)high rollas(?=⭐)"), "One Shop"),
    (re.compile(r"\bHR\b"), "One Shop"),
]

# После подстановки «One Shop» — мелкая грамматика.
POST_REPL: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"with One Shop been\b"), "with One Shop has been"),
    (re.compile(r"\bOne Shop are a highly\b"), "One Shop is a highly"),
    (re.compile(r"from One Shop end\b"), "from One Shop's end"),
]


def xform(s: str) -> str:
    if not isinstance(s, str) or not s:
        return s
    out = s
    for pat, repl in REPL:
        out = pat.sub(repl, out)
    for pat, repl in POST_REPL:
        out = pat.sub(repl, out)
    return out


def xform_company_reply(cr: dict) -> int:
    n = 0
    if not cr or not isinstance(cr, dict):
        return n
    for key, val in list(cr.items()):
        if isinstance(val, str):
            newv = xform(val)
            if newv != val:
                cr[key] = newv
                n += 1
    return n


def transform_reviews_json(path: Path) -> None:
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    n = 0
    for rev in data:
        for key in ("title", "text", "consumerName"):
            if key in rev and isinstance(rev[key], str):
                newv = xform(rev[key])
                if newv != rev[key]:
                    n += 1
                rev[key] = newv
        for key in ("consumerProfileUrl", "reviewUrl"):
            if key in rev and isinstance(rev[key], str):
                newv = xform(rev[key])
                if newv != rev[key]:
                    n += 1
                rev[key] = newv
        n += xform_company_reply(rev.get("companyReply") or {})
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("reviews.json:", path.as_posix(), "updated_fields", n, "reviews", len(data))


def transform_html_file(path: Path) -> None:
    raw = path.read_text(encoding="utf-8")
    out = xform(raw)
    path.write_text(out, encoding="utf-8", newline="\n")
    print("html:", path.as_posix(), "updated")


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--html"]
    html_mode = "--html" in sys.argv[1:]
    if html_mode:
        p = Path(args[0]) if args else ROOT / "en" / "index.html"
        if not p.is_file():
            print("missing", p)
            sys.exit(1)
        transform_html_file(p.resolve())
        return

    rel = args[0] if args else str(ROOT / "en" / "reviews.json")
    path = Path(rel)
    if not path.is_absolute():
        path = (ROOT / "en" / rel).resolve() if (ROOT / "en" / rel).is_file() else Path(rel).resolve()
    if not path.is_file():
        print("missing", path)
        sys.exit(1)
    transform_reviews_json(path)


if __name__ == "__main__":
    main()

