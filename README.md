Remote control of a recording chromium/linux browser in the cloud.

# Setup instructions

Start an instance to act as the server, creating TLS keys and adding them to the home directory per server.js

Start the server:

```
node src/restart.js ~/server.log src/server/server.js
```

Create another instance (or use the same one, whatever), with a `cloud-browser-config.js` file in the home directory with contents such as:

```
{
  "serverHost": "record.replay.io",
  "browserDir": "/path/to/browser-dir",
  "dispatchServer": "wss://dispatch.replay.io"
}
```

The browser directory will be used to download the browser and driver and keep them updated automatically. For testing, "executablePath" and "driverPath" can be specified instead, in which case automatic updates won't occur.

Configure the instance so that chrome will run (tested on an EC2 ubuntu image):

```
sudo apt update
sudo apt install lxde
sudo apt install tightvncserver
```

Run `vncserver`, configure, and connect to see that the desktop is in place.

Start the browser manager:

```
DISPLAY=:1 node src/restart.js ~/browser.log src/browser/main.js
```

Visit the server host URL to start cloud browsing!
