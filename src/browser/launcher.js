const puppeteer = require('puppeteer');
const { startSharing } = require("./inject");

async function launchBrowser(options) {
  const {
    serverHost,
    browserId,
    url,
  } = options;
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--window-size=1000,800",
      `--auto-select-desktop-capture-source=${browserId}`,
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1000,
    height: 800,
  });
  await page.goto(url);
  page.evaluate(startSharing, `wss://${serverHost}:8000`, browserId);
  return browser;
}

module.exports = { launchBrowser };
