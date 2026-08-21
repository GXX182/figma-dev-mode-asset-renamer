# 图片命名下载（Figma Dev Mode）

在 Figma Dev Mode 中批量导出所选图片或图层，按自定义规则重命名，并合并为一个 ZIP 下载。插件不会修改设计文件。

## 功能

- 支持 PNG、JPG、SVG、PDF。
- 支持 1×、2×、3×、4× 位图导出。
- 支持命名变量：`{name}`、`{index}`、`{parent}`、`{page}`、`{type}`、`{width}`、`{height}`、`{format}`、`{scale}`、`{date}`。
- 同名文件自动追加 `-2`、`-3`，并按 Windows 不区分大小写的规则检测重复。
- 自动处理 Windows 非法字符、结尾句点/空格及 `CON`、`AUX`、`NUL` 等保留名称。
- 所有图片放入一个 ZIP 下载，避免浏览器拦截多文件下载而造成遗漏。
- 设置通过 Figma 插件存储保存，不依赖面板内的浏览器存储。

## 安装

1. 在本目录执行 `npm install`，然后执行 `npm run build`。
2. 打开 Figma 桌面端，进入 **Plugins → Development → Import plugin from manifest…**。
3. 选择本目录中的 `manifest.json`。
4. 打开任意设计文件并切换到 Dev Mode，在插件面板运行“图片命名下载”。

## 使用

1. 在画布中选中需要下载的一个或多个图片/图层。
2. 选择导出格式、倍率和命名模板。
3. 在预览区确认文件名。
4. 点击“打包下载”，解压 ZIP 后即可得到重命名完成的资源。

默认规则为 `{name}-{index}`，例如两个都叫 `name` 的图层会得到 `name-01.png` 和 `name-02.png`。即使使用 `{name}`，也会自动得到 `name.png` 和 `name-2.png`。

## 开发

- `npm run watch`：监听并重新构建。
- `npm run check`：执行类型检查、命名规则测试和生产构建。

发布到 Figma Community 前，请使用 Figma 创建插件时分配的正式插件 ID 替换 `manifest.json` 中的本地 ID。
