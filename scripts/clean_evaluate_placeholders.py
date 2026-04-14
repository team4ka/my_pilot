import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGETS = [
    ROOT / "review-page" / "evaluate" / "index.html",
    ROOT / "review-page" / "en" / "evaluate" / "index.html",
]


def remove_recaptcha_disclaimer(html: str) -> tuple[str, int]:
    # Remove the visible reCAPTCHA disclaimer paragraph shown under the stars.
    return re.subn(
        r'<p\b[^>]*\brecaptcha-disclaimer-row_recaptchaDisclaimer__[^"\s>]+[^>]*>.*?</p>',
        "",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )


def clear_test_prefills(html: str) -> tuple[str, int]:
    changed = 0

    # Clear highlight overlay contents for review textarea.
    html, n = re.subn(
        r'(<div\b[^>]*\bclass="[^"]*\bhighlight-input_highlights__[^"]*\breview-row-v2_highlightInner__[^"]*"[^>]*>)([^<]*)(</div>)',
        r"\1\3",
        html,
        flags=re.IGNORECASE,
    )
    changed += n

    # Clear highlight overlay contents for title input.
    html, n = re.subn(
        r'(<div\b[^>]*\bclass="[^"]*\bhighlight-input_highlights__[^"]*\btitle-row-v2_highlightInner__[^"]*"[^>]*>)([^<]*)(</div>)',
        r"\1\3",
        html,
        flags=re.IGNORECASE,
    )
    changed += n

    # Clear textarea initial value (e.g., "Test — lokaler Snapshot").
    html, n = re.subn(
        r'(<textarea\b[^>]*\bdata-review-text-input="true"[^>]*>)(.*?)(</textarea>)',
        r"\1\3",
        html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    changed += n

    # Clear title input value (e.g., value="Test").
    html, n = re.subn(
        r'(<input\b[^>]*\bid="review-title"[^>]*\bvalue=")([^"]*)(")',
        r"\1\3",
        html,
        flags=re.IGNORECASE,
    )
    changed += n

    # Clear any stray "Test — ..." markers that may remain.
    html2 = html.replace("Test — lokaler Snapshot", "").replace("Test — local snapshot", "")
    if html2 != html:
        changed += 1
        html = html2

    return html, changed


def main() -> None:
    total = 0
    for p in TARGETS:
        src = p.read_text(encoding="utf-8")
        html = src

        html, n1 = remove_recaptcha_disclaimer(html)
        html, n2 = clear_test_prefills(html)

        if html != src:
            p.write_text(html, encoding="utf-8", newline="\n")
        print(f"{p.relative_to(ROOT)}: removed={n1} cleared={n2} changed={html != src}")
        total += (1 if html != src else 0)

    if total == 0:
        raise SystemExit("No changes made.")


if __name__ == "__main__":
    main()

