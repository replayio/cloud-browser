const fs = require("fs");
const WebSocket = require("ws");
const { launchBrowser, finishBrowser } = require("./launcher");
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

async function onSocketMessage(msg) {
  msg = JSON.parse(msg);

  switch (msg.kind) {
  case "SpawnBrowser":
    launchBrowser({
      browserId: msg.browserId,
      url: msg.url,
    });
    break;
  case "StopBrowser":
    const recordings = await finishBrowser(msg.browserId);
    for (const { recordingId, url, dispatchServer } of recordings) {
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
