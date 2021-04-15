'use strict';

/////////////////////////////////////////////////
// Local
/////////////////////////////////////////////////

let localStream;
let localPeerConnection;
const localWS = new WebSocket("ws://localhost:8001");
localWS.addEventListener("message", onLocalMessage);

function handleLocalConnection(event) {
  const iceCandidate = event.candidate;
  if (iceCandidate) {
    const newIceCandidate = new RTCIceCandidate(iceCandidate);
    localWS.send(JSON.stringify({
      kind: "IceCandidate",
      candidate: iceCandidate.toJSON(),
    }));
  }
}

function createdOffer(description) {
  localPeerConnection.setLocalDescription(description);
  localWS.send(JSON.stringify({
    kind: "Offer",
    offer: description,
  }));
}

const haveStreamWaiter = defer();

(async () => {
  const localConnectedWaiter = defer();
  localWS.addEventListener("open", localConnectedWaiter.resolve);
  await localConnectedWaiter.promise;

  localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

  haveStreamWaiter.resolve();

  localPeerConnection = new RTCPeerConnection(null);
  localPeerConnection.addEventListener("icecandidate", handleLocalConnection);

  localPeerConnection.addStream(localStream);
  localPeerConnection.createOffer({ offerToReceiveVideo: 1 })
    .then(createdOffer);
})();

function onLocalMessage(msg) {
  msg = JSON.parse(msg.data);

  switch (msg.kind) {
  case "Answer":
    localPeerConnection.setRemoteDescription(msg.answer);
    break;
  case "IceCandidate":
    localPeerConnection.addIceCandidate(msg.candidate);
    break;
  default:
    console.log("UnknownLocalMessage", msg);
  }
}

/////////////////////////////////////////////////
// Remote
/////////////////////////////////////////////////

// Define peer connections, streams and video elements.
const remoteVideo = document.getElementById('remoteVideo');

let remotePeerConnection;
let remoteWS;

function handleRemoteConnection(event) {
  const iceCandidate = event.candidate;
  if (iceCandidate) {
    remoteWS.send(JSON.stringify({
      kind: "IceCandidate",
      candidate: iceCandidate,
    }));
  }
}

function createdAnswer(description) {
  remotePeerConnection.setLocalDescription(description);
  remoteWS.send(JSON.stringify({
    kind: "Answer",
    answer: description,
  }));
}

function onRemoteMessage(msg) {
  msg = JSON.parse(msg.data);

  switch (msg.kind) {
  case "IceCandidate":
    remotePeerConnection.addIceCandidate(msg.candidate);
    break;
  case "Offer":
    remotePeerConnection.setRemoteDescription(msg.offer);
    remotePeerConnection.createAnswer()
      .then(createdAnswer);
    break;
  default:
    console.log("UnknownRemoteMessage", msg);
  }
}

(async () => {
  remotePeerConnection = new RTCPeerConnection(null);

  remotePeerConnection.addEventListener("icecandidate", handleRemoteConnection);
  remotePeerConnection.addEventListener("addstream", event => {
    remoteVideo.srcObject = event.stream;
  });

  await haveStreamWaiter.promise;
  await new Promise(resolve => setTimeout(resolve, 3000));

  remoteWS = new WebSocket("ws://localhost:8002");
  remoteWS.addEventListener("message", onRemoteMessage);

  const remoteConnectedWaiter = defer();
  remoteWS.addEventListener("open", remoteConnectedWaiter.resolve);
  await remoteConnectedWaiter.promise;
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
