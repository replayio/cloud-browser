const puppeteer = require('puppeteer');
const { startSharing } = require("./inject");

async function launchBrowser(serverHost) {
  const url = "https://www.google.com";
  const browser = await puppeteer.launch({
    headless: false,
    args: [
      "--window-size=1000,800",
      "--auto-select-desktop-capture-source=recorder",
    ],
  });
  const page = await browser.newPage();
  await page.setViewport({
    width: 1000,
    height: 800,
  });
  await page.goto(url);
  page.evaluate(startSharing, `wss://${serverHost}:8000`);
}

module.exports = { launchBrowser };
