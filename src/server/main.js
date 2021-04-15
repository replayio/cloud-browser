"use strict";

////////////////////////////////////////////
// Server Socket
////////////////////////////////////////////

// WebSocket for communicating with server.
let socket;
let socketConnectedWaiter;

function initSocket() {
  const url = new URL(window.location.href);
  const { hostname } = url;

  socket = new WebSocket(`wss://${hostname}:8002`);
  socket.addEventListener("message", onSocketMessage);

  socketConnectedWaiter = defer();
  socket.addEventListener("open", socketConnectedWaiter.resolve);
}
initSocket();

function onSocketMessage(msg) {
  msg = JSON.parse(msg.data);

  switch (msg.kind) {
  case "IceCandidate":
    addRTCIceCandidate(msg.candidate);
    break;
  case "Offer":
    addRTCOffer(msg.offer);
    break;
  default:
    console.log("UnknownRemoteMessage", msg);
  }
}

async function sendSocketMessage(msg) {
  await socketConnectedWaiter.promise;
  socket.send(JSON.stringify(msg));
}

////////////////////////////////////////////
// RTC Connection
////////////////////////////////////////////

let remotePeerConnection;

function handleRemoteConnection(event) {
  const iceCandidate = event.candidate;
  if (iceCandidate) {
    sendSocketMessage({
      kind: "IceCandidate",
      candidate: iceCandidate,
    });
  }
}

function addRTCIceCandidate(candidate) {
  remotePeerConnection.addIceCandidate(candidate);
}

async function addRTCOffer(offer) {
  remotePeerConnection.setRemoteDescription(offer);
  const answer = await remotePeerConnection.createAnswer();

  remotePeerConnection.setLocalDescription(answer);
  sendSocketMessage({
    kind: "Answer",
    answer,
  });
}

const remoteVideo = document.getElementById("remoteVideo");

(async () => {
  remotePeerConnection = new RTCPeerConnection({
    iceServers: [{
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.l.google.com:19302?transport=udp",
      ],
    }],
  });

  remotePeerConnection.addEventListener("icecandidate", handleRemoteConnection);
  remotePeerConnection.addEventListener("addstream", event => {
    remoteVideo.srcObject = event.stream;
  });
})();

////////////////////////////////////////////
// Utilities
////////////////////////////////////////////

function defer() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
