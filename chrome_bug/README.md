# Overview

STR for problem screen sharing in chromium. The files in this directory were derived from https://codelabs.developers.google.com/codelabs/webrtc-web/#4 and https://github.com/googlecodelabs/webrtc-web/tree/master/step-02. This seems like the same problem as https://github.com/muaz-khan/WebRTC-Experiment/issues/699

Run `node server.js` to start server (needs to be restarted after each attempt).

# Working example

1. Visit http://localhost:8000/combined.html
2. Pick a window/tab/etc. to share
3. Video loads as expected

# Broken example

This is the same as the working example, except that the local/remote logic has been split into two files for loading in separate tabs.

1. Visit http://localhost:8000/local.html
2. Pick a window/tab/etc. to share
3. Load a new tab and visit http://localhost:8000/remote.html
4. Video loads as white. No errors are shown in either tab.
