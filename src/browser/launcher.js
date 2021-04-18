const fs = require("fs");
const puppeteer = require('puppeteer');
const { startSharing } = require("./inject");
const { getConfig } = require("./config");
const { assert, waitForTime } = require("../utils");

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

const gBrowserInfoById = new Map();

function recordingIdFile(browserId) {
  return `/tmp/${browserId}-recordings.txt`;
}

function pidFile(browserId) {
  return `/tmp/${browserId}-pid.txt`;
}

async function launchBrowser(browserId) {
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
      RECORD_REPLAY_RECORDING_ID_FILE: recordingIdFile(browserId),
      RECORD_REPLAY_PID_FILE: pidFile(browserId),
    },
  });
  const loadPage = await browser.newPage();
  gBrowserInfoById.set(browserId, { browser, loadPage });
  await loadPage.setViewport({
    width: 1000,
    height: 800,
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

module.exports = { launchBrowser, navigateBrowser, finishBrowser };
