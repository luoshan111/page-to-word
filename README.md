# 网页导出到 Word

版本 1.1.0。一个无需服务器、无需构建即可加载的 Chrome / Edge 扩展。点击按钮，将当前网页正文导出为可编辑的 `.docx` 文件。已在 Edge 154 中运行实际扩展下载检查；Chrome 的人工安装与交互尚未实测。

## 本地安装

1. 下载并解压整个 `page-to-word` 文件夹。
2. 在 Chrome 打开 `chrome://extensions`，或在 Edge 打开 `edge://extensions`。
3. 打开“开发者模式”，点击“加载已解压的扩展程序”，选择该文件夹。
4. 打开一篇普通文章页面，点击扩展图标，再点“导出为 .docx”，选择保存位置。
5. 生成过程中保持弹窗打开。提交下载后，在浏览器下载列表中确认文件已保存。

如果已安装旧版，请在扩展管理页点击“重新加载”，并接受新增的下载权限。若要导出本地 HTML，在扩展详情中启用“允许访问文件网址”。

## 当前范围

- 适合文章、博客和普通资讯页。
- 保留中文与 emoji、段落、标题、粗体、斜体、下划线、换行、代码块、引用、可点击链接和基础表格。
- 保留列表顺序、起始编号、嵌套缩进；列表标记是文本，暂不提供 Word 自动编号。
- 排除隐藏文字、导航、页脚、侧栏和表单；不修改原网页，也不会删除相邻的重复段落。
- 优先选择最大的可见 `main` / 主区域，其次为 `article`，最后使用页面主体。这是通用规则，复杂站点仍可能混入非正文内容。
- 图片、媒体、iframe、Shadow DOM 组件、未加载的文字、复杂布局与完整表格合并关系暂不支持。识别到部分遗漏时会显示提示。
- 单次处理最多 50,000 个遍历节点、1,000,000 个正文字符、100 层嵌套。超限会明确拒绝，不生成静默截断的文档。
- 扩展页面内完成提取与生成，不调用外部接口，不上传或长期保存网页内容。

## 权限

- `activeTab`：用户点扩展时，临时访问当前页面。
- `scripting`：在当前页面执行正文提取函数。
- `downloads`：发起文件保存并处理下载失败。

没有配置常驻内容脚本、后台服务或全站访问权限。浏览器设置页、扩展商店等受限页面会显示中文提示。实现依据：[Chrome scripting API](https://developer.chrome.com/docs/extensions/reference/api/scripting)、[Chrome downloads API](https://developer.chrome.com/docs/extensions/reference/api/downloads)。

## 文件

- `manifest.json`：扩展清单与所需权限。
- `popup.html` / `popup.css`：扩展弹窗界面。
- `popup.js`：界面状态和交互。
- `src/extract-page.js`：可序列化的 DOM 提取函数，输出纯数据。
- `src/document.js`：数据到 DOCX 的转换、XML 字符清理、文件名处理。
- `src/export-service.js`：权限错误、导出流程、下载调用。
- `vendor/docx.mjs`：原样保存的 docx 9.6.1 浏览器构建，离线加载。
- `tests/`：核心测试、真实浏览器检查、实际扩展端到端检查。
- `CHECKS.md`：本次检查结果及验证范围。

## 开发与测试

安装扩展本身不需要 Node.js 或 npm。运行测试时需要 Node.js 22+：

```sh
npm install
npm test
npm run test:browser
npm run test:extension
```

浏览器检查默认使用已安装的 Edge。`test:browser` 可通过 `BROWSER_EXE` 指定浏览器可执行文件。端到端测试需要支持 CDP `Extensions.triggerAction` 的较新 Edge，会创建独立测试配置目录，自动加载原版扩展并自动处理保存对话框，不使用个人浏览器配置。

测试产物默认写入 `test-results/`，也可用 `TEST_ARTIFACT_DIR` 指定目录。当前工程无需构建；编辑后在浏览器扩展管理页重新加载即可。
