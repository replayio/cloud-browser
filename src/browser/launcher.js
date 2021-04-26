const fs = require("fs");
const puppeteer = require('puppeteer');
const { startSharing } = require("./inject");
const { getConfig } = require("./config");
const { assert, waitForTime } = require("../utils");

const {
  serverHost,
  dispatchServer,
} = getConfig();
assert(serverHost);
assert(dispatchServer);

const gBrowserInfoById = new Map();

function recordingIdFile(browserId) {
  return `/tmp/${browserId}-recordings.txt`;
}

function pidFile(browserId) {
  return `/tmp/${browserId}-pid.txt`;
}

let gExecutablePath;
let gDriverPath;

function setExecutableAndDriverPaths(executablePath, driverPath) {
  gExecutablePath = executablePath;
  gDriverPath = driverPath;
}

// For now we use fixed tab dimensions.
const TabWidth = 1000;
const TabHeight = 700;

async function launchBrowser(browserId) {
  assert(gExecutablePath);
  assert(gDriverPath);
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: gExecutablePath,
    dumpio: true,
    args: [
      // This really sucks, but the window sizes and tab heights have been
      // calibrated to avoid problems where mouse events land in the wrong
      // spot. See the server/canvas.html site for testing. This needs to
      // get investigated and fixed.
      `--window-size=${TabWidth},${TabHeight+180}`,
      `--auto-select-desktop-capture-source=${browserId}`,
    ],
    env: {
      ...process.env,
      RECORD_REPLAY_DRIVER: gDriverPath,
      RECORD_REPLAY_SERVER: dispatchServer,
      RECORD_REPLAY_RECORDING_ID_FILE: recordingIdFile(browserId),
      RECORD_REPLAY_PID_FILE: pidFile(browserId),
    },
  });
  const loadPage = await browser.newPage();
  gBrowserInfoById.set(browserId, { browser, loadPage });
  await loadPage.setViewport({
    width: TabWidth,
    height: TabHeight,
  });
  await loadPage.goto(`https://${serverHost}/landing.html?title=${browserId}`);
  const rtcPage = await browser.newPage();
  await rtcPage.goto(`https://${serverHost}/landing.html`);
  rtcPage.evaluate(startSharing, `wss://${serverHost}:8000`, browserId);
}

async function navigateBrowser(browserId, url) {
  const info = gBrowserInfoById.get(browserId);
  if (info) {
    info.loadPage.goto(url);
  }
}

async function onBrowserMouseEvent(browserId, type, x, y) {
  const info = gBrowserInfoById.get(browserId);
  if (info) {
    const pixelx = Math.round(x * TabWidth);
    const pixely = Math.round(y * TabHeight);
    switch (type) {
    case "mousemove":
      info.loadPage.mouse.move(pixelx, pixely);
      break;
    case "mousedown":
      info.loadPage.mouse.down(pixelx, pixely);
      break;
    case "mouseup":
      info.loadPage.mouse.up(pixelx, pixely);
      break;
    case "click":
      info.loadPage.mouse.click(pixelx, pixely);
      break;
    default:
      console.error(`Unknown mouse event ${type}`);
    }
  }
}

async function onBrowserKeyboardEvent(browserId, type, key) {
  const info = gBrowserInfoById.get(browserId);
  if (info) {
    switch (type) {
    case "keydown":
      // For now we ignore keydown/keyup events. Sending all the
      // events we get to the page will cause keys to be typed twice.
      //info.loadPage.keyboard.down(key);
      break;
    case "keyup":
      //info.loadPage.keyboard.up(key);
      break;
    case "keypress":
      info.loadPage.keyboard.press(key);
      break;
    default:
      console.error(`Unknown keyboard event ${type}`);
    }
  }
}

// Wait for all recording subprocesses associated with a browser
// to exit, with a limit to the total duration we will wait.
// Subprocesses will not exit until they have finished uploading
// the recording, which may be after the main process has exited
// and puppeteer has marked the browser as closed.
async function waitForSubprocessesToExit(browserId) {
  const TotalWait = 10000;
  const CheckInterval = 100;

  const pids = fs.readFileSync(pidFile(browserId), "utf8")
                 .split("\n")
                 .filter(pid => pid.length)
                 .map(pid => +pid);
  const start = Date.now();
  while (Date.now() - start < TotalWait) {
    let done = true;
    for (const pid of pids) {
      try {
        process.kill(pid, 0);
        done = false;
      } catch (e) {}
    }
    if (done) {
      break;
    }
    await waitForTime(CheckInterval);
  }
}

async function finishBrowser(browserId) {
  const info = gBrowserInfoById.get(browserId);
  if (!info) {
    return;
  }
  gBrowserInfoById.delete(browserId);
  await info.browser.close();
  await waitForSubprocessesToExit(browserId);
  const recordings = fs.readFileSync(recordingIdFile(browserId), "utf8")
                       .split("\n")
                       .filter(id => id.length && !id.includes(serverHost))
                       .map(str => {
                         const [recordingId, url] = str.split(" ");
                         return { recordingId, url, dispatchServer };
                       });
  fs.unlinkSync(recordingIdFile(browserId));
  fs.unlinkSync(pidFile(browserId));
  return recordings;
}

module.exports = {
  setExecutableAndDriverPaths,
  launchBrowser,
  navigateBrowser,
  onBrowserMouseEvent,
  onBrowserKeyboardEvent,
  finishBrowser,
};
