'use strict';
// Inspect the exact staged blobs, not local ignored configuration or runtime data.
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const git = args => execFileSync('git', args, { cwd: root, maxBuffer: 16 * 1024 * 1024 });
const files = git(['ls-files', '--cached', '-z']).toString('utf8').split('\0').filter(Boolean);
if (!files.length) throw new Error('请先暂存待发布文件，再检查暂存内容。');
const rules = [
  ['个人用户路径', /[A-Z]:[\\/]+Users[\\/]+[^\s"'<>]+|(?:^|[\s"'=])\/(?:Users|home)\/[^\s"'<>]+/im],
  ['真实小程序AppID', /\bwx[a-f0-9]{16}\b/i],
  ['邮件地址', /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i],
  ['手机号', /(?<!\d)1[3-9]\d{9}(?!\d)/],
  ['身份证号', /(?<!\d)[1-9]\d{16}[\dX](?!\d)/i],
  ['密钥块', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['访问令牌', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[A-Z0-9]{16})\b/],
  ['URL内嵌凭据', /https?:\/\/[^\s/:@]+:[^\s/@]+@/i],
  ['非本机IPv4地址', /\b(?!(?:127\.0\.0\.1|0\.0\.0\.0)\b)(?:\d{1,3}\.){3}\d{1,3}\b/]
];
const forbidden = /(?:^|\/)(?:artifacts|data|node_modules|私密凭据|03-本机开发资源)(?:\/|$)|(?:^|\/)(?:project\.(?:private\.)?config\.json|项目交接说明\.md|上传前检查记录-[^/]+\.md|\.env(?:\..+)?)$|\.(?:pem|key|p12|pfx|keystore|jks|docx?|pdf|zip|sqlite|db)$/i;
const failures = [];
for (const file of files) {
  if (file !== '.env.example' && forbidden.test(file)) failures.push(file + '：禁止公开的文件类型或目录');
  const content = git(['show', ':' + file]);
  // Scan ASCII metadata in images as well as UTF-8 text; report labels only.
  const text = content.toString('utf8');
  for (const [label, expression] of rules) if (expression.test(text)) failures.push(file + '：' + label);
}
if (failures.length) {
  console.error('公开检查未通过（不输出匹配内容）：\n' + failures.join('\n'));
  process.exitCode = 1;
} else console.log('Git暂存区公开检查通过：' + files.length + '个文件。仍须人工核对新增内容和图片。');
