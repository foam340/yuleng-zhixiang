'use strict';
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs/promises');
const crypto = require('node:crypto');
const domain = require('../miniprogram/core/domain');

function createApp(options = {}) {
  const host = options.host || process.env.HOST || '127.0.0.1';
  const dataDir = options.dataDir || path.resolve(process.env.DATA_DIR || path.join(__dirname, '../data'));
  const accessCode = options.accessCode === undefined ? process.env.DEMO_ACCESS_CODE || '' : options.accessCode;
  const publicOrigin = options.publicOrigin || process.env.PUBLIC_ORIGIN || '';
  if ((options.production || process.env.NODE_ENV === 'production' || !['127.0.0.1', 'localhost', '::1'].includes(host)) && accessCode.length < 16) throw new Error('公网或生产部署须先设置至少16位的独立演示访问码DEMO_ACCESS_CODE');
  const ready = fs.mkdir(dataDir, { recursive: true });
  const queue = new Map();
  const limits = new Map();
  function limited(key, max, period) {
    const now = Date.now();
    const item = limits.get(key);
    if (!item || item.until <= now) { limits.set(key, { count: 1, until: now + period }); return false; }
    item.count += 1;
    if (limits.size > 5000) for (const [k, v] of limits) if (v.until <= now) limits.delete(k);
    return item.count > max;
  }
  function tokenFile(token) {
    if (!/^[a-f0-9]{64}$/.test(token)) throw Object.assign(new Error('演示会话无效，请重新连接'), { status: 401 });
    return path.join(dataDir, crypto.createHash('sha256').update(token).digest('hex') + '.json');
  }
  async function save(file, state) {
    const temp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
    try { await fs.writeFile(temp, JSON.stringify(state), { mode: 0o600 }); await fs.rename(temp, file); }
    finally { await fs.rm(temp, { force: true }).catch(() => {}); }
  }
  async function read(file) {
    try { return JSON.parse(await fs.readFile(file, 'utf8')); }
    catch (err) { if (err.code === 'ENOENT') throw Object.assign(new Error('演示会话不存在或已过期'), { status: 401 }); throw err; }
  }
  async function serial(file, fn) {
    const previous = queue.get(file) || Promise.resolve();
    const current = previous.catch(() => {}).then(fn);
    queue.set(file, current);
    try { return await current; } finally { if (queue.get(file) === current) queue.delete(file); }
  }
  async function body(req) {
    let size = 0;
    const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 16384) throw Object.assign(new Error('请求体过大'), { status: 413 }); chunks.push(chunk); }
    try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
    catch (_) { throw Object.assign(new Error('请求JSON格式错误'), { status: 400 }); }
  }
  function send(res, status, data) {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
    res.end(JSON.stringify(data));
  }
  const server = http.createServer(async (req, res) => {
    try {
      await ready;
      if (req.headers.origin && req.headers.origin !== publicOrigin) return send(res, 403, { error: '不允许的来源' });
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, { ok: true, service: 'biocity-coldchain-demo', version: '0.1.0', mode: 'simulation' });
      if (req.method === 'GET' && url.pathname === '/') return send(res, 200, { name: '生物城冷链共享比赛演示API', usage: '使用微信开发者工具打开项目根目录。此接口不提供真实药品服务。', storage: 'isolated-json-workspaces' });
      const client = req.socket.remoteAddress || 'unknown';
      if (limited('api:' + client, 300, 60000)) return send(res, 429, { error: '请求频率过高，请稍后重试' });
      if (req.method === 'POST' && url.pathname === '/api/session') {
        if (limited('login:' + client, 60, 3600000)) return send(res, 429, { error: '演示连接次数过多，请稍后再试' });
        const input = await body(req);
        const actual = crypto.createHash('sha256').update(String(input.accessCode || '')).digest();
        const expected = crypto.createHash('sha256').update(accessCode).digest();
        if (!crypto.timingSafeEqual(actual, expected)) return send(res, 403, { error: '演示访问码不正确' });
        const entries = await fs.readdir(dataDir);
        if (entries.filter(name => name.endsWith('.json')).length >= 200) return send(res, 503, { error: '演示工作区已达上限，请联系组织者清理' });
        const token = crypto.randomBytes(32).toString('hex');
        await save(tokenFile(token), domain.migrate(domain.seed()));
        return send(res, 201, { token, mode: 'simulation', note: '此令牌仅访问独立模拟工作区，不代表微信实名身份' });
      }
      if (!['/api/view', '/api/action'].includes(url.pathname)) return send(res, 404, { error: '接口不存在' });
      if ((url.pathname === '/api/view' && req.method !== 'GET') || (url.pathname === '/api/action' && req.method !== 'POST')) return send(res, 405, { error: '请求方法不支持' });
      const token = String(req.headers.authorization || '').replace(/^Bearer /, '');
      const file = tokenFile(token);
      if (url.pathname === '/api/view') {
        const days = Number(url.searchParams.get('days') || 3);
        if (!Number.isInteger(days) || days < 1 || days > 90) return send(res, 400, { error: '查询天数须为1至90的整数' });
        const state = await serial(file, async () => {
          const previous = await read(file);
          const migrated = domain.migrate(previous);
          if (JSON.stringify(migrated) !== JSON.stringify(previous)) await save(file, migrated);
          return migrated;
        });
        return send(res, 200, domain.view(state, url.searchParams.get('start') || undefined, days));
      }
      const input = await body(req);
      const output = await serial(file, async () => {
        const state = await read(file);
        if (input.action === 'book' && state.orders.length >= 200) throw new Error('演示订单数已达上限，请恢复演示数据');
        if (input.action === 'publish' && state.resources.length >= 100) throw new Error('本演示资源数已达上限');
        const next = domain.migrate(domain.apply(state, input.action, input.payload));
        await save(file, next);
        return domain.view(next);
      });
      return send(res, 200, output);
    } catch (err) {
      const internal = err.code && !['ENOENT'].includes(err.code);
      send(res, err.status || (internal ? 500 : 400), { error: internal ? '演示数据暂时不可用，请联系组织者' : err.message || '操作失败' });
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return server;
}
if (require.main === module) {
  const host = process.env.HOST || '127.0.0.1';
  const port = Number(process.env.PORT || 5600);
  createApp({ host }).listen(port, host, () => console.log('比赛演示API已启动：http://' + host + ':' + port));
}
module.exports = { createApp };
