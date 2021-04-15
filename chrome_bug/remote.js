'use strict';

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

  remoteWS = new WebSocket("ws://localhost:8002");
  remoteWS.addEventListener("message", onRemoteMessage);

  const remoteConnectedWaiter = defer();
  remoteWS.addEventListener("open", remoteConnectedWaiter.resolve);
  await remoteConnectedWaiter.promise;
})();

function defer() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
