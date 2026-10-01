# 网页导出到 Word · Page to Word

把当前网页的标题、正文和来源链接保存为可编辑的 Word（`.docx`）文档。适合保存文章、博客和普通资讯页。

**当前插件版本：1.1.0。** 使用本地加载方式安装到桌面 Edge 或 Chrome，无需注册账号、API Key、服务器或构建步骤。普通使用者不需要安装 Node.js。

[详细使用指南](docs/USAGE.md) · [下载源码 ZIP](https://github.com/luoshan111/page-to-word/archive/refs/heads/main.zip) · [功能检查记录](CHECKS.md) · [反馈问题](https://github.com/luoshan111/page-to-word/issues)

## 快速开始

1. [下载源码 ZIP](https://github.com/luoshan111/page-to-word/archive/refs/heads/main.zip)，解压到一个长期保留的文件夹。GitHub 下载包解压后通常叫 `page-to-word-main`。
2. 在浏览器**地址栏**输入 `edge://extensions`（Edge）或 `chrome://extensions`（Chrome），打开“开发者模式”。
3. 点击“加载解压缩的扩展”或“加载已解压的扩展程序”，选择**直接包含 `manifest.json` 的文件夹**。
4. 打开要保存的文章网页，在浏览器扩展菜单中点击“网页导出到 Word”，然后点击“导出为 .docx”。
5. 生成过程中保持弹窗打开；出现保存对话框后选择位置。到浏览器下载列表确认完成，再用 Word 打开文件。

不要选择 ZIP 文件，也不要只下载 `manifest.json`。详细的分浏览器操作见[使用指南](docs/USAGE.md)。本地加载步骤可参考 [Edge 官方说明](https://learn.microsoft.com/en-us/microsoft-edge/extensions/getting-started/extension-sideloading)和 [Chrome 官方说明](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked)。

## 导出效果

文档按“标题 → 来源链接 → 正文”组织，采用 A4 页面和统一的文档样式。默认文件名来自文章标题，并处理 Windows 不支持的文件名字符。

| 内容 | 当前行为 |
| --- | --- |
| 中文、英文、emoji、段落与换行 | 支持 |
| 标题、引用、代码块 | 保留基础结构，代码块保留换行与空白 |
| 粗体、斜体、下划线 | 识别相应 HTML 标签；不完整复刻网页 CSS |
| 网页链接 | 支持 HTTP、HTTPS 和邮件链接 |
| 有序与无序列表 | 保留编号和缩进；标记为文本，不是 Word 自动编号 |
| 基础表格 | 支持；合并单元格会简化，复杂表格可能需要手动整理 |
| 图片、音视频、嵌入页面 | 暂不导出 |
| 网页布局、字体与配色 | 使用文档样式，不保证还原网页外观 |

自动识别优先选择可见的主内容区域，其次为文章区域，最后使用页面主体。提取器会过滤常见导航、页脚、侧栏、表单和隐藏内容，但特殊站点仍可能混入非正文文字。

## 使用范围与限制

- 每次导出当前标签页已经加载的内容；没有批量导出、跨页抓取或“只导出选中文字”功能。
- 先展开“阅读全文”和需要的折叠内容。懒加载页面需先滚动加载；若网站会移除屏幕外内容，滚动也不能保证完整导出。
- PDF 阅读器、图片文字识别、浏览器内部页面和扩展商店不在当前支持范围内。
- 不读取 iframe 内部或 Shadow DOM 组件内部的正文，也不能获取尚未加载或无权访问的内容。
- 超过 50,000 个遍历节点、1,000,000 个正文字符或 100 层遍历深度时会提示内容过大，停止导出，不静默截断。

## 数据与权限

正文提取和 DOCX 生成都在本机执行。扩展没有服务器请求、账号系统或页面内容存储。生成的文件保存在你选择的位置，并包含原网页 URL；导出已登录页面时同样如此。

| 权限 | 用途 |
| --- | --- |
| `activeTab` | 点击扩展时临时访问当前页面 |
| `scripting` | 在当前页面执行正文提取代码 |
| `downloads` | 发起文件保存并处理下载启动失败 |

没有配置全站访问权限、常驻内容脚本或后台服务。导出本地 HTML 需要在扩展详情中另行启用“允许访问文件网址”。

## 开发与测试

仅修改或使用插件不需要构建。运行测试时，准备 Node.js 22+ 和 npm；浏览器相关测试默认需要已安装的桌面 Edge。

```sh
git clone https://github.com/luoshan111/page-to-word.git
cd page-to-word
npm install
npm test
npm run test:browser
npm run test:extension
```

| 命令 | 检查范围 |
| --- | --- |
| `npm test` | 文件名、XML 字符、DOCX 文件、流程与错误处理 |
| `npm run test:browser` | 真实 DOM 提取、弹窗交互；扩展 API 使用受控替身 |
| `npm run test:extension` | 原版扩展安装、临时页面权限、注入和实际下载 |

端到端脚本需要支持 CDP `Extensions.triggerAction` 的较新 Edge。它创建独立测试浏览器配置，自动处理保存对话框，不使用个人浏览器配置。`BROWSER_EXE` 只用于覆盖 `test:browser` 的浏览器路径；`TEST_ARTIFACT_DIR` 可指定两类浏览器检查的产物目录，默认是 `test-results/`。

修改代码后，到扩展管理页点击“重新加载”，再打开目标页面重试。通过 Git 更新和通过 ZIP 更新的操作见[使用指南](docs/USAGE.md)。

## 项目结构

```text
page-to-word/
├── manifest.json            # 扩展配置与权限
├── popup.html / popup.css   # 弹窗界面
├── popup.js                 # 交互和界面状态
├── src/
│   ├── extract-page.js      # 读取网页并输出纯数据
│   ├── document.js          # 生成 DOCX、处理文件名
│   └── export-service.js    # 导出流程和下载调用
├── vendor/                  # 本地 DOCX 库与第三方许可说明
├── tests/                   # 自动检查与示例网页
├── docs/USAGE.md            # 安装、使用、更新、故障排查
└── CHECKS.md                # 已执行的功能检查及边界
```

DOCX 库使用本地打包的 docx 9.6.1；版本、校验值和第三方许可见 [vendor/NOTICE.md](vendor/NOTICE.md)。

## 已验证范围

2026-09-26 的功能检查中，8 项核心测试、7 组 Edge 浏览器场景及真实扩展下载检查通过。DOCX ZIP 完整性、XML 解析和 python-docx 读取通过。环境和详细结果见 [CHECKS.md](CHECKS.md)。

这些记录不代表所有站点都已验证。尚未在桌面 Word 中逐页人工验收，也未进行 Chrome 人工安装检查。本次文档更新日期为 2026-10-01，不代表功能测试在该日重新执行。
