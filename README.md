# 图片命名下载（Figma Dev Mode）

在 Figma Dev Mode 中批量导出所选图片或图层，按自定义规则重命名，并合并为一个 ZIP 下载。插件不会修改设计文件。

## 功能

- 支持 PNG、JPG、SVG、PDF。
- 支持 1×、2×、3×、4× 位图导出。
- 支持文件名预览、单独下载和统一打包下载。
- 支持命名变量：`{name}`、`{index}`、`{parent}`、`{page}`、`{type}`、`{width}`、`{height}`、`{format}`、`{scale}`、`{date}`。
- 同名文件自动追加 `-2`、`-3`，并按 Windows 不区分大小写的规则检测重复。
- 自动处理 Windows 非法字符、结尾句点/空格及 `CON`、`AUX`、`NUL` 等保留名称。
- 设置通过 Figma 插件存储保存，不依赖面板内的浏览器存储。

## 安装

1. 在本目录执行 `npm install`，然后执行 `npm run build`。
2. 打开 Figma 桌面端，进入 **Plugins → Development → Import plugin from manifest…**。
3. 选择本目录中的 `manifest.json`。
4. 打开任意设计文件并切换到 Dev Mode，在插件面板运行“图片命名下载”。

## 使用

1. 在画布中选中需要下载的一个或多个图片/图层。
2. 选择导出格式、倍率和命名模板。
3. 在预览区确认文件名，单独下载文件或点击底部按钮打包下载。

默认规则为 `{name}-{index}`。例如两个都叫 `name` 的图层会得到 `name-01.png` 和 `name-02.png`；即使使用 `{name}`，也会自动得到 `name.png` 和 `name-2.png`。

## 开发

- `npm run watch`：在 `dist/` 根目录生成开发产物并持续监听源码变化。
- `npm run build`：在 `dist/dev-mode-asset-renamer-local_<version>/` 生成可独立导入的版本发布目录。
- `npm run typecheck`：执行 TypeScript 类型检查。
- `npm run test`：执行命名规则和压缩包测试。
- `npm run check`：执行类型检查、测试和生产构建。

发布目录包含：

```text
dist/dev-mode-asset-renamer-local_1.3.0/
├─ manifest.json
└─ dist/
   ├─ code.js
   └─ ui.html
```

发布到 Figma Community 前，请使用 Figma 创建插件时分配的正式插件 ID 替换 `manifest.json` 中的本地 ID。
