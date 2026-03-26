"""Save a local snapshot of the Trustpilot „Bewertung abgeben“ page with review form + email login step.

Default: visible Chromium (set HEADLESS=1 for no window).
After auto-accept cookies, waits COOKIE_MANUAL_SEC so you can click the banner if needed.
Before save, OneTrust banner nodes are removed from the DOM so the snapshot has no cookie UI.
"""
import asyncio
import os
import re
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from playwright.async_api import async_playwright

EVALUATE_URL = "https://de.trustpilot.com/evaluate/spliff.fr"
OUT_DIR = Path("review-page/evaluate")

LOCAL_ASSETS_SNIPPET = (
    '<link rel="stylesheet" href="evaluate-local.css"/>'
    '<script src="evaluate-local.js"></script>'
)

HEADLESS = os.environ.get("HEADLESS", "0").strip().lower() in ("1", "true", "yes")
# Seconds (headed only): time to manually accept cookies if auto-click missed.
COOKIE_MANUAL_SEC = int(os.environ.get("COOKIE_MANUAL_SEC", "18"))


async def accept_cookies(page) -> None:
    """Try to accept OneTrust (and similar) several times."""
    for attempt in range(6):
        clicked = False
        for sel in (
            "#onetrust-accept-btn-handler",
            "button#onetrust-accept-btn-handler",
            "#accept-recommended-btn-handler",
        ):
            try:
                loc = page.locator(sel).first
                if await loc.is_visible(timeout=800):
                    await loc.click(timeout=5000)
                    clicked = True
                    await asyncio.sleep(0.8)
                    break
            except Exception:
                pass
        if clicked:
            continue
        try:
            btn = page.get_by_role("button", name=re.compile(r"alle\s+akzeptieren|accept\s+all", re.I))
            if await btn.first.is_visible(timeout=500):
                await btn.first.click(timeout=5000)
                await asyncio.sleep(0.8)
        except Exception:
            pass
        await asyncio.sleep(0.6)


def inject_evaluate_local_assets(html: str) -> str:
    """Link evaluate-local.css/js so local viewing matches trustpilot.com (3 SSO buttons, de, no auto-translate)."""
    if "evaluate-local.css" in html:
        return html
    if "</head>" not in html:
        return html
    return html.replace("</head>", LOCAL_ASSETS_SNIPPET + "</head>", 1)


async def remove_cookie_ui_from_dom(page) -> None:
    """Remove cookie banner / overlay nodes before serializing HTML."""
    await page.evaluate(
        """() => {
  const selectors = [
    '#onetrust-consent-sdk',
    '#onetrust-banner-sdk',
    '#onetrust-pc-sdk',
    '.onetrust-pc-dark-filter',
    '.otFlat',
    '.otPcCenter',
    '.ot-floating-button',
    '#ot-sdk-btn-floating',
  ];
  selectors.forEach((s) => {
    document.querySelectorAll(s).forEach((el) => el.remove());
  });
  document.querySelectorAll('[id^="onetrust"]').forEach((el) => el.remove());
  document.body.style.overflow = '';
  document.documentElement.style.overflow = '';
}"""
    )


async def capture():
    OUT_DIR.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 900},
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
            ),
            locale="de-DE",
        )
        page = await context.new_page()

        mode = "headless" if HEADLESS else "browser window (you can accept cookies manually)"
        print(f"Mode: {mode}\nOpening {EVALUATE_URL} …")

        await page.goto(EVALUATE_URL, wait_until="networkidle", timeout=120000)

        await accept_cookies(page)

        if not HEADLESS and COOKIE_MANUAL_SEC > 0:
            print(
                f"Pause {COOKIE_MANUAL_SEC}s: if cookie banner is still visible, click “Alle akzeptieren” in the browser."
            )
            await asyncio.sleep(COOKIE_MANUAL_SEC)

        await accept_cookies(page)

        try:
            star5 = page.locator("[data-star-selector-star-5]")
            await star5.wait_for(state="visible", timeout=20000)
            await star5.click()
            print("Clicked 5 stars.")
            await asyncio.sleep(2.5)
        except Exception as e:
            print(f"Stars: {e}")

        try:
            await page.wait_for_selector("textarea", timeout=20000)
            await asyncio.sleep(1)
        except Exception:
            pass

        # Лёгкий текст — иногда следующий шаг (логин по email) появляется после ввода
        try:
            ta = page.locator("textarea").first
            if await ta.is_visible(timeout=3000):
                await ta.fill("Test — lokaler Snapshot", timeout=5000)
                await asyncio.sleep(0.5)
        except Exception:
            pass

        # Кнопки «Далее» / отправка черновика
        for name_pat in (r"weiter|fortfahren|next", r"einreichen|absenden|submit"):
            try:
                b = page.get_by_role("button", name=re.compile(name_pat, re.I)).first
                if await b.is_visible(timeout=1500):
                    await b.click()
                    await asyncio.sleep(2)
            except Exception:
                pass

        # Ждём поле email (форма входа по почте)
        try:
            await page.wait_for_selector(
                'input[type="email"], input[name*="email" i], input[autocomplete="email"], input[id*="email" i]',
                timeout=25000,
            )
            print("Email field visible (login step).")
            await asyncio.sleep(1.5)
        except Exception:
            print("(Email field not found in time — saving current page state.)")

        await remove_cookie_ui_from_dom(page)
        await asyncio.sleep(0.3)

        html = inject_evaluate_local_assets(await page.content())
        out_file = OUT_DIR / "index.html"
        out_file.write_text(html, encoding="utf-8")
        print(f"Saved: {out_file} (cookie banner stripped; evaluate-local assets linked).")

        try:
            import importlib.util

            strip_py = Path(__file__).resolve().parent / "scripts" / "static_evaluate_snapshot.py"
            spec = importlib.util.spec_from_file_location("static_evaluate_snapshot", strip_py)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            mod.apply_static_snapshot(out_file)
            print("Stripped third-party scripts/iframes — page is static HTML/CSS.")
        except Exception as exc:
            print(f"Static strip skipped: {exc}")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(capture())
