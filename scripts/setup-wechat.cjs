'use strict';
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
try {
  fs.copyFileSync(path.join(root, 'project.config.example.json'), path.join(root, 'project.config.json'), fs.constants.COPYFILE_EXCL);
  console.log('已创建本机 project.config.json。导入微信开发者工具时可使用自己的 AppID，本机配置不会提交 Git。');
} catch (error) {
  if (error.code !== 'EEXIST') throw error;
  console.log('已存在本机 project.config.json，保留现有项目配置。');
}
