# -*- coding: utf-8 -*-
"""
Замены в текстах отзывов: Spliff → One Shop; THC-X/THCX/CBD/… → THC с правками смысла где нужно.
Использование:
  python tools/apply_review_text_replacements.py              # review-page/reviews.json
  python tools/apply_review_text_replacements.py reviews.json
  python tools/apply_review_text_replacements.py --html index.html
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


# Целые фразы — до общих замен CBD/THCX (иначе смысл ломается).
PHRASE_FIXES: list[tuple[str, str]] = [
    (
        "Außerdem möchte ich daran erinnern, dass CBD in erster Linie eine entspannende und keine psychoaktive Wirkung hat. Wenn Sie eine stärkere Alternative bevorzugen, empfehlen wir Ihnen unsere THCX-Produktreihe.",
        "Außerdem möchte ich darauf hinweisen, dass die spürbare Wirkung je nach Sorte, Zubereitung und Dosierung stark variieren kann. Wenn Sie eine intensivere Wirkung anstreben, empfehlen wir Ihnen unsere höher dosierten THC-Sorten oder die Magic-Vape-Linie.",
    ),
    (
        "Nehme unter ärztlicher Aufsicht und Empfehlung eine Kombi von 2 Medikamente und CBD und THC.",
        "Nehme unter ärztlicher Aufsicht und Empfehlung eine Kombi aus verschreibungspflichtigen Medikamenten und THC.",
    ),
]


def fix_thc_artifacts(s: str) -> str:
    """После замен THCX→THC и т.д.: убрать тавтологии и оборванные формулировки."""
    # Kundenstimme: nicht „unser Sortiment“ (das wäre Händlerperspektive)
    s = re.sub(
        r"Die THC Alternative [\"„“']THC[\"“']",
        "Das THC-Gras",
        s,
        flags=re.IGNORECASE,
    )
    s = re.sub(r"\bTHC und THC\b", "THC", s)
    s = re.sub(r"\bTHC,\s*THC\b", "THC", s)
    s = re.sub(r"\bTHC\s+/\s*THC\b", "THC", s)
    return s


def xform(s: str) -> str:
    if not isinstance(s, str) or not s:
        return s
    for old, new in PHRASE_FIXES:
        s = s.replace(old, new)
    s = s.replace("info@spliff.fr", "info@oneshop.de")
    s = s.replace("spliff.fr", "oneshop.de")
    s = s.replace("Spliffsupport", "One Shop Support")
    s = s.replace("Spliffstore", "One Shop Store")
    # spliffstore (klein) vor „spliff“ → sonst „One Shopstore“
    s = re.sub(r"(?i)spliffstore\.de", "__SPLIFFSTORE_DE__", s)
    s = re.sub(r"(?i)spliffstore", "One Shop Store", s)
    s = s.replace("__SPLIFFSTORE_DE__", "spliffstore.de")
    s = s.replace("Spliff-Team", "One Shop Team")
    s = s.replace("Spliff-team", "One Shop team")
    s = s.replace("spliff-team", "One Shop team")
    s = s.replace("SPLIFF", "One Shop")
    s = s.replace("Spliff", "One Shop")
    s = s.replace("spliff", "One Shop")
    # THC-X (включая дефис и пробел)
    s = re.sub(r"(?i)thc\s*[-–]?\s*x", "THC", s)
    # THCX / thcx
    s = re.sub(r"\bTHCX\b", "THC", s)
    s = re.sub(r"\bTHCx\b", "THC", s)
    s = re.sub(r"\bthcx\b", "THC", s)
    # THCA
    s = re.sub(r"\bTHCa\b", "THC", s)
    s = re.sub(r"\bTHCA\b", "THC", s)
    s = re.sub(r"\bthca\b", "THC", s)
    # CBD
    s = re.sub(r"\bCBD\b", "THC", s)
    s = re.sub(r"\bCbd\b", "THC", s)
    s = re.sub(r"\bcbd\b", "THC", s)
    s = re.sub(r"\bTHA\b", "THC", s)
    # Прочие каннабиноиды по запросу
    for pat in (r"\bCBG\b", r"\bCBN\b", r"\bHHC\b"):
        s = re.sub(pat, "THC", s, flags=re.IGNORECASE)
    s = fix_thc_artifacts(s)
    return s


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
        for key in ("title", "text"):
            if key in rev and isinstance(rev[key], str):
                newv = xform(rev[key])
                if newv != rev[key]:
                    n += 1
                rev[key] = newv
        n += xform_company_reply(rev.get("companyReply") or {})
    with path.open("w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print("reviews.json: updated_fields", n, "reviews", len(data))


def protect_spliff_urls(html: str) -> tuple[str, list[str]]:
    kept: list[str] = []

    def save(u: str) -> str:
        if "spliff" not in u.lower():
            return u
        i = len(kept)
        kept.append(u)
        return f"__SPLIFFPROT{i}__"

    def repl(m: re.Match[str]) -> str:
        return save(m.group(0))

    out = re.sub(r"https?://[^\s\"'<>]+", repl, html, flags=re.I)
    out = re.sub(
        r"[a-zA-Z0-9._/-]*trustpilot\.com[a-zA-Z0-9._/?&#=;%+!-]*spliff[a-zA-Z0-9._/?&#=;%+!-]*",
        repl,
        out,
        flags=re.I,
    )
    out = re.sub(
        r"https://www\.trustpilot\.com/#/schema/[^\"'\s<>]+",
        repl,
        out,
        flags=re.I,
    )
    return out, kept


def unprotect_spliff_urls(html: str, kept: list[str]) -> str:
    for i, u in enumerate(kept):
        html = html.replace(f"__SPLIFFPROT{i}__", u)
    return html


def fix_broken_similar_bu_avif_srcset(html: str) -> tuple[str, int]:
    """AVIF-<source> wurde zu „logo-oneshop.png, …2x.avif“ — Browser zeigt dann One-Shop-Logo."""
    broken = re.compile(
        r'srcset="logo-oneshop\.png,\s*(assets/consumersiteimages\.trustpilot\.net/business-units/([a-f0-9]+)-198x149-2x\.avif)\s+2x"'
    )

    def repl(m: re.Match[str]) -> str:
        bu_id = m.group(2)
        base = f"assets/consumersiteimages.trustpilot.net/business-units/{bu_id}-198x149"
        return f'srcset="{base}-1x.avif, {base}-2x.avif 2x"'

    return broken.subn(repl, html)


def fix_mangled_shopstore_paths(html: str) -> str:
    """spliff → One Shop in „spliffstore“ erzeugt kaputte Slugs und Fließtext."""
    html = html.replace('href="/review/One Shopstore.de"', 'href="/review/spliffstore.de"')
    html = html.replace("One Shopstore", "One Shop Store")
    return html


def transform_html_file(path: Path) -> None:
    raw = path.read_text(encoding="utf-8")
    prot, kept = protect_spliff_urls(raw)
    out = xform(prot)
    out = unprotect_spliff_urls(out, kept)
    out, n_avif = fix_broken_similar_bu_avif_srcset(out)
    out = fix_mangled_shopstore_paths(out)
    path.write_text(out, encoding="utf-8", newline="\n")
    print("html:", path.name, "placeholders", len(kept), "fixed_avif_srcsets", n_avif)


def main() -> None:
    args = [a for a in sys.argv[1:] if a != "--html"]
    html_mode = "--html" in sys.argv[1:]
    if html_mode:
        p = Path(args[0]) if args else ROOT / "index.html"
        if not p.is_file():
            print("missing", p)
            sys.exit(1)
        transform_html_file(p.resolve())
        return
    rel = args[0] if args else "reviews.json"
    path = Path(rel)
    if not path.is_absolute():
        path = (ROOT / rel).resolve() if (ROOT / rel).is_file() else Path(rel).resolve()
    if not path.is_file():
        print("missing", path)
        sys.exit(1)
    transform_reviews_json(path)


if __name__ == "__main__":
    main()
