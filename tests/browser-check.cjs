const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const artifactDir = process.env.TEST_ARTIFACT_DIR || path.join(root, 'test-results');

(async () => {
  const { extractPage } = await import(pathToFileURL(path.join(root, 'src/extract-page.js')));
  const { createDocx } = await import(pathToFileURL(path.join(root, 'src/document.js')));
  const server = http.createServer(async (req, res) => {
    const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\//, '');
    const file = path.resolve(root, relative || 'popup.html');
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const body = await fs.readFile(file);
      const type = file.endsWith('.js') || file.endsWith('.mjs') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html';
      res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8` }).end(body);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  let checks = 0;
  const pass = name => { checks++; console.log(`PASS ${name}`); };
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.BROWSER_EXE ? { executablePath: process.env.BROWSER_EXE } : { channel: 'msedge' }) });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/README.md`);
    await page.setContent(`<!doctype html><title>网页标题</title><style>.hidden{display:none}</style>
      <nav>导航不要导出</nav><main><h1>导出测试 😀</h1>
      <p>你好<strong>加粗</strong>，<em>斜体</em>与<a href="/reference">链接</a>。<br>第二行</p>
      <p class="hidden">隐藏内容</p><div aria-hidden="true"><p>隐藏子节点</p></div>
      <p>重复段落</p><p>重复段落</p>
      <ol start="3"><li>第三项<ul><li>嵌套项</li></ul></li><li value="8">第八项</li></ol>
      <pre><code>const x = 1;\n  return x;</code></pre>
      <table><tr><th>名称</th><th>数量</th></tr><tr><td>苹果</td><td>2</td></tr></table>
      <details><summary>摘要</summary><p>折叠内容</p></details>
      <img alt="测试图片"><p><a href="javascript:alert(1)">安全文本</a></p>
      </main><footer>页脚不要导出</footer>`);
    const before = await page.content();
    const data = await page.evaluate(extractPage);
    assert.equal(data.ok, true);
    const texts = data.blocks.filter(block => block.runs).map(block => block.runs.map(run => run.text).join(''));
    assert.equal(data.title, '导出测试 😀');
    assert.ok(texts.includes('你好加粗，斜体与链接。\n第二行'));
    assert.equal(texts.filter(text => text === '重复段落').length, 2);
    assert.ok(!JSON.stringify(data).includes('隐藏内容'));
    assert.ok(!JSON.stringify(data).includes('折叠内容'));
    assert.ok(!JSON.stringify(data).includes('导航不要导出'));
    assert.equal(data.blocks[0].runs.find(run => run.text === '加粗').bold, true);
    assert.equal(data.blocks.find(block => block.marker === '3.').runs[0].text, '第三项');
    assert.equal(data.blocks.find(block => block.marker === '8.').runs[0].text, '第八项');
    assert.equal(data.blocks.find(block => block.runs?.[0]?.text === '嵌套项').listDepth, 1);
    assert.equal(data.blocks.find(block => block.type === 'code').runs[0].text, 'const x = 1;\n  return x;');
    assert.equal(data.blocks.find(block => block.type === 'table').rows.length, 2);
    assert.ok(!JSON.stringify(data).includes('javascript:'));
    assert.equal(await page.content(), before);
    pass('真实 DOM：格式、中文、换行、嵌套列表、表格、隐藏内容与原页面不变');
    await fs.mkdir(artifactDir, { recursive: true });
    await fs.writeFile(path.join(artifactDir, 'sample.docx'), Buffer.from(await (await createDocx(data)).arrayBuffer()));
    await page.setContent('<p>' + '长'.repeat(1000001) + '</p>');
    assert.equal((await page.evaluate(extractPage)).code, 'PAGE_TOO_LARGE');
    pass('超大页面明确拒绝，不静默截断');
    await page.setContent('<nav>导航</nav>');
    assert.equal((await page.evaluate(extractPage)).code, 'EMPTY_PAGE');
    pass('空正文');
    await page.setContent('<article style="display:none"><p>隐藏文章</p></article><article><p>可见文章</p></article>');
    assert.equal((await page.evaluate(extractPage)).blocks[0].runs[0].text, '可见文章');
    pass('排除隐藏候选正文');
    await page.setContent('<main><h1>可见标题<span hidden>不应泄露</span></h1><table><tbody style="display:none"><tr><td>隐藏行</td></tr></tbody><tbody><tr><td>可见行</td></tr></tbody></table></main>');
    const filtered = await page.evaluate(extractPage);
    assert.equal(filtered.title, '可见标题');
    assert.ok(!JSON.stringify(filtered).includes('隐藏行'));
    assert.ok(!JSON.stringify(filtered).includes('不应泄露'));
    pass('标题与表格也排除隐藏后代');

    // Run the shipped popup in a real browser. Mock only privileged extension APIs.
    await page.addInitScript(data => {
      window.downloadCalls = [];
      window.chrome = { tabs: { query: async () => [{ id: 1, url: data.url }] },
        scripting: { executeScript: async () => [{ frameId: 0, result: data }] },
        downloads: { download: async options => { window.downloadCalls.push(options); return 123; } } };
    }, data);
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/popup.html`);
    await page.locator('#exportButton').click();
    await page.waitForFunction(() => document.querySelector('#status').textContent.includes('已提交'));
    assert.equal(await page.evaluate(() => window.downloadCalls.length), 1);
    assert.equal(await page.locator('#exportButton').isEnabled(), true);
    assert.equal(errors.length, 0);
    await page.screenshot({ path: path.join(artifactDir, 'popup.png') });
    pass('真实浏览器弹窗：ESM 加载、DOCX 生成、下载参数、按钮恢复、无 JS 错误');
    await page.evaluate(() => { chrome.downloads.download = async () => { throw Error('User canceled'); }; });
    await page.locator('#exportButton').click();
    await page.waitForFunction(() => document.querySelector('#status').classList.contains('error'));
    assert.match(await page.locator('#status').textContent(), /取消保存/);
    assert.equal(await page.locator('#exportButton').isEnabled(), true);
    pass('取消下载：中文提示与重试按钮');
    console.log(`Browser checks passed: ${checks}; ${await browser.version()}`);
  } finally { await browser?.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
