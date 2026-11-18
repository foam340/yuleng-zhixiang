const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createApp } = require('../server/index');

test('接口工作区隔离、持久化、并发分配及访问限制', async t => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'biocity-test-'));
  const server = createApp({ dataDir, accessCode: 'test-access-code-123456' });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  t.after(async () => { await new Promise(resolve => server.close(resolve)); await fs.rm(dataDir, { recursive: true, force: true }); });
  const req = (route, payload, token, headers = {}) => fetch(base + route, {
    method: payload === undefined ? 'GET' : 'POST',
    headers: Object.assign({ 'content-type': 'application/json', authorization: token ? 'Bearer ' + token : '' }, headers),
    body: payload === undefined ? undefined : JSON.stringify(payload)
  });
  assert.equal((await req('/health')).status, 200);
  assert.equal((await req('/api/view')).status, 401);
  assert.equal((await req('/api/session', { accessCode: 'wrong' })).status, 403);
  assert.equal((await req('/health', undefined, undefined, { origin: 'https://other.example' })).status, 403);
  const one = await (await req('/api/session', { accessCode: 'test-access-code-123456' })).json();
  const two = await (await req('/api/session', { accessCode: 'test-access-code-123456' })).json();
  assert.notEqual(one.token, two.token);
  const payload = { action: 'book', payload: { temp: '2-8℃', start: '2026-11-02', days: 3, volume: 400, urgency: 'normal', risk: 30 } };
  const concurrent = await Promise.all([req('/api/action', payload, one.token), req('/api/action', payload, one.token)]);
  assert.ok(concurrent.every(r => r.status === 200));
  const viewOne = await (await req('/api/view', undefined, one.token)).json();
  const viewTwo = await (await req('/api/view', undefined, two.token)).json();
  assert.equal(viewOne.orders.length, 2);
  assert.equal(viewOne.orders.reduce((sum, o) => sum + o.allocated, 0), 500);
  assert.equal(viewTwo.orders.length, 0);
  assert.equal((await req('/api/view?days=9999', undefined, one.token)).status, 400);
  assert.equal((await req('/api/action', { action: 'bad' }, one.token)).status, 400);
  assert.equal((await fs.readdir(dataDir)).filter(name => name.endsWith('.json')).length, 2);
});

test('公网监听缺少独立访问码时拒绝启动', () => {
  assert.throws(() => createApp({ host: '0.0.0.0', accessCode: '' }), /访问码/);
  assert.throws(() => createApp({ host: '127.0.0.1', production: true, accessCode: '' }), /访问码/);
});
