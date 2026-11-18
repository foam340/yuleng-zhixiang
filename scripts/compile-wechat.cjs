'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function compile() {
  const candidates = [
    process.env.WECHAT_COMPILER_DIR,
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'node_modules', 'wcc-exec'),
    path.join(process.env.ProgramFiles || 'C:\\Program Files', 'Tencent', '微信web开发者工具', 'code', 'package.nw', 'node_modules', 'wcc-exec')
  ].filter(Boolean);
  const directory = candidates.find(candidate => fs.existsSync(path.join(candidate, 'wcc.exe')) && fs.existsSync(path.join(candidate, 'wcsc.exe')));
  if (!directory) throw new Error('未找到微信编译器。请安装微信开发者工具，或将WECHAT_COMPILER_DIR设置为含wcc.exe与wcsc.exe的目录。');
  const miniprogram = path.join(root, 'miniprogram');
  const output = path.join(root, 'artifacts', 'build');
  fs.mkdirSync(output, { recursive: true });
  const app = JSON.parse(fs.readFileSync(path.join(miniprogram, 'app.json'), 'utf8'));
  function styles(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? styles(file) : entry.name.endsWith('.wxss') && entry.name !== 'app.wxss' ? ['./' + path.relative(miniprogram, file).replace(/\\/g, '/')] : [];
    });
  }
  const commands = [
    ['wcc.exe', ['-o', '../artifacts/build/wxml.js', ...app.pages.map(page => './' + page + '.wxml')], 'wxml.js'],
    ['wcsc.exe', ['-o', '../artifacts/build/wxss.js', './app.wxss', ...styles(miniprogram)], 'wxss.js']
  ];
  for (const [binary, args, filename] of commands) {
    const result = spawnSync(path.join(directory, binary), args, { cwd: miniprogram, encoding: 'utf8', windowsHide: true });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(binary + '编译失败：' + (result.stderr || result.stdout));
    if (!fs.existsSync(path.join(output, filename))) throw new Error('编译器未生成' + filename);
  }
  console.log('微信模板与样式编译通过，输出至artifacts/build/');
  return output;
}

if (require.main === module) {
  try { compile(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { compile };
