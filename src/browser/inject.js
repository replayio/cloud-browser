
// This script is injected into the browser process at startup to begin
// screen sharing via the remote server.
async function startSharing(serverAddress, browserId) {
  console.log("StartSharing");

  let localStream;
  let localPeerConnection;
  let localWS;

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

  localWS = new WebSocket(serverAddress);
  localWS.addEventListener("close", () => console.log("SocketClosed"));
  localWS.addEventListener("message", onLocalMessage);

  const localConnectedWaiter = defer();
  localWS.addEventListener("open", localConnectedWaiter.resolve);
  await localConnectedWaiter.promise;

  localWS.send(JSON.stringify({
    kind: "Identify",
    socketKind: "Browser",
    browserId,
  }));

  localStream = await navigator.mediaDevices.getDisplayMedia({ video: true });

  localPeerConnection = new RTCPeerConnection({
    iceServers: [{
      urls: [
        "stun:stun.l.google.com:19302",
        "stun:stun1.l.google.com:19302",
        "stun:stun2.l.google.com:19302",
        "stun:stun.l.google.com:19302?transport=udp",
      ],
    }],
  });
  localPeerConnection.addEventListener("icecandidate", handleLocalConnection);

  localPeerConnection.addStream(localStream);
  localPeerConnection.createOffer({ offerToReceiveVideo: 1 })
    .then(createdOffer);

  function onLocalMessage(msg) {
    console.log("OnSocketMessage", msg.data);
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
}

module.exports = { startSharing };
