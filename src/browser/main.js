const fs = require("fs");
const WebSocket = require("ws");
const { launchBrowser } = require("./launcher");
const { assert, defer } = require("../utils");

const { serverHost } = JSON.parse(fs.readFileSync(
  `${process.env.HOME}/cloud-browser-config.json`
));

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

function onSocketMessage(msg) {
  msg = JSON.parse(msg);

  switch (msg.kind) {
  default:
    console.error("UnknownMessageKind", msg.kind);
  }
}
