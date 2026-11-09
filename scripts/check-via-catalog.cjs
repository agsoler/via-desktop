const fs = require("node:fs");
const path = require("node:path");

function checkViaCatalog(publicDir) {
  const definitions = path.join(publicDir, "definitions");
  const read = (name) =>
    JSON.parse(fs.readFileSync(path.join(definitions, name), "utf8"));
  const index = read("supported_kbs.json");
  const hash = read("hash.json");
  if (
    !Number.isFinite(index?.generatedAt) ||
    index.generatedAt <= 0 ||
    typeof index.version !== "string" ||
    typeof hash !== "string" ||
    !/^[a-f\d]{64}$/i.test(hash)
  ) {
    throw new Error("VIA generated an invalid catalog index or hash.");
  }

  let count = 0;
  for (const version of ["v2", "v3"]) {
    const ids = index.vendorProductIds?.[version];
    if (!Array.isArray(ids) || !ids.every(Number.isSafeInteger)) {
      throw new Error(`VIA generated an invalid ${version} device list.`);
    }
    for (const id of ids) {
      const name = `${version}/${id}.json`;
      const definition = read(name);
      if (
        definition?.vendorProductId !== id ||
        !definition.matrix ||
        !definition.layouts
      ) {
        throw new Error(`VIA generated an invalid definition at ${name}.`);
      }
      count++;
    }
  }
  if (!count) throw new Error("VIA generated an empty catalog.");
  return count;
}

module.exports = { checkViaCatalog };

if (require.main === module) {
  const count = checkViaCatalog(process.argv[2] ?? "public");
  console.log(`Verified ${count} indexed VIA definitions.`);
}
