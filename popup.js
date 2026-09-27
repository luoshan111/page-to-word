import { exportCurrentPage } from './src/export-service.js';

const button = document.querySelector('#exportButton');
const status = document.querySelector('#status');
const warnings = document.querySelector('#warnings');
let exporting = false;

button.addEventListener('click', async () => {
  if (exporting) return;
  exporting = true;
  button.disabled = true;
  button.textContent = '正在导出…';
  status.classList.remove('error');
  warnings.textContent = '';
  try {
    const result = await exportCurrentPage(chrome, message => { status.textContent = message; });
    status.textContent = `文档已提交浏览器下载（约 ${result.characters.toLocaleString()} 字符），请查看下载列表。`;
    warnings.textContent = result.warnings.join(' ');
  } catch (error) {
    status.textContent = error.name === 'ExportError' ? error.message : '生成文档时发生错误，请重新打开扩展后重试。';
    status.classList.add('error');
    console.error('Page to Word:', error.name, error.code || 'GENERATION_FAILED');
  } finally {
    exporting = false;
    button.disabled = false;
    button.textContent = '导出为 .docx';
  }
});
