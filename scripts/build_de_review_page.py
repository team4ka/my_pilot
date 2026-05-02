# -*- coding: utf-8 -*-
"""
Немецкая страница отзывов (DE): автозамена бренда в review-page/reviews.json и review-page/index.html.

Как у UK/EN: снимок страницы лежит в репозитории (review-page/…), деплой = git pull.
Скрипт нужен, когда меняете правила замен или пересобираете тексты — не для скачивания с Trustpilot.

  python scripts/build_de_review_page.py

Редко — заново стянуть HTML с Trustpilot (часто 403, не обязательно для прод):

  python scripts/build_de_review_page.py --clone
  python scripts/build_de_review_page.py --clone --url https://de.trustpilot.com/review/spliff.fr

Зависимости для --clone: pip install requests beautifulsoup4
Для обычного запуска достаточно стандартного Python (subprocess к tools).
"""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

DE_OUT = ROOT / "review-page"
INDEX_HTML = DE_OUT / "index.html"
TOOL = ROOT / "review-page" / "tools" / "apply_review_text_replacements.py"


def run_replacements() -> None:
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
        description="DE review page: brand replacements in reviews.json + index.html (files from repo)."
    )
    parser.add_argument(
        "--clone",
        action="store_true",
        help="Опционально: скачать свежий снимок с Trustpilot в review-page/ (часто 403). Без флага — только замены.",
    )
    parser.add_argument(
        "--url",
        default="https://de.trustpilot.com/review/spliff.fr",
        help="URL для --clone (по умолчанию DE review spliff.fr).",
    )
    args = parser.parse_args()

    if args.clone:
        import requests

        from clone_page import clone_page

        parsed = urlparse(args.url)
        if "/evaluate/" in (parsed.path or ""):
            print(
                "Нужен URL вида /review/<slug>, не /evaluate/. Пример:\n"
                "  https://de.trustpilot.com/review/spliff.fr",
                file=sys.stderr,
            )
            sys.exit(1)
        print("Cloning ->", DE_OUT)
        try:
            clone_page(args.url, DE_OUT)
        except requests.HTTPError as e:
            code = e.response.status_code if e.response is not None else "?"
            print(
                f"\nHTTP {code} при клоне. Trustpilot часто блокирует автозапросы (и с VPS, и с ПК).\n"
                "Для прода не нужно: держите снимок в git и запускайте скрипт без --clone.\n",
                file=sys.stderr,
            )
            sys.exit(1)

    if not INDEX_HTML.is_file():
        print(
            "Нет файла:\n  " + str(INDEX_HTML) + "\n"
            "Добавьте в репозиторий снимок страницы отзывов (как review-page/en/ для UK).\n"
            "Либо один раз попробуйте:  python scripts/build_de_review_page.py --clone",
            file=sys.stderr,
        )
        sys.exit(1)

    print("Running DE text replacements (reviews.json + index.html)...")
    run_replacements()
    print("Done. Open:", INDEX_HTML.resolve())


if __name__ == "__main__":
    main()
