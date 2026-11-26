const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

// Exercise the main-process connection handler without launching Electron.
require.cache[require.resolve("electron")] = { exports: {} };
const { registerViaConnection } = require("../src/hid.ts");
const {
  hasStoredViaDefinition,
  requestViaKeyboard,
} = require("../src/connection-screen.ts");

const origin = "via-desktop://index.html";
const device = { vendorId: 1234, productId: 5678 };

async function selectDevice({
  catalog = false,
  stored = false,
  discovery = false,
} = {}) {
  const window = new EventEmitter();
  const contents = new EventEmitter();
  const mainFrame = {};
  let connect;
  let checkedStoredDefinition = false;
  let reloaded = false;
  let pickerRequest;
  contents.mainFrame = mainFrame;
  contents.isDestroyed = () => false;
  contents.getURL = () => origin;
  contents.reload = () => (reloaded = true);
  contents.ipc = { handle: (channel, handler) => (connect = handler) };
  contents.executeJavaScript = async (script) => {
    if (
      hasStoredViaDefinition &&
      script.startsWith(`(${hasStoredViaDefinition})`)
    ) {
      checkedStoredDefinition = true;
      return stored;
    }
    return runInNewContext(script, {
      navigator: {
        hid: {
          requestDevice: async () => {
            assert.equal(pickerRequest.definitionId, undefined);
            return discovery ? [] : [device];
          },
        },
      },
    });
  };
  window.webContents = contents;
  registerViaConnection(
    window,
    origin,
    () => catalog,
    (request) => {
      if (request && discovery) {
        request.selection = Promise.resolve(
          device.vendorId * 65536 + device.productId,
        );
      }
      pickerRequest = request;
    },
  );
  const result = await connect({ senderFrame: mainFrame });
  assert.equal(pickerRequest, undefined);
  return {
    result,
    checkedStoredDefinition,
    reloaded,
  };
}

test("explains how to connect a selected keyboard that lacks a VIA definition", async () => {
  const { result, reloaded } = await selectDevice();
  assert.equal(result.granted, false);
  assert.equal(reloaded, false);
  assert.match(
    result.message,
    /needs a VIA definition.*Load VIA definition and connect/,
  );
});

test("uses USB approval from a concurrent discovery request", async () => {
  const { result, reloaded } = await selectDevice({
    discovery: true,
    stored: true,
  });
  assert.equal(result.granted, true);
  assert.equal(reloaded, true);
});

test("reads a selected keyboard with a catalog or previously imported definition", async () => {
  const catalog = await selectDevice({ catalog: true });
  assert.equal(catalog.result.granted, true);
  assert.equal(catalog.checkedStoredDefinition, false);
  assert.equal(catalog.reloaded, true);
  const saved = await selectDevice({ stored: true });
  assert.equal(saved.result.granted, true);
  assert.equal(saved.checkedStoredDefinition, true);
  assert.equal(saved.reloaded, true);
});

test("importing a definition reuses the grant from a prior Connect attempt", async () => {
  const filter = { ...device, usagePage: 0xff60, usage: 0x61 };
  const select = runInNewContext(`(${requestViaKeyboard})`, {
    navigator: {
      hid: {
        getDevices: async () => [
          { ...device, collections: [{ usagePage: 0xff60, usage: 0x61 }] },
        ],
        requestDevice: () => assert.fail("The device is already authorized"),
      },
    },
  });
  assert.equal(
    await select(filter, true),
    device.vendorId * 65536 + device.productId,
  );
});
