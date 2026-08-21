import { zipSync } from "fflate";
import type { ExportedFile } from "./types";

function toUint8Array(value: Uint8Array): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  return new Uint8Array(value as unknown as ArrayBuffer);
}

export function buildArchive(files: readonly ExportedFile[]): Uint8Array {
  const entries = Object.create(null) as Record<string, Uint8Array>;

  for (const file of files) {
    if (Object.prototype.hasOwnProperty.call(entries, file.name)) {
      throw new Error(`压缩包中出现重复文件名：${file.name}`);
    }
    entries[file.name] = toUint8Array(file.bytes);
  }

  return zipSync(entries, { level: 0 });
}
