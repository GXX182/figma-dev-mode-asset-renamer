import { buildDownloadNames, findUnknownTokens, sanitizeWindowsStem } from "../src/naming";
import type { ExportableNodeInfo, NamingConfig } from "../src/types";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const baseConfig: NamingConfig = {
  template: "{name}",
  startIndex: 1,
  indexPadding: 2,
  duplicateSeparator: "-",
  lowercase: false,
  spaces: "keep"
};

const node = (name: string): ExportableNodeInfo => ({
  id: name,
  name,
  type: "RECTANGLE",
  parentName: "Gallery",
  pageName: "Home",
  width: 120.4,
  height: 80.2
});

const duplicateNames = buildDownloadNames(
  [node("name"), node("Name"), node("name.png")],
  baseConfig,
  "PNG",
  2,
  new Date(2026, 7, 21)
);
assert(
  JSON.stringify(duplicateNames) === JSON.stringify(["name.png", "Name-2.png", "name-3.png"]),
  `同名去重失败：${duplicateNames.join(", ")}`
);

const templated = buildDownloadNames(
  [node("Hero Image")],
  { ...baseConfig, template: "{page}_{name}_{index}_{width}x{height}_{scale}x_{date}", spaces: "hyphen" },
  "JPG",
  3,
  new Date(2026, 7, 21)
);
assert(
  templated[0] === "Home_Hero-Image_01_120x80_3x_20260821.jpg",
  `模板替换失败：${templated[0]}`
);

assert(sanitizeWindowsStem("CON") === "_CON", "Windows 保留名未处理");
assert(sanitizeWindowsStem('a<b>:c/"d"?* ') === "a-b-c-d-", "Windows 非法字符未处理");
assert(findUnknownTokens("{name}-{foo}-{FOO}").join(",") === "foo", "未知变量检测失败");

const semantic = buildDownloadNames(
  [node("background")],
  { ...baseConfig, template: "{name}-{index}" },
  "PNG",
  2,
  new Date(2026, 7, 21),
  { background: "membership-coupon-background" }
);
assert(semantic[0] === "membership-coupon-background-01.png", `AI 语义名称未进入模板：${semantic[0]}`);

console.log("命名规则测试通过");
