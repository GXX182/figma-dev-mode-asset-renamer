import { unzipSync } from "fflate";
import { buildArchive } from "../src/archive";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const archive = buildArchive([
  { name: "name.png", bytes: new Uint8Array([1, 2, 3]) },
  { name: "Name-2.png", bytes: new Uint8Array([4, 5, 6]) },
  { name: "中文图片-03.png", bytes: new Uint8Array([7, 8, 9]) }
]);
const extracted = unzipSync(archive);
const names = Object.keys(extracted).sort();

assert(names.length === 3, `压缩包文件数量错误：${names.length}`);
assert(names.includes("name.png"), "压缩包缺少 name.png");
assert(names.includes("Name-2.png"), "压缩包缺少 Name-2.png");
assert(names.includes("中文图片-03.png"), "压缩包缺少中文文件名");
assert(extracted["Name-2.png"].join(",") === "4,5,6", "压缩包文件内容不完整");

let duplicateRejected = false;
try {
  buildArchive([
    { name: "same.png", bytes: new Uint8Array([1]) },
    { name: "same.png", bytes: new Uint8Array([2]) }
  ]);
} catch {
  duplicateRejected = true;
}
assert(duplicateRejected, "重复文件名应在生成压缩包前被拒绝");

console.log("压缩包完整性测试通过");
