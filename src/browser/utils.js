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

module.exports = { assert, defer };
