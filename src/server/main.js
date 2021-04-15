"use strict";

////////////////////////////////////////////
// Server Socket
////////////////////////////////////////////

// WebSocket for communicating with server.
let socket;
let socketConnectedWaiter;

async function initSocket() {
  const url = new URL(window.location.href);
  const { hostname } = url;

  socket = new WebSocket(`wss://${hostname}:8000`);
  socket.addEventListener("message", onSocketMessage);

  socketConnectedWaiter = defer();

  const waiter = defer();
  socket.addEventListener("open", waiter.resolve);
  await waiter.promise;

  socket.send(JSON.stringify({ kind: "Identify", socketKind: "Viewer" }));
  socketConnectedWaiter.resolve();
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
    console.error("UnknownSocketMessage", msg);
  }
}

async function sendSocketMessage(msg) {
  await socketConnectedWaiter.promise;
  socket.send(JSON.stringify(msg));
}

////////////////////////////////////////////
// Button Handlers
////////////////////////////////////////////

const urlInputElem = document.getElementById("urlInput");
const startRecordingButton = document.getElementById("startRecording");
const stopRecordingButton = document.getElementById("stopRecording");
const clearMessagesButton = document.getElementById("clearMessages");

stopRecordingButton.disabled = true;

startRecordingButton.addEventListener("mousedown", () => {
  startRecordingButton.disabled = true;
  stopRecordingButton.disabled = false;
  startRecording(urlInputElem.value || "https://google.com");
});

stopRecordingButton.addEventListener("mousedown", () => {
  startRecordingButton.disabled = false;
  stopRecordingButton.disabled = true;
  stopRecording();
});

////////////////////////////////////////////
// RTC Connection
////////////////////////////////////////////

// RTCPeerConnection for any recording being created.
let rtcConnection;

function addRTCIceCandidate(candidate) {
  if (rtcConnection) {
    rtcConnection.addIceCandidate(candidate);
  }
}

async function addRTCOffer(offer) {
  if (!rtcConnection) {
    return;
  }
  rtcConnection.setRemoteDescription(offer);

  const answer = await rtcConnection.createAnswer();
  if (!rtcConnection) {
    return;
  }

  rtcConnection.setLocalDescription(answer);
  sendSocketMessage({
    kind: "Answer",
    answer,
  });
}

const remoteVideo = document.getElementById("remoteVideo");

function startRecording(url) {
  sendSocketMessage({ kind: "StartRecording", url });

  rtcConnection = new RTCPeerConnection({
    iceServers: [{
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.l.google.com:19302?transport=udp",
      ],
    }],
  });

  rtcConnection.addEventListener("icecandidate", ({ candidate }) => {
    if (candidate) {
      sendSocketMessage({ kind: "IceCandidate", candidate });
    }
  });
  rtcConnection.addEventListener("addstream", event => {
    remoteVideo.srcObject = event.stream;
  });
}

function stopRecording() {
  sendSocketMessage({ kind: "StopRecording" });
  remoteVideo.srcObject = null;
  rtcConnection = null;
}

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
