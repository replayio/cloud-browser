const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");

// Port to listen on for websocket connections.
const WSSPort = 8000;

const certOptions = {
  key: fs.readFileSync(`${process.env.HOME}/privkey.pem`),
  cert: fs.readFileSync(`${process.env.HOME}/fullchain.pem`),
};

const server = https.createServer(certOptions, (req, res) => {
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
server.listen(443);

function getContentType(file) {
  if (file.endsWith("html")) {
    return "text/html";
  }
  if (file.endsWith("js")) {
    return "text/javascript";
  }
  return "";
}

const wssHTTPS = https.createServer(certOptions);
const wssServer = new WebSocket.Server({ server: wssHTTPS });
wssHTTPS.listen(WSSPort);
wssServer.on("connection", socket => new SocketInfo(socket));

let gBrowserSocket;
let gViewerSocket;

// Information about a websocket that has connected to us.
class SocketInfo {
  constructor(socket) {
    console.log("NewConnection");

    // Raw WebSocket.
    this.socket = socket;

    // Kind of socket, if known.
    // BrowserManager: Singleton module which creates/destroys browsers.
    // Browser: Recording browser created by the BrowserManager.
    // Viewer: Client wanting to view/control a browser.
    this.kind = null;

    // For Browser/Viewer sockets, any ICE candidates we've been sent.
    this.iceCandidates = [];

    // For Browser sockets, any RTC offer this has generated.
    this.offer = null;

    // For Browser/Viewer sockets, the peer socket for RTC connections if known.
    this.peerSocket = null;

    this.socket.on("message", msg => {
      try {
        this.onMessage(JSON.parse(msg));
      } catch (e) {
        this.onError(`Exception ${e} ${e.stack}`);
      }
    });
  }

  onError(why) {
    console.error(`Socket error ${why}, closing.`);
    this.socket.close();
  }

  onMessage(msg) {
    console.log(`OnMessage ${this.kind} ${JSON.stringify(msg)}`);

    // The first message sent must identify the kind of socket.
    if (msg.kind == "Identify") {
      this.kind = msg.socketKind;
      switch (this.kind) {
      case "Browser":
        assert(!gBrowserSocket);
        assert(!gViewerSocket);
        gBrowserSocket = this;
        break;
      case "Viewer":
        assert(gBrowserSocket);
        assert(!gViewerSocket);
        gViewerSocket = this;
        gBrowserSocket.setPeerSocket(this);
        this.setPeerSocket(gBrowserSocket);
        break;
      default:
        throw new Error(`Unknown socket kind ${this.kind}`);
      }
      return;
    }
    assert(this.kind);

    switch (msg.kind) {
    case "IceCandidate":
      assert(this.kind == "Browser" || this.kind == "Viewer");
      this.iceCandidates.push(msg.candidate);
      if (this.peerSocket) {
        this.peerSocket.sendIceCandidate(msg.candidate);
      }
      break;
    case "Offer":
      assert(this.kind == "Browser");
      this.offer = msg.offer;
      if (this.peerSocket) {
        this.peerSocket.sendOffer(msg.offer);
      }
      break;
    case "Answer":
      assert(this.kind == "Viewer");
      assert(this.peerSocket);
      this.peerSocket.sendMessage({ kind: "Answer", answer: msg.answer });
      break;
    default:
      throw new Error(`Unknown message kind ${msg.kind}`);
    }
  }

  sendMessage(msg) {
    this.socket.send(JSON.stringify(msg));
  }

  sendIceCandidate(candidate) {
    this.sendMessage({ kind: "IceCandidate", candidate });
  }

  sendOffer(offer) {
    this.sendMessage({ kind: "Offer", offer });
  }

  setPeerSocket(socket) {
    assert(!this.peerSocket);
    this.peerSocket = socket;

    if (this.offer) {
      this.peerSocket.sendOffer(this.offer);
    }

    for (const candidate of this.iceCandidates) {
      this.peerSocket.sendIceCandidate(candidate);
    }
  }
};

function assert(v) {
  if (!v) {
    throw new Error("Assertion failed!");
  }
}
