const http = require("http");
const fs = require("fs");
const WebSocket = require("ws");

const server = http.createServer((req, res) => {
  const file = req.url == "/" ? "/index.html" : req.url;

  try {
    const contents = fs.readFileSync(`${__dirname}${file}`, "utf8");
    res.writeHead(200, { "Content-Type": getContentType(file) });
    res.write(contents);
    res.end();
  } catch (e) {
    console.log(`Exception ${e}`);
  }
});
server.listen(8000);

function getContentType(file) {
  if (file.endsWith("html")) {
    return "text/html";
  }
  if (file.endsWith("js")) {
    return "text/javascript";
  }
  return "";
}

let innerSocket, outerSocket;
const innerIceCandidates = [];
let innerOffer;

const innerWSS = new WebSocket.Server({ port: 8001 });
innerWSS.on("connection", socket => {
  innerSocket = socket;
  console.log("InnerConnection");

  innerSocket.on("message", msg => {
    console.log("InnerMessage", msg);
    msg = JSON.parse(msg);

    switch (msg.kind) {
    case "IceCandidate":
      assert(!outerSocket);
      innerIceCandidates.push(msg.candidate);
      break;
    case "Offer":
      assert(!innerOffer);
      assert(!outerSocket);
      innerOffer = msg.offer;
      break;
    default:
      console.error(`Unexpected message ${JSON.stringify(msg)}`);
    }
  });
});

const outerWSS = new WebSocket.Server({ port: 8002 });
outerWSS.on("connection", socket => {
  outerSocket = socket;
  console.log("OuterConnection");

  assert(innerOffer);
  socket.send(JSON.stringify({
    kind: "Offer",
    offer: innerOffer,
  }));

  assert(innerIceCandidates.length);
  for (const candidate of innerIceCandidates) {
    socket.send(JSON.stringify({
      kind: "IceCandidate",
      candidate,
    }));
  }

  outerSocket.on("message", msg => {
    console.log("OuterMessage", msg);
    msg = JSON.parse(msg);

    switch (msg.kind) {
    case "Answer":
      assert(innerSocket);
      innerSocket.send(JSON.stringify({
        kind: "Answer",
        answer: msg.answer,
      }));
      break;
    case "IceCandidate":
      assert(innerSocket);
      innerSocket.send(JSON.stringify({
        kind: "IceCandidate",
        candidate: msg.candidate,
      }));
      break;
    default:
      console.error("UnknownMessage", msg);
    }
  });
});

function assert(v) {
  if (!v) {
    throw new Error("Assertion failed!");
  }
}
