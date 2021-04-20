// Usage: node ../restart.js ~/server.log server

const https = require("https");
const fs = require("fs");
const WebSocket = require("ws");
const { v4: uuid } = require("uuid");
const { defer } = require("../utils");

// Port to listen on for websocket connections.
const WSSPort = 8000;

const certOptions = {
  key: fs.readFileSync(`${process.env.HOME}/privkey.pem`),
  cert: fs.readFileSync(`${process.env.HOME}/fullchain.pem`),
};

const server = https.createServer(certOptions, (req, res) => {
  let file = req.url == "/" ? "/index.html" : req.url;
  const questionMark = file.indexOf("?");
  if (questionMark != -1) {
    file = file.substring(0, questionMark);
  }

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

// Singleton browser manager socket.
let gBrowserManagerSocket;

// Browsers we've created but haven't associated with a viewer socket yet.
const gUnattachedBrowsers = [];

class UnattachedBrowser {
  constructor() {
    // Unique ID for this browser.
    this.browserId = uuid();

    // Waiter which resolves with the socket.
    this.socketWaiter = defer();

    gBrowserManagerSocket.sendMessage({ kind: "SpawnBrowser", browserId: this.browserId });
  }
};

function createUnattachedBrowser() {
  gUnattachedBrowsers.push(new UnattachedBrowser());
}

// Maps browser IDs to the viewer socket which connected to it.
const gBrowserIdToViewerSocket = new Map();

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

    // For Browser/Viewer sockets, any associated browser ID. This is always set
    // for Browser sockets, and only set for Viewer sockets when they have started
    // recording.
    this.browserId = null;

    // For Browser/Viewer sockets, a waiter which will resolve with the peer socket.
    // As above, only set for Viewer sockets which have started recording.
    this.peerSocketWaiter = null;

    this.socket.on("message", msg => {
      try {
        this.onMessage(JSON.parse(msg));
      } catch (e) {
        this.onError(`Exception ${e.stack}`);
      }
    });
    this.socket.on("close", () => this.close());
  }

  onError(why) {
    console.error(`Socket error ${why}, closing.`);
    this.close();
  }

  close() {
    this.socket.close();
    if (this.kind == "Viewer") {
      this.stopRecording();
    }
  }

  onMessage(msg) {
    console.log(`OnMessage ${this.kind} ${JSON.stringify(msg)}`);

    // The first message sent must identify the kind of socket.
    if (msg.kind == "Identify") {
      this.kind = msg.socketKind;
      switch (this.kind) {
      case "BrowserManager":
        if (gBrowserManagerSocket) {
          gBrowserManagerSocket.close();
        }
        gBrowserManagerSocket = this;
        gUnattachedBrowsers.length = 0;

        // For now we always have one unattached browser kept in reserve.
        createUnattachedBrowser();
        break;
      case "Browser":
        this.initializeBrowser(msg.browserId);
        break;
      case "Viewer":
        break;
      default:
        throw new Error(`Unknown socket kind ${this.kind}`);
      }
      return;
    }
    assert(this.kind);

    switch (msg.kind) {
    case "StartRecording":
      assert(this.kind == "Viewer");
      assert(msg.url);
      this.startRecording(msg.url);
      break;
    case "StopRecording":
      assert(this.kind == "Viewer");
      this.stopRecording();
      break;
    case "NewRecording":
      assert(this.kind == "BrowserManager");
      const { browserId, recordingId, url, dispatchServer } = msg;
      const viewerSocket = gBrowserIdToViewerSocket.get(browserId);
      if (viewerSocket) {
        viewerSocket.sendMessage({ kind: "NewRecording", recordingId, url, dispatchServer });
      }
      break;
    case "IceCandidate":
      assert(this.kind == "Browser" || this.kind == "Viewer");
      this.sendMessageToPeerSocket({ kind: "IceCandidate", candidate: msg.candidate });
      break;
    case "Offer":
      assert(this.kind == "Browser");
      this.sendMessageToPeerSocket({ kind: "Offer", offer: msg.offer });
      break;
    case "Answer":
      assert(this.kind == "Viewer");
      this.sendMessageToPeerSocket({ kind: "Answer", answer: msg.answer });
      break;
    default:
      throw new Error(`Unknown message kind ${msg.kind}`);
    }
  }

  initializeBrowser(browserId) {
    assert(browserId);
    this.browserId = browserId;
    this.peerSocketWaiter = defer();

    // This browser is either unattached, or has been associated with a viewer socket.
    const viewerSocket = gBrowserIdToViewerSocket.get(browserId);
    if (viewerSocket) {
      if (viewerSocket.browserId == browserId) {
        this.peerSocketWaiter.resolve(viewerSocket);
        viewerSocket.peerSocketWaiter.resolve(this);
      } else {
        // The viewer stopped recording before we were able to connect.
        this.close();
      }
    } else {
      const unattached = gUnattachedBrowsers.find(entry => entry.browserId == browserId);
      assert(unattached);
      unattached.socketWaiter.resolve(this);
    }
  }

  async startRecording(url) {
    if (this.browserId) {
      this.stopRecording();
    }
    const unattached = gUnattachedBrowsers.shift();
    assert(unattached);
    createUnattachedBrowser();

    this.browserId = unattached.browserId;
    this.peerSocketWaiter = unattached.socketWaiter;
    gBrowserIdToViewerSocket.set(this.browserId, this);

    const socket = await this.peerSocketWaiter.promise;
    if (this.browserId == unattached.browserId) {
      socket.peerSocketWaiter.resolve(this);
      gBrowserManagerSocket.sendMessage({ kind: "NavigateBrowser", browserId: this.browserId, url });
    }
  }

  stopRecording() {
    const browserId = this.browserId;
    if (!browserId) {
      return;
    }
    // Note: gBrowserIdToViewerSocket will grow without bound. We can't clear it
    // here because we might get recordings later on associated with this browser.
    // This should be fixed.
    //gBrowserIdToViewerSocket.delete(browserId);
    this.browserId = null;
    this.peerSocketWaiter.promise.then(socket => socket.close());
    this.peerSocketWaiter = null;
    gBrowserManagerSocket.sendMessage({ kind: "StopBrowser", browserId });
  }

  sendMessage(msg) {
    this.socket.send(JSON.stringify(msg));
  }

  async sendMessageToPeerSocket(msg) {
    const browserId = this.browserId;
    const peerSocket = await this.peerSocketWaiter.promise;
    if (peerSocket.browserId == browserId) {
      peerSocket.sendMessage(msg);
    }
  }
};

function assert(v) {
  if (!v) {
    throw new Error("Assertion failed!");
  }
}
