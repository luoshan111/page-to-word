import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createDocx, cleanText, documentFilename } from '../src/document.js';
import { assertSupportedUrl, blobDataUrl, exportCurrentPage } from '../src/export-service.js';
const JSZip = createRequire(import.meta.url)('jszip');

const page = { ok: true, title: '中文测试 😀', url: 'https://example.com/article?a=1&b=2', characters: 100,
  warnings: [], blocks: [
    { type: 'heading', level: 2, runs: [{ text: '章节' }] },
    { type: 'paragraph', runs: [{ text: '中文 & <内容> 😀\u0001', bold: true }, { text: '链接', link: 'https://example.com/?a=1&b=2' }] },
    { type: 'code', runs: [{ text: 'const x = 1;\n  return x;' }] },
    { type: 'paragraph', marker: '3.', listDepth: 0, runs: [{ text: '有序列表' }] },
    { type: 'table', rows: [[[{ type: 'paragraph', runs: [{ text: '单元格' }] }], []]] }
  ] };

test('文件名兼容 Windows，并保留完整 Unicode 字符', () => {
  assert.equal(documentFilename('CON'), '_CON.docx');
  assert.equal(documentFilename('a/b:c?. '), 'a_b_c_.docx');
  assert.equal(documentFilename('...'), '网页内容.docx');
  assert.equal(documentFilename('多行\n标题\t'), '多行_标题_.docx');
  assert.equal(documentFilename('😀'.repeat(90)), '😀'.repeat(80) + '.docx');
});
test('清理 XML 非法字符，保留中文、emoji 和换行', () => {
  assert.equal(cleanText('中😀\u0000\u000b\ud800\ufffe\n'), '中😀\n');
});
test('限制内部页面和商店，允许普通网页及本地 HTML', () => {
  for (const value of ['edge://settings', 'chrome://extensions', 'about:blank', 'https://chromewebstore.google.com/detail/x', 'https://microsoftedge.microsoft.com/addons/detail/x', undefined]) {
    assert.throws(() => assertSupportedUrl(value), { code: 'RESTRICTED_PAGE' });
  }
  for (const value of ['https://example.com', 'http://localhost:8080', 'file:///C:/article.html']) assert.doesNotThrow(() => assertSupportedUrl(value));
});
test('生成 DOCX ZIP、正确转义 XML、保留格式与链接关系', async () => {
  const blob = await createDocx(page);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer(), { checkCRC32: true });
  const xml = await zip.file('word/document.xml').async('string');
  const rels = await zip.file('word/_rels/document.xml.rels').async('string');
  assert.ok(zip.file('[Content_Types].xml'));
  assert.match(xml, /中文 &amp; &lt;内容&gt; 😀/);
  assert.match(xml, /w:val="Heading2"/);
  assert.match(xml, /<w:br\/>/);
  assert.match(xml, /<w:tbl>/);
  assert.match(xml, /3\.  /);
  assert.match(rels, /relationships\/hyperlink/);
  assert.doesNotMatch(xml, /\u0001/);
});
test('下载用 data URL 可以无损还原字节', async () => {
  const data = new Uint8Array(33000).map((_, index) => index % 256);
  const url = await blobDataUrl(new Blob([data], { type: 'application/test' }));
  assert.deepEqual(Buffer.from(url.split(',')[1], 'base64'), Buffer.from(data));
});
function api(result = page) {
  return { tabs: { query: async () => [{ id: 7, url: page.url }] },
    scripting: { executeScript: async () => [{ frameId: 0, result }] },
    downloads: { download: async () => 42 } };
}
test('导出串联提取与下载，并传递正确文件名和下载选项', async () => {
  const mock = api();
  let options;
  mock.downloads.download = async value => { options = value; return 42; };
  assert.equal((await exportCurrentPage(mock)).downloadId, 42);
  assert.equal(options.filename, '中文测试 😀.docx');
  assert.equal(options.saveAs, true);
  assert.equal(options.conflictAction, 'uniquify');
  const zip = await JSZip.loadAsync(Buffer.from(options.url.split(',')[1], 'base64'));
  assert.ok(zip.file('word/document.xml'));
});
test('提取失败、空页面和超限时不会触发下载', async () => {
  for (const code of ['EMPTY_PAGE', 'PAGE_TOO_LARGE', 'EXTRACTION_FAILED']) {
    const mock = api({ ok: false, code });
    mock.downloads.download = () => assert.fail('不应下载');
    await assert.rejects(exportCurrentPage(mock), { code });
  }
});
test('注入权限拒绝及用户取消保存时给出可恢复错误', async () => {
  const mock = api();
  mock.scripting.executeScript = async () => { throw Error('Cannot access'); };
  await assert.rejects(exportCurrentPage(mock), { code: 'INJECTION_FAILED' });
  const canceled = api();
  canceled.downloads.download = async () => { throw Error('User canceled'); };
  await assert.rejects(exportCurrentPage(canceled), { code: 'DOWNLOAD_FAILED' });
});
