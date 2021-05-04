const fs = require("fs");
const WebSocket = require("ws");
const {
  setExecutableAndDriverPaths,
  launchBrowser,
  navigateBrowser,
  finishBrowser,
  onBrowserResizeEvent,
  onBrowserMouseEvent,
  onBrowserKeyboardEvent,
} = require("./launcher");
const { assert, defer, spawnAsync } = require("../utils");
const { getConfig } = require("./config");

const { serverHost } = getConfig();
assert(serverHost);

let socket;

async function main() {
  await setupBrowser();

  socket = new WebSocket(`wss://${serverHost}:8000`);

  const waiter = defer();
  socket.on("open", waiter.resolve);
  socket.on("close", () => console.log("SocketClosed"));
  socket.on("message", onSocketMessage);
  await waiter.promise;

  sendSocketMessage({ kind: "Identify", socketKind: "BrowserManager" });
}
main();

function sendSocketMessage(msg) {
  socket.send(JSON.stringify(msg));
}

async function onSocketMessage(msg) {
  console.log("OnSocketMessage", msg);
  msg = JSON.parse(msg);

  switch (msg.kind) {
  case "SpawnBrowser":
    launchBrowser(msg.browserId);
    break;
  case "NavigateBrowser":
    navigateBrowser(msg.browserId, msg.url);
    break;
  case "ResizeEvent":
    onBrowserResizeEvent(msg.browserId, msg.width, msg.height);
    break;
  case "MouseEvent":
    onBrowserMouseEvent(msg.browserId, msg.type, msg.x, msg.y);
    break;
  case "KeyboardEvent":
    onBrowserKeyboardEvent(msg.browserId, msg.type, msg.key);
    break;
  case "StopBrowser":
    const recordings = await finishBrowser(msg.browserId);
    for (const { recordingId, url, dispatchServer } of recordings || []) {
      sendSocketMessage({
        kind: "NewRecording",
        browserId: msg.browserId,
        recordingId,
        url,
        dispatchServer,
      });
    }
    break;
  default:
    console.error("UnknownMessageKind", msg.kind);
  }
}

async function setupBrowser() {
  const {
    browserDir,
    executablePath,
    driverPath,
  } = getConfig();

  if (!browserDir) {
    if (!executablePath || !driverPath) {
      console.error("Executable/driver path not specified");
      process.exit(1);
    }
    setExecutableAndDriverPaths(executablePath, driverPath);
    return;
  }

  if (executablePath || driverPath) {
    console.error("Executable/driver path specified in addition to browser dir");
    process.exit(1);
  }

  await updateBrowser(browserDir);
  setInterval(() => updateBrowser(browserDir), 1000 * 60 * 5);
}

async function updateBrowser(browserDir) {
  return Promise.all([updateChrome(browserDir), updateDriver(browserDir)]);
}

async function readJSON(file) {
  try {
    const contents = await fs.promises.readFile(file, "utf8");
    return JSON.parse(contents);
  } catch (e) {
    return undefined;
  }
}

// Check if a JSON file in the replay downloads page has changed.
async function checkForJSONUpdate(browserDir, file) {
  const path = `${browserDir}/${file}`;
  const currentJSON = await readJSON(path);

  await spawnAsync(
    "curl",
    [ `https://replay.io/downloads/${file}`, "-o", path ],
    { stdio: "inherit" }
  );

  const newJSON = await readJSON(path);
  if (JSON.stringify(currentJSON) != JSON.stringify(newJSON)) {
    return newJSON;
  }
  return null;
}

async function setBrowserDirPaths(browserDir) {
  const json = await readJSON(`${browserDir}/linux-replay-chromium.json`);
  const { buildId } = json;
  assert(buildId);

  setExecutableAndDriverPaths(
    `${browserDir}/${buildId}/chrome`,
    `${browserDir}/linux-recordreplay.so`
  );
}

async function updateChrome(browserDir) {
  const json = await checkForJSONUpdate(browserDir, "linux-replay-chromium.json");
  if (!json) {
    // We still need to set the executable path if we're just starting up.
    await setBrowserDirPaths(browserDir);
    return;
  }

  // Each chromium build is placed in its own directory so that we don't
  // interfere with any running processes. Eventually these browsers will fill
  // up the disk.
  const { buildId } = json;
  if (!buildId) {
    throw new Error("Can't read build ID from browser JSON");
  }

  await spawnAsync(
    "curl",
    [
      "https://replay.io/downloads/linux-replay-chromium.tar.xz",
      "-o",
      `${browserDir}/linux-replay-chromium.tar.xz`,
    ],
    { stdio: "inherit" }
  );

  await spawnAsync(
    "tar",
    ["xf", "linux-replay-chromium.tar.xz"],
    { cwd: browserDir }
  );

  await spawnAsync(
    "rm",
    ["-rf", `${browserDir}/${buildId}`],
    { stdio: "inherit" }
  );

  await spawnAsync(
    "mv",
    [`${browserDir}/replay-chromium`, `${browserDir}/${buildId}`],
    { stdio: "inherit" }
  );

  await setBrowserDirPaths(browserDir);
}

async function updateDriver(browserDir) {
  if (!await checkForJSONUpdate(browserDir, "linux-recordreplay.json")) {
    return;
  }

  await spawnAsync(
    "curl",
    [
      "https://replay.io/downloads/linux-recordreplay.so",
      "-o",
      `${browserDir}/linux-recordreplay.so`,
    ],
    { stdio: "inherit" }
  );
}
