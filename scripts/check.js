const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const root = path.resolve(__dirname, '..');
let count = 0;
function inspect(file) {
  if (file.endsWith('.json')) { JSON.parse(fs.readFileSync(file, 'utf8')); count += 1; }
  else if (/\.(c?js)$/.test(file)) { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); count += 1; }
}
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else inspect(file);
  }
}
// 只扫描代码目录，缓存、会话数据和开发者工具本机配置不属于源代码检查范围。
for (const directory of ['miniprogram', 'server', 'scripts', 'tests']) visit(path.join(root, directory));
const configFile = fs.existsSync(path.join(root, 'project.config.json')) ? 'project.config.json' : 'project.config.example.json';
for (const filename of ['package.json', 'project.config.example.json', ...(configFile === 'project.config.json' ? [configFile] : [])]) inspect(path.join(root, filename));
const config = JSON.parse(fs.readFileSync(path.join(root, configFile)));
const app = JSON.parse(fs.readFileSync(path.join(root, 'miniprogram/app.json')));
if (config.appid !== 'touristappid' && !/^wx[a-f0-9]{16}$/.test(config.appid)) throw new Error('请在本机工程配置中填写自己的有效AppID，或使用示例游客配置');
if (config.miniprogramRoot !== 'miniprogram/') throw new Error('小程序入口路径与工程目录不符');
for (const page of app.pages) for (const ext of ['.js', '.wxml']) if (!fs.existsSync(path.join(root, 'miniprogram', page + ext))) throw new Error('页面缺少文件：' + page + ext);
let events = 0;
for (const page of app.pages) {
  const file = path.join(root, 'miniprogram', page + '.js');
  let definition;
  new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }).runInNewContext({ require: createRequire(file), Page: value => { definition = value; } });
  if (definition && definition.onShareAppMessage) {
    const share = definition.onShareAppMessage();
    if (share.imageUrl && share.imageUrl.startsWith('/assets/') && !fs.existsSync(path.join(root, 'miniprogram', share.imageUrl.slice(1)))) throw new Error(page + '缺少转发封面：' + share.imageUrl);
  }
  const template = fs.readFileSync(path.join(root, 'miniprogram', page + '.wxml'), 'utf8');
  for (const match of template.matchAll(/(?:bind|catch)(?:tap|change|input|submit|blur)="([a-zA-Z_$][\w$]*)"/g)) {
    if (!definition || typeof definition[match[1]] !== 'function') throw new Error(page + '缺少事件处理函数：' + match[1]);
    events += 1;
  }
  for (const match of template.matchAll(/src="(\/assets\/[^"{}]+)"/g)) if (!fs.existsSync(path.join(root, 'miniprogram', match[1].slice(1)))) throw new Error('缺少界面资源：' + match[1]);
}
for (const tab of app.tabBar.list) for (const key of ['iconPath', 'selectedIconPath']) if (tab[key] && !fs.existsSync(path.join(root, 'miniprogram', tab[key]))) throw new Error('导航图标缺失：' + tab[key]);
console.log('页面事件与本地资源检查通过，事件绑定' + events + '处。');
console.log('JS/JSON语法与页面文件检查通过，共' + count + '个文件。WXML/WXSS需另经微信编译器验证。');
