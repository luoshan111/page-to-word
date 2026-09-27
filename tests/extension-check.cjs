// Full integration: unmodified manifest, real action/activeTab, injection and download.
// Use a disposable Edge profile; the user's profile is never opened.
const { chromium } = require('playwright');
const JSZip = require('jszip');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const artifacts = process.env.TEST_ARTIFACT_DIR || path.join(root, 'test-results');

function targetCommand(cdp, sessionId) {
  let serial = 0;
  return (method, params) => new Promise((resolve, reject) => {
    const id = ++serial;
    function cleanup() { clearTimeout(timer); cdp.off('Target.receivedMessageFromTarget', listener); }
    function listener(event) {
      if (event.sessionId !== sessionId) return;
      const response = JSON.parse(event.message);
      if (response.id !== id) return;
      cleanup();
      response.error ? reject(Error(response.error.message)) : resolve(response.result);
    }
    const timer = setTimeout(() => { cleanup(); reject(Error('CDP command timed out')); }, 15000);
    cdp.on('Target.receivedMessageFromTarget', listener);
    cdp.send('Target.sendMessageToTarget', { sessionId, message: JSON.stringify({ id, method, params }) })
      .catch(error => { cleanup(); reject(error); });
  });
}

(async () => {
  await fs.mkdir(artifacts, { recursive: true });
  const profile = await fs.mkdtemp(path.join(artifacts, 'edge-integration-'));
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'msedge', headless: true,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`, '--enable-unsafe-extension-debugging']
  });
  try {
    const page = await context.newPage();
    await page.goto('edge://extensions/');
    const extensions = await page.evaluate(() => new Promise(resolve =>
      chrome.developerPrivate.getExtensionsInfo({ includeDisabled: true }, resolve)));
    const info = extensions.find(item => item.name === '网页导出到 Word');
    assert.equal(info?.state, 'ENABLED');
    assert.equal(info.manifestErrors.length, 0);
    await page.goto(pathToFileURL(path.join(__dirname, 'fixture.html')).href);
    const cdp = await context.browser().newBrowserCDPSession();
    const targets = (await cdp.send('Target.getTargets', { filter: [{}] })).targetInfos;
    const tab = targets.find(item => item.type === 'tab' && item.url.includes('fixture.html'));
    await cdp.send('Extensions.triggerAction', { id: info.id, targetId: tab.targetId });
    let popup;
    for (let attempt = 0; attempt < 50; attempt++) {
      popup = (await cdp.send('Target.getTargets', { filter: [{}] })).targetInfos
        .find(item => item.type === 'page' && item.url === `chrome-extension://${info.id}/popup.html`);
      if (popup) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.ok(popup, 'Extension popup opened');
    const { sessionId } = await cdp.send('Target.attachToTarget', { targetId: popup.targetId, flatten: false });
    const command = targetCommand(cdp, sessionId);
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allowAndName', downloadPath: artifacts, eventsEnabled: true });
    // Automate the native save dialog only; extension downloads API is real.
    const completed = new Promise((resolve, reject) => {
      const timer = setTimeout(() => { cdp.off('Browser.downloadProgress', listener); reject(Error('Download timed out')); }, 15000);
      function listener(event) {
        if (event.state === 'completed' || event.state === 'canceled') {
          clearTimeout(timer); cdp.off('Browser.downloadProgress', listener);
          event.state === 'completed' ? resolve(event.guid) : reject(Error('Download canceled'));
        }
      }
      cdp.on('Browser.downloadProgress', listener);
    });
    // Wait for module scripts to register the click handler.
    await command('Runtime.evaluate', { expression: 'new Promise(resolve => document.readyState === "complete" ? resolve() : addEventListener("load", resolve, {once:true}))', awaitPromise: true });
    await command('Runtime.evaluate', { expression: 'document.querySelector("#exportButton").click()' });
    const guid = await completed;
    const downloaded = await fs.readFile(path.join(artifacts, guid));
    const zip = await JSZip.loadAsync(downloaded, { checkCRC32: true });
    const xml = await zip.file('word/document.xml').async('string');
    assert.match(xml, /扩展导出测试/);
    assert.match(xml, /中文文章/);
    assert.match(xml, /<w:tbl>/);
    assert.doesNotMatch(xml, /导航/);
    await fs.writeFile(path.join(artifacts, 'extension-download.docx'), downloaded);
    console.log('PASS Edge extension: manifest loaded, real action/activeTab, page injection, DOCX generation, native download completed, ZIP CRC and content verified');
  } finally { await context.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
