import {
  isKeyboardDefinitionV2,
  isKeyboardDefinitionV3,
  isVIADefinitionV2,
  isVIADefinitionV3,
  keyboardDefinitionV2ToVIADefinitionV2,
  keyboardDefinitionV3ToVIADefinitionV3,
} from "@the-via/reader";
import type { DefinitionVersion } from "./imported-definitions";

export const maxDefinitionBytes = 4 * 1024 * 1024;

function readDefinition(input: unknown) {
  if (isKeyboardDefinitionV3(input)) {
    return {
      version: "v3" as const,
      definition: keyboardDefinitionV3ToVIADefinitionV3(input),
    };
  }
  if (isKeyboardDefinitionV2(input)) {
    return {
      version: "v2" as const,
      definition: keyboardDefinitionV2ToVIADefinitionV2(input),
    };
  }
  if (isVIADefinitionV3(input))
    return { version: "v3" as const, definition: input };
  if (isVIADefinitionV2(input))
    return { version: "v2" as const, definition: input };
  throw new Error(
    "Choose a VIA keyboard definition JSON file from your keyboard manufacturer.",
  );
}

export function parseImportedDefinition(bytes: Buffer): {
  version: DefinitionVersion;
  definition: { vendorProductId: number };
} {
  if (bytes.length > maxDefinitionBytes) {
    throw new Error("Choose a VIA keyboard definition smaller than 4 MB.");
  }
  let input: unknown;
  try {
    input = JSON.parse(bytes.toString("utf8").replace(/^\uFEFF/, ""));
  } catch {
    throw new Error("This file does not contain valid JSON.");
  }
  const result = readDefinition(input);
  const id = result.definition.vendorProductId;
  if (!Number.isSafeInteger(id) || id < 0x10000 || id > 0xffffffff) {
    throw new Error(
      "This definition does not contain a valid USB vendor and product ID.",
    );
  }
  return result;
}
