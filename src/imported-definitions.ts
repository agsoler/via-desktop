import { createHash } from "crypto";
import fs from "fs";
import path from "path";
import {
  Catalog,
  isKeyboardDefinition,
  readLocalJson,
  saveJson,
} from "./definitions";

export type DefinitionVersion = "v2" | "v3";

export function saveImportedDefinition(
  directory: string,
  version: DefinitionVersion,
  definition: { vendorProductId: number },
) {
  return saveJson(
    path.join(directory, version, `${definition.vendorProductId}.json`),
    definition,
  );
}

export function readImportedDefinitions(directory: string, catalog: Catalog) {
  const index = {
    ...catalog.index,
    vendorProductIds: {
      v2: [...catalog.index.vendorProductIds.v2],
      v3: [...catalog.index.vendorProductIds.v3],
    },
  };
  const definitions = new Map<string, unknown>();
  const hash = createHash("sha256").update(catalog.hash);

  for (const version of ["v2", "v3"] as const) {
    const versionDirectory = path.join(directory, version);
    const names = fs.existsSync(versionDirectory)
      ? fs.readdirSync(versionDirectory).sort()
      : [];
    for (const name of names) {
      if (!/^\d+\.json$/.test(name)) continue;
      const id = Number.parseInt(name, 10);
      const definition = readLocalJson(
        path.join(versionDirectory, name),
      )?.value;
      if (!isKeyboardDefinition(definition, id)) continue;
      const relativePath = `${version}/${name}`;
      definitions.set(relativePath, definition);
      hash.update(JSON.stringify([relativePath, definition]));
      if (!index.vendorProductIds[version].includes(id)) {
        index.vendorProductIds[version].push(id);
      }
    }
  }

  return {
    definitions,
    index,
    hash: definitions.size ? hash.digest("hex") : catalog.hash,
  };
}
