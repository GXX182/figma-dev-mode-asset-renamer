# 图片命名下载（Figma Dev Mode）

在 Figma Dev Mode 中批量导出所选图片或图层，按自定义规则重命名，并合并为一个 ZIP 下载。插件不会修改设计文件。

## 功能

- 支持 PNG、JPG、SVG、PDF。
- 支持 1×、2×、3×、4× 位图导出。
- 支持 AI 根据设计图生成语义文件名，结果可预览、清除和重新分析。
- AI 分析会显示图片准备、当前批次、等待时间和已命名数量；每批结果即时写入预览，并支持中途取消和保留成功结果。
- 支持 Gemini 原生、OpenAI 兼容（Chat Completions/Responses）和 Anthropic 兼容接口，并可根据 Base URL 自动识别协议。
- 支持获取模型、管理多个 AI 服务、编辑或导入提示词，以及上传 `.md` / `.txt` Skill。
- 内置本地 Node 转发服务，插件运行前自动启动并通过 `127.0.0.1:7879` 请求，解决不支持 Figma CORS 的兼容接口。
- 支持命名变量：`{name}`、`{ai}`、`{index}`、`{parent}`、`{page}`、`{type}`、`{width}`、`{height}`、`{format}`、`{scale}`、`{date}`。
- 同名文件自动追加 `-2`、`-3`，并按 Windows 不区分大小写的规则检测重复。
- 自动处理 Windows 非法字符、结尾句点/空格及 `CON`、`AUX`、`NUL` 等保留名称。
- 所有图片放入一个 ZIP 下载，避免浏览器拦截多文件下载而造成遗漏。
- 设置通过 Figma 插件存储保存，不依赖面板内的浏览器存储。

## 安装

1. 在本目录执行 `npm install`，然后执行 `npm run build`。
2. 打开 Figma 桌面端，进入 **Plugins → Development → Import plugin from manifest…**。
3. 选择本目录中的 `manifest.json`。
4. 打开任意设计文件并切换到 Dev Mode，在插件面板运行“图片命名下载”。

本地开发版需要 Node.js 18 或更高版本。运行插件时，Figma 会通过清单中的构建钩子执行 `server/start-server.ps1`；启动器会查找 Node、复用已有服务，或在后台启动监听 `127.0.0.1:7879` 的服务。自动启动失败时，也可以直接双击 `server/start-server.cmd` 查看错误。

## 使用

1. 在画布中选中需要下载的一个或多个图片/图层。
2. 选择导出格式、倍率和命名模板。
3. 如需 AI 命名，在“AI 语义命名”右上角打开设置，配置 Base URL、API Key、模型和命名策略。
4. 点击“AI 分析当前选择”，在预览区确认或清除语义文件名。
5. 点击“打包下载”，解压 ZIP 后即可得到重命名完成的资源。

默认规则为 `{name}-{index}`，例如两个都叫 `name` 的图层会得到 `name-01.png` 和 `name-02.png`。即使使用 `{name}`，也会自动得到 `name.png` 和 `name-2.png`。

AI 分析成功后，语义名称会自动替代 `{name}` 的输入值，因此现有模板无需修改；也可以显式使用 `{ai}`。AI 只影响下载文件名，不会修改 Figma 图层。

## AI 数据与密钥

- 分析时，所选图层的缩略图、图层名、父级名、页面名、类型和尺寸会发送到当前选中的 AI 服务。
- API Key 保存到当前用户的 Figma 插件存储中；保存后界面只显示掩码，插件不会把完整 Key 写入日志。
- 自定义 Skill 只作为文字命名规范使用，不会执行其中的代码或命令。
- 因为 Base URL 由用户配置，插件清单需要允许访问任意网络域名。请只配置有权接收相关设计图的服务。
- 本地服务不保存 API Key、图片或上游响应，只在内存中完成单次转发；它只允许公开 HTTPS 上游，并阻止内网、回环和保留地址。

## 开发

- `npm run watch`：在 `dist/` 根目录生成开发产物并持续监听源码变化。
- `npm run server`：检查并后台启动 `127.0.0.1:7879` 本地转发服务。
- `npm run server:foreground`：在当前终端前台运行本地转发服务，便于排查启动问题。
- `npm run build`：只在 `dist/dev-mode-asset-renamer-local_<version>/` 生成可独立导入的版本发布目录。
- `npm run check`：执行类型检查、命名规则测试和生产构建。

日常开发请先运行 `npm run watch`，再从项目根目录导入 `manifest.json`。执行 `npm run build` 后，交付版本应导入版本目录中的清单，例如：

```text
dist/dev-mode-asset-renamer-local_1.6.0/
├─ manifest.json
├─ dist/
│  ├─ code.js
│  └─ ui.html
└─ server/
   ├─ server.mjs
   ├─ service.mjs
   ├─ start-server.mjs
   ├─ start-server.ps1
   └─ start-server.cmd
```

版本目录中的 `manifest.json` 使用相对路径 `dist/code.js` 和 `dist/ui.html`，可以直接复制整个版本目录进行安装或交付。

发布到 Figma Community 前，请使用 Figma 创建插件时分配的正式插件 ID 替换 `manifest.json` 中的本地 ID。
