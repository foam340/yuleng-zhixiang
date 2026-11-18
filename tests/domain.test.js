const test = require('node:test');
const assert = require('node:assert/strict');
const d = require('../miniprogram/core/domain');
const NOW = Date.parse('2026-11-01T10:00:00Z');
const base = overrides => Object.assign({ temp: '2-8℃', start: '2026-11-02', days: 3, volume: 100, urgency: 'normal', risk: 30 }, overrides);
const caseState = () => d.apply(d.seed(), 'runCase', {}, NOW);

test('旺季案例按温区、保底和评分分配，不超过500m³共享冷藏库容', () => {
  const state = caseState();
  const get = key => state.orders.find(o => o.enterpriseId === key);
  assert.equal(get('jia').allocated, 200);
  assert.equal(get('yi').allocated, 150);
  assert.equal(get('bing').allocated, 150);
  assert.equal(get('bing').guaranteeAllocated, 150);
  assert.equal(get('ding').allocated, 0);
  assert.equal(get('ji').status, 'emergency_pending');
  assert.equal(get('wu').allocated, 100);
  for (const resource of state.resources) {
    assert.ok(d.available(state, resource, { start: '2026-11-02', end: '2026-11-05' }) >= 0);
    const total = state.orders.reduce((sum, o) => sum + o.allocations.filter(a => a.resourceId === resource.id).reduce((s, a) => s + a.volume, 0), 0);
    assert.ok(total <= resource.capacity);
  }
  assert.equal(d.view(state).availableCold, 0);
  assert.equal(d.view(state).availableFrozen, 50);
});

test('所有综合得分由分项加权计算，同分按风险与提交时间确定顺序', () => {
  const state = caseState();
  for (const o of state.orders) {
    const exact = Object.keys(d.WEIGHTS).reduce((sum, key) => sum + o.score.parts[key] * d.WEIGHTS[key], 0);
    assert.equal(o.score.total, Math.round((exact + Number.EPSILON) * 100) / 100);
    assert.ok(o.score.total >= 0 && o.score.total <= 100);
  }
  assert.equal(state.orders.find(o => o.enterpriseId === 'jia').score.parts.contribution, 100);
  assert.equal(state.orders.find(o => o.enterpriseId === 'yi').score.parts.contribution, 25);
  assert.equal(state.orders.find(o => o.enterpriseId === 'ji').score.parts.contribution, 0);
});

test('供给方确认前不占用应急库容；取消后释放且不奖励积分', () => {
  let state = caseState();
  const target = state.orders.find(o => o.enterpriseId === 'ji');
  const resource = state.resources.find(r => r.id === 'E');
  assert.equal(d.available(state, resource, target), 120);
  assert.throws(() => d.apply(state, 'acceptEmergency', { id: target.id, resourceId: 'E' }, NOW), /供给企业/);
  state = d.apply(state, 'selectEnterprise', { id: 'jia' }, NOW);
  state = d.apply(state, 'acceptEmergency', { id: target.id, resourceId: 'E' }, NOW);
  assert.equal(d.available(state, resource, target), 0);
  assert.equal(state.enterprises.find(e => e.id === 'jia').points, 12000);
  assert.throws(() => d.apply(state, 'acceptEmergency', { id: target.id, resourceId: 'E' }, NOW), /没有待响应/);
  state = d.apply(state, 'selectEnterprise', { id: 'ji' }, NOW);
  state = d.apply(state, 'cancel', { id: target.id }, NOW);
  assert.equal(d.available(state, resource, target), 120);
  assert.equal(state.enterprises.find(e => e.id === 'jia').points, 12000);
});

test('取消预约释放库容且重复确认被阻止', () => {
  let state = d.apply(d.seed(), 'book', base({ volume: 150 }), NOW);
  const target = state.orders[0];
  assert.equal(d.view(state).availableCold, 350);
  state = d.apply(state, 'confirm', { id: target.id }, NOW);
  assert.throws(() => d.apply(state, 'confirm', { id: target.id }, NOW), /不能确认/);
  state = d.apply(state, 'cancel', { id: target.id }, NOW);
  assert.equal(d.view(state).availableCold, 500);
});

test('结束日与下一订单开始日相同，不重复占用；跨多个不重叠订单取峰值', () => {
  let state = d.apply(d.seed(), 'book', base({ start: '2026-11-02', days: 1, volume: 500 }), NOW);
  state = d.apply(state, 'book', base({ start: '2026-11-03', days: 1, volume: 500 }), NOW);
  assert.equal(state.orders[1].allocated, 500);
  const resource = state.resources.find(r => r.id === 'A');
  assert.equal(d.available(state, resource, { start: '2026-11-02', end: '2026-11-04' }), 0);
  assert.equal(d.available(state, resource, { start: '2026-11-04', end: '2026-11-05' }), 300);
});

test('同一企业同一时段不能重复领取保底额度', () => {
  let state = d.apply(d.seed(), 'selectEnterprise', { id: 'bing' }, NOW);
  state = d.apply(state, 'book', base({ volume: 100 }), NOW);
  state = d.apply(state, 'book', base({ volume: 100 }), NOW);
  assert.equal(state.orders[0].guaranteeAllocated, 100);
  assert.equal(state.orders[1].guaranteeAllocated, 50);
});

