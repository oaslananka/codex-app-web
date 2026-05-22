import os
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright


def assert_visible(page, selector: str) -> None:
    locator = page.locator(selector)
    locator.wait_for(state="visible", timeout=15000)


def main() -> None:
    artifact_dir = Path(tempfile.gettempdir()) / "codex-app-web-smoke"
    artifact_dir.mkdir(parents=True, exist_ok=True)
    base_url = os.environ.get("BASE_URL", "http://127.0.0.1:1989").rstrip("/")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={"width": 1440, "height": 900})
        page = context.new_page()
        errors: list[str] = []

        page.on("console", lambda msg: errors.append(f"{msg.type}: {msg.text}") if msg.type == "error" else None)
        page.goto(base_url, wait_until="networkidle")

        assert_visible(page, "#header")
        assert_visible(page, "#content-tabs")
        assert_visible(page, "#panel-chat")
        page.screenshot(path=str(artifact_dir / "desktop-home.png"), full_page=True)

        page.set_viewport_size({"width": 390, "height": 844})
        page.reload(wait_until="networkidle")
        assert_visible(page, "#btn-toggle-sidebar")
        page.click("#btn-toggle-sidebar")
        page.screenshot(path=str(artifact_dir / "mobile-sidebar.png"), full_page=True)

        page.click('button[data-tab="info"]')
        assert_visible(page, "#panel-info.active")
        page.screenshot(path=str(artifact_dir / "mobile-info-tab.png"), full_page=True)

        page.click('button[data-tab="config"]')
        assert_visible(page, "#panel-config.active")
        page.screenshot(path=str(artifact_dir / "mobile-config-tab.png"), full_page=True)

        browser.close()

        if errors:
            raise AssertionError(f"Console errors detected: {errors[:5]}")


if __name__ == "__main__":
    main()
