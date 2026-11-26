const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { parseImportedDefinition } = require("../src/definition-import.ts");
const {
  readImportedDefinitions,
  saveImportedDefinition,
} = require("../src/imported-definitions.ts");

const id = 0x12340001;
const draft = {
  name: "Test Keyboard",
  vendorId: "0x1234",
  productId: "0x0001",
  matrix: { rows: 1, cols: 1 },
  layouts: { keymap: [["0,0"]] },
};
const json = (data) => Buffer.from(JSON.stringify(data));

test("accepts a VIA draft and rejects invalid JSON and layout exports", () => {
  const imported = parseImportedDefinition(json(draft));
  assert.equal(imported.version, "v3");
  assert.equal(imported.definition.vendorProductId, id);
  assert.throws(
    () => parseImportedDefinition(Buffer.from("invalid")),
    /valid JSON/,
  );
  assert.throws(
    () => parseImportedDefinition(json({ name: "Saved layout", layers: [[]] })),
    /keyboard definition/,
  );
  assert.throws(
    () => parseImportedDefinition(json({ ...draft, vendorId: "0x0000" })),
    /vendor and product ID/,
  );
});

test("publishes imported definitions in the local catalogue and invalidates VIA's cache on re-import", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "via-import-test-"));
  const catalog = {
    hash: "0".repeat(64),
    index: {
      generatedAt: 1,
      version: "1",
      vendorProductIds: { v2: [], v3: [123] },
    },
  };
  const { version, definition } = parseImportedDefinition(json(draft));

  try {
    assert.equal(readImportedDefinitions(dir, catalog).hash, catalog.hash);
    await saveImportedDefinition(dir, version, definition);
    const first = readImportedDefinitions(dir, catalog);
    assert.deepEqual(first.index.vendorProductIds.v3, [123, id]);
    assert.deepEqual(catalog.index.vendorProductIds.v3, [123]);
    assert.deepEqual(
      first.definitions.get(`v3/${id}.json`),
      JSON.parse(json(definition)),
    );
    assert.notEqual(first.hash, catalog.hash);
    assert.equal(readImportedDefinitions(dir, catalog).hash, first.hash);
    const renamed = { ...definition, name: "Renamed Keyboard" };
    await saveImportedDefinition(dir, version, renamed);
    const updated = readImportedDefinitions(dir, catalog);
    assert.notEqual(updated.hash, first.hash);
    assert.deepEqual(
      updated.definitions.get(`v3/${id}.json`),
      JSON.parse(json(renamed)),
    );
  } finally {
    assert.equal(
      path.dirname(fs.realpathSync(dir)),
      fs.realpathSync(os.tmpdir()),
    );
    fs.rmSync(dir, { recursive: true });
  }
});
