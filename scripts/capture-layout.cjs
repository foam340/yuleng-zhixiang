'use strict';
// 在隔离的无头Edge中检查编译模板布局，不连接用户的浏览器或微信开发者工具。
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const preview = path.join(root, 'artifacts/previews');
const output = path.join(root, 'artifacts/screenshots/redesign');
const profile = path.join(root, 'artifacts/cache', 'edge-redesign-' + Date.now());
const browsers = [process.env.EDGE_BINARY, 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'].filter(Boolean);
const binary = browsers.find(file => fs.existsSync(file));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  if (!binary) throw new Error('未找到Edge，可用EDGE_BINARY指定本机浏览器位置');
  const cases = JSON.parse(fs.readFileSync(path.join(preview, 'manifest.json'), 'utf8'));
  fs.mkdirSync(output, { recursive: true });
  fs.mkdirSync(profile, { recursive: true });
  const child = spawn(binary, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', '--user-data-dir=' + profile, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
  child.on('error', error => { throw error; });
  let socket;
  let call;
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 150 && !fs.existsSync(portFile); i++) await delay(100);
    if (!fs.existsSync(portFile)) throw new Error('隔离浏览器启动超时');
    const port = Number(fs.readFileSync(portFile, 'utf8').split('\n')[0]);
    const targets = await (await fetch('http://127.0.0.1:' + port + '/json/list')).json();
    const target = targets.find(item => item.type === 'page');
    if (!target) throw new Error('浏览器未创建检查页面');
    socket = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { socket.addEventListener('open', resolve, { once: true }); socket.addEventListener('error', reject, { once: true }); });
    let sequence = 0;
    const pending = new Map();
    socket.addEventListener('message', event => {
      const message = JSON.parse(event.data);
      if (!message.id || !pending.has(message.id)) return;
      const item = pending.get(message.id); pending.delete(message.id); clearTimeout(item.timeout);
      if (message.error) item.reject(new Error(message.error.message)); else item.resolve(message.result);
    });
    call = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timeout = setTimeout(() => { pending.delete(id); reject(new Error(method + '超时')); }, 15000);
      pending.set(id, { resolve, reject, timeout });
      socket.send(JSON.stringify({ id, method, params }));
    });
    await call('Page.enable');
    await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
    const report = [];
    for (const item of cases) {
      const file = path.resolve(preview, item.filename);
      if (!file.startsWith(preview + path.sep)) throw new Error('预览路径超出检查目录');
      await call('Emulation.setDeviceMetricsOverride', { width: item.width, height: 900, deviceScaleFactor: 1, mobile: true });
      await call('Page.navigate', { url: pathToFileURL(file).href });
      await call('Runtime.evaluate', { expression: '(async()=>{await document.fonts.ready;await Promise.all(Array.from(document.images).map(i=>i.complete?Promise.resolve():new Promise(r=>{i.onload=r;i.onerror=r;})));return document.readyState;})()', awaitPromise: true, returnByValue: true });
      const result = await call('Runtime.evaluate', { expression: `JSON.stringify({width:innerWidth,height:document.documentElement.scrollHeight,overflow:Array.from(document.querySelectorAll('.page *')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left < -1);}).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,45)})).slice(0,12),brokenImages:Array.from(document.images).filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')),buttons:Array.from(document.querySelectorAll('button')).filter(b=>!b.disabled).map(b=>({label:b.textContent.trim().slice(0,30),width:Math.round(b.getBoundingClientRect().width),height:Math.round(b.getBoundingClientRect().height)}))})`, returnByValue: true });
      const metrics = JSON.parse(result.result.value);
      const alignment = await call('Runtime.evaluate', { expression: `JSON.stringify({buttonAlignment:Array.from(document.querySelectorAll('button')).filter(b=>!b.children.length&&b.textContent.trim()).map(b=>{const range=document.createRange();range.selectNodeContents(b);const text=range.getBoundingClientRect(),box=b.getBoundingClientRect();return {label:b.textContent.trim(),dx:Math.round((text.left+text.width/2-box.left-box.width/2)*10)/10,dy:Math.round((text.top+text.height/2-box.top-box.height/2)*10)/10};}).filter(b=>Math.abs(b.dx)>3||Math.abs(b.dy)>3),filterRows:Array.from(document.querySelectorAll('.filter-scroll')).map(row=>new Set(Array.from(row.querySelectorAll('button')).map(b=>Math.round(b.getBoundingClientRect().top))).size)})`, returnByValue: true });
      Object.assign(metrics, JSON.parse(alignment.result.value));
      const image = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: item.width, height: Math.min(metrics.height, 3200), scale: 1 } });
      const name = item.filename.replace('.html', '.png');
      fs.writeFileSync(path.join(output, name), Buffer.from(image.data, 'base64'));
      const viewportImage = await call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
      fs.writeFileSync(path.join(output, name.replace('.png', '.viewport.png')), Buffer.from(viewportImage.data, 'base64'));
      report.push(Object.assign({}, item, metrics, { screenshot: name }));
    }
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    const issues = report.filter(item => item.overflow.length || item.brokenImages.length || item.buttonAlignment.length || item.filterRows.some(rows=>rows>1));
    console.log('已检查并截图' + report.length + '个布局/状态；溢出、图片、按钮文字对齐或筛选换行异常：' + issues.length + '项。');
    if (issues.length) { console.log(JSON.stringify(issues.map(item => ({ file: item.filename, overflow: item.overflow, brokenImages: item.brokenImages, buttonAlignment: item.buttonAlignment, filterRows: item.filterRows })), null, 2)); process.exitCode = 1; }
  } finally {
    if (call) await call('Browser.close').catch(() => {});
    if (socket) socket.close();
    child.unref();
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
