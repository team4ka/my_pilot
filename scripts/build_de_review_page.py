# -*- coding: utf-8 -*-
"""
Собирает немецкую страницу отзывов (DE): клон Trustpilot + автозамена бренда в JSON и HTML.

Аналог по смыслу для деплоя: как `build_en_page_from_uk_snapshot.py` для UK/EN, но для DE-ветки
в `review-page/` (корень, не `evaluate/`).

Запуск из корня репозитория:

  python scripts/build_de_review_page.py
  python scripts/build_de_review_page.py --no-clone
  python scripts/build_de_review_page.py --url https://de.trustpilot.com/review/spliff.fr

Зависимости: pip install requests beautifulsoup4 (см. requirements в корне, если добавите).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

import requests

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from clone_page import TARGET_URL, clone_page  # noqa: E402

DE_OUT = ROOT / "review-page"
TOOL = ROOT / "review-page" / "tools" / "apply_review_text_replacements.py"


def run_replacements() -> None:
    """reviews.json + index.html — те же правила, что `apply_review_text_replacements.py`."""
    subprocess.run(
        [sys.executable, str(TOOL)],
        cwd=ROOT,
        check=True,
    )
    subprocess.run(
        [sys.executable, str(TOOL), "--html", "review-page/index.html"],
        cwd=ROOT,
        check=True,
    )


def main() -> None:
    parser = argparse.ArgumentParser(
        description="DE review page: clone Trustpilot + brand replacements (reviews.json + HTML)."
    )
    parser.add_argument(
        "--url",
        default=TARGET_URL,
        help=f"URL страницы компании (по умолчанию: {TARGET_URL})",
    )
    parser.add_argument(
        "--no-clone",
        action="store_true",
        help="Не клонировать, только автозамена (нужен уже существующий review-page/index.html).",
    )
    args = parser.parse_args()

    if not args.no_clone:
        out = DE_OUT
        parsed = urlparse(args.url)
        if "/evaluate/" in (parsed.path or ""):
            print(
                "Похоже, передан URL evaluate, а не страница отзывов. "
                "Нужен вид /review/<slug>, например:\n  " + TARGET_URL,
                file=sys.stderr,
            )
            sys.exit(1)
        print("Cloning ->", out)
        try:
            clone_page(args.url, out)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else "?"
            print(
                f"\nОшибка HTTP при клоне ({code}): Trustpilot часто отвечает 403 с IP датацентра (VPS).\n"
                "Варианты:\n"
                "  1) Запустите на своём ПК:  python scripts/build_de_review_page.py\n"
                "     Закоммитьте review-page/index.html и assets, сделайте push.\n"
                "     На сервере: git pull && python3 scripts/build_de_review_page.py --no-clone\n"
                "  2) Либо снова попробуйте сборку на сервере после git pull (улучшены заголовки запроса).\n",
                file=sys.stderr,
            )
            sys.exit(1)

    index_html = DE_OUT / "index.html"
    if not index_html.is_file():
        print("Нет файла:", index_html, file=sys.stderr)
        sys.exit(1)

    print("Running DE text replacements (reviews.json + index.html)...")
    run_replacements()
    print("Done. Open:", index_html.resolve())


if __name__ == "__main__":
    main()
