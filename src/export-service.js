import { extractPage } from './extract-page.js';
import { createDocx, documentFilename } from './document.js';

export class ExportError extends Error {
  constructor(code, message) { super(message); this.name = 'ExportError'; this.code = code; }
}

export function assertSupportedUrl(value) {
  let url;
  try { url = new URL(value); } catch { throw new ExportError('RESTRICTED_PAGE', '请打开一个普通网页后再导出。'); }
  if (!['http:', 'https:', 'file:'].includes(url.protocol) ||
      url.hostname === 'chromewebstore.google.com' ||
      (url.hostname === 'chrome.google.com' && url.pathname.startsWith('/webstore')) ||
      (url.hostname === 'microsoftedge.microsoft.com' && url.pathname.startsWith('/addons'))) {
    throw new ExportError('RESTRICTED_PAGE', '浏览器内部页面和扩展商店不允许读取，请切换到普通网页。');
  }
}

export async function blobDataUrl(blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const chunks = [];
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    chunks.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)));
  }
  // Unlike a popup-owned blob URL, this survives closing the save dialog's opener.
  return `data:${blob.type};base64,${btoa(chunks.join(''))}`;
}

export async function exportCurrentPage(api, onProgress = () => {}) {
  onProgress('正在读取网页…');
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  if (!Number.isInteger(tab?.id)) throw new ExportError('NO_TAB', '没有找到当前网页，请重新打开扩展。');
  assertSupportedUrl(tab.url);
  let results;
  try { results = await api.scripting.executeScript({ target: { tabId: tab.id }, func: extractPage }); }
  catch {
    throw new ExportError('INJECTION_FAILED', tab.url.startsWith('file:')
      ? '请在扩展管理页开启“允许访问文件网址”，然后重试。'
      : '无法读取此页面。请等待页面加载完成，或切换到普通网页再试。');
  }
  const page = results.find(result => result.frameId === 0)?.result;
  if (!page?.ok) {
    const code = page?.code || 'EXTRACTION_FAILED';
    const messages = {
      EMPTY_PAGE: '没有找到可导出的文字。请先展开或加载正文，再重试。',
      PAGE_TOO_LARGE: '页面内容过大，未生成不完整文档。请打开较短的文章或分章节页面。',
      EXTRACTION_FAILED: '正文提取失败，请刷新页面后重试。'
    };
    throw new ExportError(code, messages[code] || messages.EXTRACTION_FAILED);
  }
  onProgress('正在生成 Word 文档…');
  const blob = await createDocx(page);
  onProgress('请选择文档保存位置…');
  let downloadId;
  try {
    downloadId = await api.downloads.download({ url: await blobDataUrl(blob),
      filename: documentFilename(page.title), saveAs: true, conflictAction: 'uniquify' });
  } catch {
    throw new ExportError('DOWNLOAD_FAILED', '下载未开始：可能已取消保存，或被浏览器阻止。你可以重新导出。');
  }
  if (!Number.isInteger(downloadId)) throw new ExportError('DOWNLOAD_FAILED', '浏览器未创建下载任务，请重试。');
  return { downloadId, characters: page.characters, warnings: page.warnings };
}
