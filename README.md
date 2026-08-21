# 图片命名下载（Figma Dev Mode）

在 Figma Dev Mode 中批量导出所选图片或图层，按自定义规则重命名，并合并为一个 ZIP 下载。插件不会修改设计文件。

## 功能

- 支持 PNG、JPG、SVG、PDF。
- 支持 1×、2×、3×、4× 位图导出。
- 支持 AI 根据设计图生成语义文件名，结果可预览、清除和重新分析。
- 支持 Gemini 原生、OpenAI 兼容（Chat Completions/Responses）和 Anthropic 兼容接口，并可根据 Base URL 自动识别协议。
- 支持获取模型、管理多个 AI 服务、编辑或导入提示词，以及上传 `.md` / `.txt` Skill。
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

## 开发

- `npm run watch`：监听并重新构建。
- `npm run check`：执行类型检查、命名规则测试和生产构建。

发布到 Figma Community 前，请使用 Figma 创建插件时分配的正式插件 ID 替换 `manifest.json` 中的本地 ID。
