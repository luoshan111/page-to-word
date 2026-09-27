/** Serializable Chrome injection entry point; all helpers must remain inside. */
export function extractPage() {
  const MAX_NODES = 50000, MAX_CHARACTERS = 1000000, MAX_DEPTH = 100;
  const OMIT = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'NAV', 'FOOTER',
    'ASIDE', 'FORM', 'BUTTON', 'INPUT', 'TEXTAREA', 'SELECT', 'SVG', 'CANVAS']);
  const BLOCK = new Set(['DIV', 'SECTION', 'ARTICLE', 'MAIN', 'HEADER', 'ADDRESS',
    'FIGURE', 'FIGCAPTION', 'P', 'BLOCKQUOTE', 'PRE', 'DT', 'DD', 'DETAILS']);
  const styleCache = new WeakMap();
  const warnings = new Set();
  let visited = 0;
  let characters = 0;

  function styleOf(element) {
    if (!styleCache.has(element)) styleCache.set(element, getComputedStyle(element));
    return styleCache.get(element);
  }
  function excluded(element) {
    if (OMIT.has(element.tagName) || element.hidden || element.getAttribute('aria-hidden') === 'true') return true;
    const style = styleOf(element);
    return style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse';
  }
  function visibleCandidate(element) {
    for (let node = element; node; node = node.parentElement) if (excluded(node)) return false;
    return true;
  }
  function chooseRoot() {
    for (const selector of ['main, [role="main"]', 'article']) {
      const candidates = [...document.querySelectorAll(selector)].filter(visibleCandidate);
      candidates.sort((a, b) => (b.textContent?.length || 0) - (a.textContent?.length || 0));
      if (candidates[0]?.textContent.trim()) return candidates[0];
    }
    return document.body;
  }
  function safeLink(value) {
    if (!value) return undefined;
    try {
      const url = new URL(value, location.href);
      return ['http:', 'https:', 'mailto:'].includes(url.protocol) ? url.href : undefined;
    } catch { return undefined; }
  }
  function append(runs, text, format, preserve) {
    const value = preserve ? text.replace(/\r\n?/g, '\n') : text.replace(/\s+/g, ' ');
    if (!value) return;
    const previous = runs.at(-1);
    const next = !preserve && previous?.text.endsWith(' ') ? value.replace(/^ +/, '') : value;
    if (next) runs.push({ ...format, text: next });
  }
  function clean(runs, preserve) {
    const result = runs.map(run => ({ ...run }));
    if (!preserve) {
      while (result.length) {
        result[0].text = result[0].text.replace(/^\s+/, '');
        if (result[0].text) break;
        result.shift();
      }
      while (result.length) {
        result.at(-1).text = result.at(-1).text.replace(/\s+$/, '');
        if (result.at(-1).text) break;
        result.pop();
      }
    }
    return result;
  }
  function collect(container, context = {}, initialFormat = {}, depth = 0) {
    if (depth > MAX_DEPTH) throw new Error('PAGE_TOO_LARGE');
    const blocks = [];
    let runs = [];
    function flush() {
      const cleaned = clean(runs, context.type === 'code');
      runs = [];
      if (!cleaned.some(run => run.text.trim())) return;
      characters += cleaned.reduce((sum, run) => sum + run.text.length, 0);
      if (characters > MAX_CHARACTERS) throw new Error('PAGE_TOO_LARGE');
      blocks.push({ type: 'paragraph', ...context, runs: cleaned });
    }
    function walk(node, format, level) {
      if (++visited > MAX_NODES || level > MAX_DEPTH) throw new Error('PAGE_TOO_LARGE');
      if (node.nodeType === Node.TEXT_NODE) {
        append(runs, node.nodeValue, format, context.type === 'code');
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE || excluded(node)) return;
      const tag = node.tagName;
      if (['IMG', 'VIDEO', 'AUDIO', 'IFRAME'].includes(tag)) {
        warnings.add('图片、音视频和嵌入内容未导出。');
        return;
      }
      if (node.shadowRoot) warnings.add('部分组件内的内容可能未导出。');
      if (tag === 'BR') { append(runs, '\n', format, true); return; }
      if (tag === 'UL' || tag === 'OL') {
        flush();
        const items = [...node.children].filter(child => child.tagName === 'LI' && !excluded(child));
        const step = node.hasAttribute('reversed') ? -1 : 1;
        let number = node.hasAttribute('start') ? Number(node.getAttribute('start')) : step < 0 ? items.length : 1;
        if (!Number.isFinite(number)) number = 1;
        for (const item of items) {
          if (item.hasAttribute('value') && Number.isFinite(Number(item.getAttribute('value')))) number = Number(item.getAttribute('value'));
          const itemBlocks = collect(item, { ...context, type: 'paragraph', listDepth: (context.listDepth ?? -1) + 1 }, format, level + 1);
          const first = itemBlocks.find(block => block.runs && block.listDepth === (context.listDepth ?? -1) + 1);
          if (first) first.marker = tag === 'OL' ? `${number}.` : '•';
          blocks.push(...itemBlocks);
          number += step;
        }
        return;
      }
      if (tag === 'TABLE') {
        flush();
        const rows = [...node.rows].filter(visibleCandidate).map(row =>
          [...row.cells].filter(cell => !excluded(cell)).map(cell => {
            if (cell.colSpan > 1 || cell.rowSpan > 1) warnings.add('表格中的合并单元格已展开为普通单元格。');
            return collect(cell, {}, { ...format, bold: cell.tagName === 'TH' || format.bold }, level + 1);
          })).filter(row => row.length);
        if (rows.length) blocks.push({ type: 'table', rows });
        return;
      }
      const heading = /^H([1-6])$/.exec(tag);
      const display = styleOf(node).display;
      if (heading || BLOCK.has(tag) || ['block', 'flex', 'grid', 'list-item'].includes(display)) {
        flush();
        const childContext = { ...context };
        if (heading) { childContext.type = 'heading'; childContext.level = Number(heading[1]); }
        if (tag === 'PRE') childContext.type = 'code';
        if (tag === 'BLOCKQUOTE') childContext.type = 'quote';
        blocks.push(...collect(node, childContext, format, level + 1));
        return;
      }
      const nextFormat = { ...format };
      if (tag === 'B' || tag === 'STRONG') nextFormat.bold = true;
      if (tag === 'I' || tag === 'EM') nextFormat.italics = true;
      if (tag === 'U') nextFormat.underline = true;
      if (tag === 'CODE') nextFormat.code = true;
      if (tag === 'A') nextFormat.link = safeLink(node.getAttribute('href'));
      for (const child of node.childNodes) walk(child, nextFormat, level + 1);
    }
    const children = container.tagName === 'DETAILS' && !container.open
      ? [...container.children].filter(child => child.tagName === 'SUMMARY') : container.childNodes;
    for (const child of children) walk(child, initialFormat, depth + 1);
    flush();
    return blocks;
  }
  try {
    const root = chooseRoot();
    if (!root) return { ok: false, code: 'EMPTY_PAGE' };
    const blocks = collect(root);
    if (!blocks.length) return { ok: false, code: 'EMPTY_PAGE' };
    const pageHeading = blocks.find(block => block.type === 'heading' && block.level === 1)?.runs.map(run => run.text).join('');
    const title = pageHeading || document.title.trim() || '网页内容';
    if (blocks[0]?.type === 'heading' && blocks[0].runs.map(run => run.text).join('') === title) blocks.shift();
    return { ok: true, title, url: location.href, blocks, characters, warnings: [...warnings] };
  } catch (error) {
    return { ok: false, code: error.message === 'PAGE_TOO_LARGE' ? 'PAGE_TOO_LARGE' : 'EXTRACTION_FAILED' };
  }
}
