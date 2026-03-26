"""Save a local snapshot of the Trustpilot consumer login page (solve captcha/cookies in the opened browser if needed)."""
import asyncio
import os
from pathlib import Path

from playwright.async_api import async_playwright

HEADLESS = os.environ.get("HEADLESS", "0").strip().lower() in ("1", "true", "yes")


async def capture():
    url = "https://de.trustpilot.com/users/connect?source_cta=header"
    out_dir = Path("login")
    out_dir.mkdir(parents=True, exist_ok=True)

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=HEADLESS)
        context = await browser.new_context(
            viewport={"width": 1280, "height": 800},
            user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        )
        page = await context.new_page()

        print("Opening login page... Complete captcha or cookie banner if shown.")
        await page.goto(url, wait_until="networkidle", timeout=90000)

        try:
            accept_btn = page.locator("#onetrust-accept-btn-handler")
            if await accept_btn.is_visible():
                await accept_btn.click()
                await asyncio.sleep(1)
        except Exception:
            pass

        await asyncio.sleep(2)
        html = await page.content()
        out_file = out_dir / "index.html"
        out_file.write_text(html, encoding="utf-8")
        print(f"Saved to {out_file}")

        await browser.close()


if __name__ == "__main__":
    asyncio.run(capture())
