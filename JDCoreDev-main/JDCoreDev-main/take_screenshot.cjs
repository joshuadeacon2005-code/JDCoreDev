const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 3000 } });
  await page.goto('http://localhost:5000/', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  await page.screenshot({ path: 'homepage_screenshot.png', fullPage: true });
  console.log('Screenshot saved to homepage_screenshot.png');
  await browser.close();
})();
