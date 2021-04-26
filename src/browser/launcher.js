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

// Initial dimensions for tabs in new browsers.
const DefaultTabWidth = 1000;
const DefaultTabHeight = 700;

// Extra width/height of a window compared to the viewport of one of its
// tabs. In order for screen sharing to capture the entire tab and avoid
// problems mapping mouse events in the screen shared video back to the
// tab, we make sure the window has these extra dimensions when resizing.
const WindowExtraWidth = 5;
const WindowExtraHeight = 180;

async function launchBrowser(browserId) {
  assert(gExecutablePath);
  assert(gDriverPath);
  const browser = await puppeteer.launch({
    headless: false,
    executablePath: gExecutablePath,
    dumpio: true,
    args: [
      `--window-size=${DefaultTabWidth+WindowExtraWidth},${DefaultTabHeight+WindowExtraHeight}`,
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
  gBrowserInfoById.set(
    browserId,
    {
      browser,
      loadPage,
      width: DefaultTabWidth,
      height: DefaultTabHeight,
    }
  );
  await loadPage.setViewport({
    width: DefaultTabWidth,
    height: DefaultTabHeight,
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

async function onBrowserResizeEvent(browserId, width, height) {
  const info = gBrowserInfoById.get(browserId);
  if (!info) {
    return;
  }
  info.width = width;
  info.height = height;
  await info.loadPage.setViewport({ width, height });

  const session = await info.loadPage.target().createCDPSession();
  const { windowId } = await session.send("Browser.getWindowForTarget");
  await session.send("Browser.setWindowBounds", {
    windowId,
    bounds: {
      width: width + WindowExtraWidth,
      height: height + WindowExtraHeight,
    },
  });
}

async function onBrowserMouseEvent(browserId, type, x, y) {
  const info = gBrowserInfoById.get(browserId);
  if (info) {
    const pixelx = Math.round(x * info.width);
    const pixely = Math.round(y * info.height);
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
  onBrowserResizeEvent,
  onBrowserMouseEvent,
  onBrowserKeyboardEvent,
  finishBrowser,
};
