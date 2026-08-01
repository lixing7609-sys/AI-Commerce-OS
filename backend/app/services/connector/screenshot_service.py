"""
Screenshot Service —— 执行完成后用真实无头浏览器给出一张页面截图，
不使用任何"伪造截图"或纯文本描述冒充页面验证。
"""

import logging
import os
import time
import uuid

from app.core.config import get_connector_screenshot_dir

logger = logging.getLogger("app.connector.screenshot")

_SCREENSHOT_TIMEOUT_MS = 15000


class ScreenshotError(Exception):
    pass


class ScreenshotService:
    @staticmethod
    def capture(url: str, *, run_id: str) -> str:
        """
        返回截图文件的绝对路径。playwright 未安装或截图失败都抛出
        ScreenshotError，由调用方决定如何在结果里体现（screenshot
        缺失不代表页面不可访问——HTTP 可达性检查是独立、更基础的
        判定条件）。
        """

        try:
            from playwright.sync_api import sync_playwright
        except ImportError as error:
            raise ScreenshotError("playwright 未安装") from error

        screenshot_dir = get_connector_screenshot_dir()
        os.makedirs(screenshot_dir, exist_ok=True)
        filename = f"{run_id}-{int(time.time())}-{uuid.uuid4().hex[:8]}.png"
        path = os.path.join(screenshot_dir, filename)

        try:
            with sync_playwright() as playwright:
                browser = playwright.chromium.launch()
                try:
                    page = browser.new_page(viewport={"width": 1440, "height": 900})
                    page.goto(url, timeout=_SCREENSHOT_TIMEOUT_MS, wait_until="load")
                    page.wait_for_timeout(800)
                    page.screenshot(path=path, full_page=False)
                finally:
                    browser.close()
        except Exception as error:
            logger.error("screenshot capture failed: %s", type(error).__name__)
            raise ScreenshotError(str(type(error).__name__)) from error

        return path
