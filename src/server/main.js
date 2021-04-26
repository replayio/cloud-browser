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
  console.log("OnSocketMessage", msg);
  msg = JSON.parse(msg.data);

  switch (msg.kind) {
  case "IceCandidate":
    addRTCIceCandidate(msg.candidate);
    break;
  case "Offer":
    addRTCOffer(msg.offer);
    break;
  case "NewRecording":
    addNewRecording(msg.recordingId, msg.url, msg.dispatchServer);
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
// UI Interface
////////////////////////////////////////////

const urlInputElem = document.getElementById("urlInput");
const startRecordingButton = document.getElementById("startRecording");
const stopRecordingButton = document.getElementById("stopRecording");
const messagesElem = document.getElementById("messages");

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

function addNewRecording(recordingId, url, dispatchServer) {
  let viewUrl = `https://replay.io/view?id=${recordingId}`;
  if (dispatchServer != "wss://dispatch.replay.io") {
    viewUrl += `&dispatch=${dispatchServer}`;
  }

  const { hostname } = new URL(url);

  const div = document.createElement("div");
  div.innerText = `Recording created (${hostname}): ${viewUrl}`;
  messagesElem.appendChild(div);
}

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
  messagesElem.innerHTML = "";
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

  handleResizeEvent();
}

function stopRecording() {
  sendSocketMessage({ kind: "StopRecording" });
  remoteVideo.srcObject = null;
  rtcConnection = null;
}

////////////////////////////////////////////
// Event Listeners
////////////////////////////////////////////

function handleResizeEvent() {
  if (!rtcConnection) {
    return;
  }

  sendSocketMessage({
    kind: "ResizeEvent",
    width: remoteVideo.clientWidth,
    height: remoteVideo.clientHeight,
  });
}
window.addEventListener("resize", throttle(handleResizeEvent, 200));

function handleMouseEvent(event) {
  if (!rtcConnection) {
    return;
  }

  const { type, offsetX, offsetY } = event;
  const x = offsetX / remoteVideo.offsetWidth;
  const y = offsetY / remoteVideo.offsetHeight;
  sendSocketMessage({ kind: "MouseEvent", type, x, y });
}

for (const event of ["mousedown", "mouseup", "click"]) {
  remoteVideo.addEventListener(event, handleMouseEvent);
}

// Mousemove events are throttled to avoid spamming the server.
let gLastMouseMoveX, gLastMouseMoveY;
const sendMouseMoveMessage = throttle(() => {
  sendSocketMessage({
    kind: "MouseEvent",
    type: "mousemove",
    x: gLastMouseMoveX,
    y: gLastMouseMoveY,
  });
}, 100);
function handleMouseMoveEvent(event) {
  const { type, offsetX, offsetY } = event;
  gLastMouseMoveX = offsetX / remoteVideo.offsetWidth;
  gLastMouseMoveY = offsetY / remoteVideo.offsetHeight;
  sendMouseMoveMessage();
}
remoteVideo.addEventListener("mousemove", handleMouseMoveEvent);

function handleKeyboardEvent(event) {
  if (!rtcConnection) {
    return;
  }

  const { type, key } = event;
  sendSocketMessage({ kind: "KeyboardEvent", type, key });
}

for (const event of ["keydown", "keyup", "keypress"]) {
  document.addEventListener(event, handleKeyboardEvent);
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

function throttle(callback, time) {
  let scheduled = false;
  return (...args) => {
    if (scheduled) {
      return;
    }
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      callback(...args);
    }, time);
  };
}
