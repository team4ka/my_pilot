"""Replace donor Spliff branding with One Shop on DE evaluate page."""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "review-page" / "evaluate" / "index.html"

OLD_LOGO = (
    'src="https://s3-eu-west-1.amazonaws.com/tpd/logos/'
    '65a8f486fe59a0421a2a19f2/0x0.png"'
)
NEW_LOGO = 'src="../logo-oneshop.png"'


def main() -> None:
    html = TARGET.read_text(encoding="utf-8")
    orig = html

    html = html.replace("<title>Spliff bewerten</title>", "<title>One Shop bewerten</title>")
    html = html.replace(OLD_LOGO, NEW_LOGO)
    html = html.replace("spliff.fr", "oneshops.de")
    html = html.replace("Spliff", "One Shop")
    # JSON may use // URL for image
    html = html.replace(
        '"imageUrl":"//s3-eu-west-1.amazonaws.com/tpd/logos/65a8f486fe59a0421a2a19f2/0x0.png"',
        '"imageUrl":"../logo-oneshop.png"',
    )
    html = html.replace('"websiteUrl":"https://spliff.fr"', '"websiteUrl":"https://oneshops.de"')

    if html == orig:
        raise SystemExit("No changes applied (already patched?)")

    TARGET.write_text(html, encoding="utf-8", newline="\n")
    print(f"Patched {TARGET.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
