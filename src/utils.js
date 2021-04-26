const { spawn } = require("child_process");

function assert(v) {
  if (!v) {
    throw new Error("Assertion failed!");
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

function waitForTime(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function spawnAsync(command, args, options) {
  const process = spawn(command, args, options);

  const [stdout] = await Promise.all([
    (async () => {
      if (!process.stdout) {
        return "";
      }

      const parts = [];
      for await (const chunk of process.stdout) {
        parts.push(chunk);
      }
      return Buffer.concat(parts).toString();
    })(),
    new Promise((resolve, reject) => {
      process.on("error", reject);
      process.on("exit", code => {
        if (code !== 0) {
          reject(new Error(`spawnAsync failed: ${command} ${args}`));
        } else {
          resolve();
        }
      });
    }),
  ]);

  return { stdout };
}


module.exports = { assert, defer, waitForTime, spawnAsync };
