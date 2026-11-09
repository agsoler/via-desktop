const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { checkViaCatalog } = require("../scripts/check-via-catalog.cjs");

test("portable build requires a matching file for each indexed keyboard", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "via-build-catalog-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const definitions = path.join(root, "definitions");
  const write = (name, value) =>
    fs.writeFileSync(path.join(definitions, name), JSON.stringify(value));
  fs.mkdirSync(path.join(definitions, "v3"), { recursive: true });
  write("hash.json", "a".repeat(64));
  write("supported_kbs.json", {
    generatedAt: 1,
    version: "1",
    vendorProductIds: { v2: [], v3: [123] },
  });

  assert.throws(() => checkViaCatalog(root), /123\.json/);
  write("v3/123.json", { vendorProductId: 456, matrix: {}, layouts: {} });
  assert.throws(() => checkViaCatalog(root), /invalid definition.*123\.json/);
  write("v3/123.json", { vendorProductId: 123, matrix: {}, layouts: {} });
  assert.equal(checkViaCatalog(root), 1);
});
