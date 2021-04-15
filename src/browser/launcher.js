const puppeteer = require('puppeteer');
const { startSharing } = require("./inject");
const { getConfig } = require("./config");
const { assert } = require("../utils");

const {
  serverHost,
  executablePath,
  driverPath,
  dispatchServer,
} = getConfig();
assert(serverHost);
assert(executablePath);
assert(driverPath);
assert(dispatchServer);

async function launchBrowser(options) {
  const {
    browserId,
    url,
  } = options;
  const browser = await puppeteer.launch({
    headless: false,
    executablePath,
    dumpio: true,
    args: [
      "--window-size=1000,800",
      `--auto-select-desktop-capture-source=${browserId}`,
    ],
    env: {
      ...process.env,
      RECORD_REPLAY_DRIVER: driverPath,
      RECORD_REPLAY_DISPATCH: dispatchServer,
    },
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