test('不匹配温区、未合格、未启用或缺少隔离条件的资源不得分配', () => {
  const initial = d.seed();
  initial.resources.filter(r => r.temp === '2-8℃').forEach(r => { r.qualified = false; });
  const state = d.apply(initial, 'book', base({ isolation: true }), NOW);
  assert.equal(state.orders[0].allocated, 0);
  assert.equal(state.orders[0].allocations.length, 0);
  const noIsolation = d.seed();
  noIsolation.resources.forEach(r => { r.isolated = false; });
  assert.equal(d.apply(noIsolation, 'book', base({ isolation: true }), NOW).orders[0].allocated, 0);
});

test('非法输入被拒绝且不修改原状态', () => {
  const state = d.seed();
  for (const input of [base({ volume: -1 }), base({ days: 1.5 }), base({ start: '2026-02-30' }), base({ temp: '常温' }), base({ urgency: 'rescue' }), base({ risk: 101 })]) {
    assert.throws(() => d.apply(state, 'book', input, NOW));
  }
  assert.equal(state.orders.length, 0);
  assert.equal(state.sequence, 0);
});

test('入库必须确认且二维码单号必须一致', () => {
  let state = d.apply(d.seed(), 'book', base(), NOW);
  const id = state.orders[0].id;
  assert.throws(() => d.apply(state, 'checkIn', { id, code: id }, NOW), /先确认/);
  state = d.apply(state, 'confirm', { id }, NOW);
  assert.throws(() => d.apply(state, 'checkIn', { id, code: 'wrong' }, NOW), /不一致/);
  state = d.apply(state, 'checkIn', { id, code: id }, NOW);
  assert.equal(state.orders[0].status, 'stored');
});

test('车辆同时验证体积、重量、温区和时限，阻止150m³直接匹配5吨单车', () => {
  const state = caseState();
  const target = state.orders.find(o => o.enterpriseId === 'yi');
  assert.throws(() => d.matchVehicles(state, target, { volume: 150, tons: 1, minutes: 120 }), /没有同时满足/);
  assert.throws(() => d.matchVehicles(state, target, { volume: 10, tons: 9, minutes: 120 }), /没有同时满足/);
  assert.throws(() => d.matchVehicles(state, target, { volume: 10, tons: 1, minutes: 1 }), /没有同时满足/);
  const v = d.matchVehicles(state, target, { volume: 10, tons: 1, minutes: 120 });
  assert.equal(v.temp, target.temp);
  assert.equal(v.providerIncome + v.platformIncome, v.fee);
});

test('分批运输只允许运出未出库体积，完成一次才奖励一次贡献', () => {
  let state = d.apply(d.seed(), 'book', base({ volume: 30 }), NOW);
  const id = state.orders[0].id;
  state = d.apply(state, 'confirm', { id }, NOW);
  state = d.apply(state, 'checkIn', { id, code: id }, NOW);
  state = d.apply(state, 'dispatch', { id, volume: 20, tons: 1, minutes: 120 }, NOW);
  state = d.apply(state, 'complete', { id }, NOW);
  assert.equal(state.orders[0].status, 'stored');
  assert.equal(state.orders[0].shippedVolume, 20);
  assert.throws(() => d.apply(state, 'complete', { id }, NOW), /先申请/);
  assert.throws(() => d.apply(state, 'dispatch', { id, volume: 20, tons: 1, minutes: 120 }, NOW), /有效范围/);
  state = d.apply(state, 'dispatch', { id, volume: 10, tons: 1, minutes: 120 }, NOW);
  state = d.apply(state, 'complete', { id }, NOW);
  assert.equal(state.orders[0].status, 'completed');
  assert.equal(state.orders[0].shippedVolume, 30);
  assert.equal(d.view(state).availableCold, 500);
  assert.throws(() => d.apply(state, 'complete', { id }, NOW), /先申请/);
});

test('其他模拟企业必须切换身份后才能操作订单', () => {
  let state = d.apply(d.seed(), 'book', base(), NOW);
  state = d.apply(state, 'selectEnterprise', { id: 'jia' }, NOW);
  assert.throws(() => d.apply(state, 'cancel', { id: state.orders[0].id }, NOW), /切换/);
});

test('申诉记录保留48小时时限且不能重复提交', () => {
  let state = d.apply(d.seed(), 'book', base(), NOW);
  const id = state.orders[0].id;
  state = d.apply(state, 'appeal', { id, reason: '希望复核本次分配依据' }, NOW);
  assert.equal(state.orders[0].appeal.dueAt, NOW + 48 * 3600000);
  assert.throws(() => d.apply(state, 'appeal', { id, reason: '第二次申诉原因' }, NOW), /已有申诉/);
});

test('运输中的车辆不重复指派，完成后才可继续匹配', () => {
  let state=d.seed();const ids=[];
  for(let i=0;i<3;i++){
    state=d.apply(state,'book',base({volume:10}),NOW);const id=state.orders.at(-1).id;ids.push(id);
    state=d.apply(state,'confirm',{id},NOW);state=d.apply(state,'checkIn',{id,code:id},NOW);
  }
  const cargo={volume:10,tons:1,minutes:120};
  state=d.apply(state,'dispatch',{id:ids[0],...cargo},NOW);const first=state.orders[0].transport.id;
  state=d.apply(state,'dispatch',{id:ids[1],...cargo},NOW);assert.notEqual(state.orders[1].transport.id,first);
  assert.throws(()=>d.apply(state,'dispatch',{id:ids[2],...cargo},NOW),/空闲单车/);
  state=d.apply(state,'complete',{id:ids[0]},NOW);
  state=d.apply(state,'dispatch',{id:ids[2],...cargo},NOW);assert.equal(state.orders[2].transport.id,first);
});
