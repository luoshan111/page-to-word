import { Document, Packer, Paragraph, TextRun, ExternalHyperlink, Table, TableRow,
  TableCell, WidthType, HeadingLevel } from '../vendor/docx.mjs';

/** Remove characters that XML 1.0 cannot represent, preserving valid emoji. */
export function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]|[\ud800-\udfff]/gu, '');
}

function makeRun(run) {
  const options = { bold: run.bold, italics: run.italics,
    underline: run.underline ? {} : undefined,
    font: run.code ? 'Consolas' : undefined };
  const children = cleanText(run.text).split('\n').map((text, index) =>
    new TextRun({ ...options, text, break: index ? 1 : undefined, style: run.link ? 'Hyperlink' : undefined }));
  if (run.link && /^(https?:|mailto:)/i.test(run.link)) {
    return [new ExternalHyperlink({ link: cleanText(run.link), children })];
  }
  return children;
}

function makeBlock(block) {
  if (block.type === 'table') {
    const columns = Math.max(...block.rows.map(row => row.length));
    return new Table({ width: { size: 100, type: WidthType.PERCENTAGE },
      rows: block.rows.map(row => new TableRow({ children: Array.from({ length: columns }, (_, index) => {
        const content = (row[index] || []).map(makeBlock);
        if (!content.length || row[index]?.at(-1)?.type === 'table') content.push(new Paragraph(''));
        return new TableCell({ children: content });
      }) })) });
  }
  const children = block.runs.flatMap(makeRun);
  if (block.marker) children.unshift(new TextRun({ text: `${block.marker}  ` }));
  return new Paragraph({ children,
    heading: block.type === 'heading' ? HeadingLevel[`HEADING_${block.level}`] : undefined,
    style: block.type === 'code' ? 'CodeBlock' : block.type === 'quote' ? 'Quote' : undefined,
    indent: block.listDepth !== undefined ? { left: 360 * (Math.min(block.listDepth, 8) + 1) } : undefined,
    keepNext: block.type === 'heading',
    spacing: { after: 140, line: block.type === 'code' ? 260 : 320 } });
}

export async function createDocx(page) {
  if (!page?.ok || !Array.isArray(page.blocks)) throw new TypeError('Invalid page data');
  const document = new Document({ creator: '网页导出到 Word', title: cleanText(page.title),
    description: cleanText(page.url),
    styles: {
      default: { document: { run: { font: 'Microsoft YaHei', size: 22 } } },
      paragraphStyles: [
        { id: 'CodeBlock', name: 'Code Block', basedOn: 'Normal', run: { font: 'Consolas', size: 19 },
          paragraph: { shading: { fill: 'F3F4F6' }, spacing: { before: 100, after: 100 } } },
        { id: 'Quote', name: 'Quote', basedOn: 'Normal', run: { italics: true, color: '555555' },
          paragraph: { indent: { left: 360, right: 360 } } }
      ]
    },
    sections: [{ properties: { page: { size: { width: 11906, height: 16838 },
      margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } } }, children: [
      new Paragraph({ text: cleanText(page.title), heading: HeadingLevel.TITLE }),
      new Paragraph({ children: [new TextRun({ text: '来源：', color: '666666', size: 18 }),
        ...makeRun({ text: page.url, link: page.url })], spacing: { after: 300 } }),
      ...page.blocks.map(makeBlock)
    ] }]
  });
  return Packer.toBlob(document);
}

export function documentFilename(title) {
  let stem = cleanText(title).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/[.\s]+$/g, '').trim();
  stem = Array.from(stem).slice(0, 80).join('') || '网页内容';
  stem = stem.replace(/[.\s]+$/g, '') || '网页内容';
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `_${stem}`;
  return `${stem}.docx`;
}
