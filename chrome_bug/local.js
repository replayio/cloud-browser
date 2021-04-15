'use strict';

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

(async () => {
  const localConnectedWaiter = defer();
  localWS.addEventListener("open", localConnectedWaiter.resolve);
  await localConnectedWaiter.promise;

  localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

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

function defer() {
  let resolve, reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
