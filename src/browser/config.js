const fs = require("fs");

function getConfig() {
  return JSON.parse(fs.readFileSync(
    `${process.env.HOME}/cloud-browser-config.json`
  ));
}

module.exports = { getConfig };
