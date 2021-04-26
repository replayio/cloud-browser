const fs = require("fs");

let gConfig;

function getConfig() {
  if (!gConfig) {
    gConfig = JSON.parse(fs.readFileSync(
      `${process.env.HOME}/cloud-browser-config.json`
    ));
  }
  return gConfig;
}

module.exports = { getConfig };
