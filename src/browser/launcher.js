const fs = require("fs");
const puppeteer = require('puppeteer');
const { startSharing } = require("./inject");
const { assert } = require("./utils");

const { serverHost } = JSON.parse(fs.readFileSync(
  `${process.env.HOME}/cloud-browser-config.json`
));

assert(serverHost);

(async () => {
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
  page.evaluate(startSharing, `wss://${serverHost}:8001`);
})();
