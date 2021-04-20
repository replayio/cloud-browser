/* Copyright 2020 Record Replay Inc. */

// This module is similar to the "forever" tool, but slimmed down to just the
// necessary functionality and packaged up here so it doesn't need to be
// separately installed (which can be problematic).

if (process.argv.length < 4) {
  console.log("Usage: node restart log-file other-script other-script-args");
  process.exit(1);
}

const fs = require("fs");
const { spawn } = require("child_process");

if (process.argv[2] != "@NOHUP@") {
  // Respawn the process in the background.
  spawn(process.argv[0], [process.argv[1], "@NOHUP@", ...process.argv.slice(2)], {
    stdio: "inherit",
  }).unref();
  console.log("Restart process spawned, exiting...");
  process.exit(0);
}

const log = fs.createWriteStream(process.argv[3]);

let child;

function spawnProcess() {
  log.write(`**** Spawning process...\n`);
  child = spawn(process.argv[0], process.argv.slice(4));
  child.stdout.on("data", buf => log.write(buf));
  child.stderr.on("data", buf => log.write(buf));
  child.stdout.on("error", () => {});
  child.stderr.on("error", () => {});
  child.on("exit", () => setTimeout(spawnProcess, 5000));
}

spawnProcess();
