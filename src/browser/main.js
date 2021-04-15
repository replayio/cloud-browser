const fs = require("fs");
const WebSocket = require("ws");
const { launchBrowser } = require("./launcher");
const { assert, defer } = require("../utils");
const { getConfig } = require("./config");

const { serverHost } = getConfig();
assert(serverHost);

let socket;

async function main() {
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

const gBrowsersById = new Map();

async function onSocketMessage(msg) {
  msg = JSON.parse(msg);

  switch (msg.kind) {
  case "SpawnBrowser": {
    const browser = await launchBrowser({
      browserId: msg.browserId,
      url: msg.url,
    });
    gBrowsersById.set(msg.browserId, browser);
    break;
  }
  case "StopBrowser": {
    const browser = gBrowsersById.get(msg.browserId);
    if (browser) {
      browser.close();
      gBrowsersById.delete(msg.browserId);
    }
    break;
  }
  default:
    console.error("UnknownMessageKind", msg.kind);
  }
}
