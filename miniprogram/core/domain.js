/* 纯业务模块：小程序与服务端共同执行。所有企业、资源、价格均为模拟。 */
const alliance = require('./alliance');
const VERSION = 1;
const WEIGHTS = { contribution: 0.4, urgency: 0.3, risk: 0.2, waiting: 0.1 };
const STATUS = {
  allocated: '待确认', partial: '部分获配', waiting: '等待资源',
  emergency_pending: '应急待响应', confirmed: '待入库', stored: '存储中',
  shipping: '运输演示中', completed: '已完成', cancelled: '已取消'
};
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const clone = value => JSON.parse(JSON.stringify(value));
function fail(message) { throw new Error(message); }
function number(value, label, min, max) {
  const n = Number(value);
  if (value === '' || value === null || typeof value === 'boolean' || !Number.isFinite(n) || n < min || n > max) fail(label + '不在有效范围内');
  return n;
}
function date(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('日期格式应为YYYY-MM-DD');
  const parsed = new Date(value + 'T00:00:00Z');
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) fail('日期无效');
  return value;
}
function addDays(value, days) { return new Date(new Date(date(value) + 'T00:00:00Z').getTime() + days * 86400000).toISOString().slice(0, 10); }
function overlaps(a, b) { return a.start < b.end && b.start < a.end; }
function id(state, prefix) { state.sequence += 1; return prefix + String(state.sequence).padStart(5, '0'); }
function enterprise(state, key) { return state.enterprises.find(e => e.id === key) || fail('企业不存在'); }
function order(state, key) { return state.orders.find(o => o.id === key) || fail('订单不存在'); }
function log(state, message, at) { state.events.unshift({ id: id(state, 'EV'), message, at }); state.events = state.events.slice(0, 200); }
function seed() {
  return {
    version: VERSION, sequence: 0, selectedEnterprise: 'yi',
    enterprises: [
      { id: 'jia', name: 'B03 · 疫苗企业', points: 12000, guarantee: 0, compliance: 99 },
      { id: 'yi', name: 'B05 · 临床急需企业', points: 3000, guarantee: 0, compliance: 97 },
      { id: 'bing', name: 'B06 · 常规备货企业', points: 8000, guarantee: 150, compliance: 98 },
      { id: 'ding', name: 'B08 · 诊断试剂企业', points: 1500, guarantee: 0, compliance: 95 },
      { id: 'wu', name: 'B07 · 蛋白原液企业', points: 5000, guarantee: 0, compliance: 96 },
      { id: 'ji', name: 'B12 · 新接入企业', points: 0, guarantee: 0, compliance: null }
    ],
    resources: [
      { id: 'A', name: 'A区共享冷库', temp: '2-8℃', capacity: 300, price: 3.5, isolated: true, qualified: true, active: true, type: 'pool', owner: 'jia', location: '生物城共享仓储中心 · A区' },
      { id: 'B', name: 'B区共享冷库', temp: '2-8℃', capacity: 200, price: 3.5, isolated: true, qualified: true, active: true, type: 'pool', owner: 'bing', location: '生物城共享仓储中心 · B区' },
      { id: 'C', name: 'C区冷冻库', temp: '-20℃', capacity: 150, price: 5, isolated: true, qualified: true, active: true, type: 'pool', owner: 'wu', location: '生物城共享仓储中心 · C区' },
      { id: 'E', name: '甲企业应急协作库', temp: '2-8℃', capacity: 120, price: 3.5, isolated: true, qualified: true, active: true, type: 'emergency', owner: 'jia', location: '甲企业园区自有冷库（模拟）' }
    ],
    vehicles: [
      { id: 'V3', name: '3号共享冷藏车', temp: '2-8℃', tons: 5, volume: 20, distance: 6, minutes: 30, equipment: 95, reliability: 98, owner: 'bing', fee: 48, monitored: true, qualified: true },
      { id: 'V6', name: '6号共享冷藏车', temp: '2-8℃', tons: 8, volume: 35, distance: 12, minutes: 42, equipment: 90, reliability: 96, owner: 'jia', fee: 96, monitored: true, qualified: true },
      { id: 'V8', name: '8号共享冷冻车', temp: '-20℃', tons: 5, volume: 18, distance: 9, minutes: 35, equipment: 92, reliability: 97, owner: 'wu', fee: 72, monitored: true, qualified: true }
    ],
    orders: [], events: []
  };
}
function migrate(current, now) {
  if (current.version !== VERSION) fail('演示数据版本不兼容，请在“我的”恢复演示数据');
  return alliance.prepare(clone(current), now === undefined ? Date.now() : now);
}
// 区间采用[开始日,结束日)，逐日计算峰值占用，避免不重叠订单相加导致误判。
function available(state, resource, window, excluding) {
  if (resource.start && (window.start < resource.start || window.end > resource.end)) return 0;
  let minimum = resource.capacity;
  for (let day = window.start; day < window.end; day = addDays(day, 1)) {
    let used = 0;
    state.orders.forEach(o => {
      if (o.id === excluding || ['cancelled', 'completed'].includes(o.status) || !(o.start <= day && day < o.end)) return;
      (o.allocations || []).forEach(a => { if (a.resourceId === resource.id) used += a.volume; });
    });
    minimum = Math.min(minimum, resource.capacity - used);
  }
  return Math.max(0, round(minimum));
}
function score(state, o, group, at) {
  const maxPoints = Math.max(1, ...group.map(r => enterprise(state, r.enterpriseId).points));
  const waits = group.map(r => Math.max(0, (at - r.createdAt) / 60000));
  const maxWait = Math.max(1, ...waits);
  const urgency = { normal: 40, clinical: 100, rescue: 100, urgent: 60 }[o.urgency];
  const parts = {
    contribution: round(enterprise(state, o.enterpriseId).points / maxPoints * 100),
    urgency,
    risk: o.risk,
    waiting: round(Math.min(100, Math.max(0, (at - o.createdAt) / 60000) / maxWait * 100))
  };
  const total = round(Object.keys(WEIGHTS).reduce((sum, key) => sum + parts[key] * WEIGHTS[key], 0));
  return { parts, weights: clone(WEIGHTS), total, ruleVersion: 'demo-1', at };
}
function reserve(state, o, volume, type) {
  let remaining = volume;
  const candidates = state.resources.filter(r => r.type === type && r.active && r.qualified && r.temp === o.temp && (!o.isolation || r.isolated));
  candidates.sort((a, b) => available(state, b, o) - available(state, a, o) || a.id.localeCompare(b.id));
  candidates.forEach(r => {
    if (remaining <= 0) return;
    const take = round(Math.min(remaining, available(state, r, o)));
    if (take <= 0) return;
    const existing = o.allocations.find(a => a.resourceId === r.id);
    if (existing) existing.volume = round(existing.volume + take);
    else o.allocations.push({ resourceId: r.id, name: r.name, volume: take, price: round(r.price * ({normal:1,peak:1.2,low:0.85}[o.season||'normal'])) });
    remaining = round(remaining - take);
  });
  return round(volume - remaining);
}
function allocatedVolume(o) { return round(o.allocations.reduce((sum, a) => sum + a.volume, 0)); }
function schedule(state, batch, at) {
  batch.forEach(o => {
    const group = batch.filter(peer => peer.temp === o.temp && overlaps(peer, o));
    o.score = score(state, o, group, at);
  });
  const ranked = batch.slice().sort((a, b) => b.score.total - a.score.total || b.risk - a.risk || a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  ranked.forEach(o => {
    o.rank = ranked.filter(peer => peer.temp === o.temp && overlaps(peer, o)).findIndex(peer => peer.id === o.id) + 1;
  });
  // 本版明确采用先保底预留，再对剩余库容按得分分配。
  ranked.forEach(o => {
    const company = enterprise(state, o.enterpriseId);
    let maxGuaranteeUsed = 0;
    for (let day = o.start; day < o.end; day = addDays(day, 1)) {
      const used = state.orders.filter(peer => peer.id !== o.id && peer.enterpriseId === o.enterpriseId && !['cancelled', 'completed'].includes(peer.status) && peer.start <= day && day < peer.end).reduce((sum, peer) => sum + (peer.guaranteeAllocated || 0), 0);
      maxGuaranteeUsed = Math.max(maxGuaranteeUsed, used);
    }
    o.guaranteeAllocated = reserve(state, o, Math.min(o.volume, Math.max(0, company.guarantee - maxGuaranteeUsed)), 'pool');
  });
  ranked.forEach(o => {
    reserve(state, o, round(o.volume - allocatedVolume(o)), 'pool');
    const got = allocatedVolume(o);
    o.allocated = got;
    o.status = got === o.volume ? 'allocated' : got > 0 ? 'partial' : o.risk >= 90 ? 'emergency_pending' : 'waiting';
    o.fee = round(o.allocations.reduce((sum, a) => sum + a.volume * a.price * o.days, 0));
    o.reasons = [o.temp + '温区匹配', '模拟资质条件通过', o.isolation ? '独立隔离条件匹配' : '普通储位条件匹配', '按申请时段核验库容'];
    if (o.guaranteeAllocated > 0) o.reasons.push('本次预留保底库容' + o.guaranteeAllocated + 'm³');
    if (got < o.volume) o.reasons.push('剩余' + round(o.volume - got) + 'm³尚未保障，可调整日期重新申请' + (o.risk >= 90 ? '或请求应急协作' : ''));
  });
  log(state, '完成' + batch.length + '条需求的温区筛选、保底预留与评分分配', at);
}
function createOrder(state, input, at) {
  enterprise(state, input.enterpriseId);
  if (!['2-8℃', '-20℃'].includes(input.temp)) fail('请选择支持的温区');
  if (!['normal', 'clinical', 'rescue', 'urgent'].includes(input.urgency)) fail('紧急程度无效');
  const volume = round(number(input.volume, '申请库容', 0.01, 10000));
  const days = number(input.days, '存储天数', 1, 90);
  if (!Number.isInteger(days)) fail('存储天数须为整数');
  const start = date(input.start);
  const risk = number(input.risk === undefined ? 30 : input.risk, '风险分', 0, 100);
  const drug = String(input.drug || '生物制品（模拟）').slice(0, 60);
  if (['clinical', 'rescue'].includes(input.urgency) && !input.evidenceConfirmed) fail('请确认这是模拟证明与模拟紧急需求');
  const season = input.season || 'normal';
  if (!['normal','peak','low'].includes(season)) fail('季节价格选项无效');
  const o = {
    id: id(state, 'CC'), enterpriseId: input.enterpriseId, temp: input.temp, volume, days,
    start, end: addDays(start, days), drug, urgency: input.urgency, risk,
    isolation: Boolean(input.isolation), season, createdAt: at, allocations: [], status: 'waiting',
    allocated: 0, fee: 0, guaranteeAllocated: 0, evidence: input.evidenceConfirmed ? '比赛模拟证明' : null,
    history: [{ message: '提交模拟预约', at }]
  };
  state.orders.push(o);
  return o;
}
function runCase(state, at) {
  if (state.orders.length) fail('请先在“我的”恢复演示数据，再运行完整旺季案例');
  const inputs = [
    ['jia', 200, 'normal', 30, 60], ['yi', 150, 'clinical', 80, 50],
    ['bing', 180, 'normal', 30, 55], ['ding', 100, 'normal', 30, 45],
    ['wu', 100, 'normal', 30, 40], ['ji', 120, 'urgent', 100, 40]
  ];
  const batch = inputs.map(row => createOrder(state, {
    enterpriseId: row[0], volume: row[1], urgency: row[2], risk: row[3],
    temp: row[0] === 'wu' ? '-20℃' : '2-8℃', start: '2026-11-02', days: 3,
    drug: '旺季案例模拟生物制品', evidenceConfirmed: true
  }, at - row[4] * 60000));
  schedule(state, batch, at);
}
function matchVehicles(state, o, input) {
  const tons = number(input.tons, '货物重量（吨）', 0.001, 1000);
  const volume = number(input.volume, '货物体积', 0.01, round(o.allocated - (o.shippedVolume || 0)));
  const minutes = number(input.minutes, '最晚到达时间（分钟后）', 1, 1440);
  const occupied = new Set(state.orders.filter(peer => peer.status === 'shipping' && peer.transport).map(peer => peer.transport.id));
  const candidates = state.vehicles.filter(v => !occupied.has(v.id) && v.qualified !== false && v.temp === o.temp && v.tons >= tons && v.volume >= volume && v.minutes <= minutes).map(v => Object.assign({}, v, {
    matchScore: round(0.25 * 100 / (1 + v.distance / 10) + 0.25 * 100 / (1 + v.minutes / 30) + 0.25 * v.equipment + 0.25 * v.reliability)
  })).sort((a, b) => b.matchScore - a.matchScore || a.id.localeCompare(b.id));
  if (!candidates.length) fail('没有同时满足温区、重量、体积和时限的空闲单车，请完成已有运输、减少运量或调整时限');
  return Object.assign({}, candidates[0], { cargoTons: tons, cargoVolume: volume, deadlineMinutes: minutes, providerIncome: round(candidates[0].fee * 0.8), platformIncome: round(candidates[0].fee * 0.2), destination: '重庆江北机场货运区（路线模拟）' });
}
function apply(current, action, input, now) {
  const state = clone(current);
  const data = input || {};
  const at = now === undefined ? Date.now() : now;
  alliance.prepare(state, at);
  if (action === 'reset') return seed();
  if (action === 'selectEnterprise') { enterprise(state, data.id); state.selectedEnterprise = data.id; return state; }
  if (action === 'runCase') { runCase(state, at); return state; }
  if (alliance.act(state, action, data, at)) { log(state, '联盟机制模拟操作：' + action, at); return state; }
  const member = enterprise(state, state.selectedEnterprise);
  if (action === 'publish' && member.membership.exitAt <= at) fail('退出已生效，不能继续投放联盟资源；可付费预约和抵扣未过期积分');
  if (action === 'book') {
    const created = createOrder(state, Object.assign({}, data, { enterpriseId: state.selectedEnterprise }), at);
    schedule(state, [created], at);
    return state;
  }
  if (action === 'publish') {
    if (!['2-8℃', '-20℃'].includes(data.temp)) fail('温区无效');
    const name = String(data.name || '').trim();
    if (name.length < 2 || name.length > 30) fail('资源名称须为2至30字');
    const start = date(data.start || '2026-11-02');
    const days = number(data.days === undefined ? 1 : data.days, '投放天数', 1, 90);
    if (!Number.isInteger(days)) fail('投放天数须为整数');
    const capacity = round(number(data.capacity, '库容', 1, 10000));
    state.resources.push({ id: id(state, 'R'), name, temp: data.temp, capacity, start, end:addDays(start,days), price: round(number(data.price, '单价', 0.01, 1000)), isolated: Boolean(data.isolated), qualified: true, active: true, type: data.emergency ? 'emergency' : 'pool', owner: state.selectedEnterprise, location: '企业发布的模拟库区' });
    alliance.credit(member, capacity * days * (data.temp === '-20℃' ? 1.3 : 1), '冷库投放：' + capacity + 'm³ × ' + days + '天 × 温区系数', at);
    log(state, enterprise(state, state.selectedEnterprise).name + '发布模拟资源：' + name, at);
    return state;
  }
  const o = order(state, data.id);
  const own = o.enterpriseId === state.selectedEnterprise;
  if (action !== 'acceptEmergency' && !own) fail('请切换到该订单所属的模拟企业');
  if (action === 'confirm') {
    if (!['allocated', 'partial'].includes(o.status)) fail('当前订单不能确认');
    o.status = 'confirmed';
    o.acceptedPartial = o.allocated < o.volume;
    o.history.push({ message: o.acceptedPartial ? '确认已分配部分，未满足部分未入库' : '确认预约', at });
  } else if (action === 'requestEmergency') {
    if (!['waiting', 'partial'].includes(o.status) || o.risk < 90) fail('仅未满足的高风险模拟需求可申请应急');
    o.status = 'emergency_pending';
    o.history.push({ message: '发起模拟应急协作请求', at });
  } else if (action === 'acceptEmergency') {
    if (o.status !== 'emergency_pending') fail('该订单没有待响应的应急请求');
    const r = state.resources.find(resource => resource.id === data.resourceId);
    if (!r || r.type !== 'emergency' || r.owner !== state.selectedEnterprise) fail('请由对应资源供给企业响应');
    if (!r.active || !r.qualified || r.temp !== o.temp || (o.isolation && !r.isolated)) fail('资源未通过匹配条件');
    const remaining = round(o.volume - o.allocated);
    if (available(state, r, o) < remaining) fail('应急资源余量不足');
    o.allocations.push({ resourceId: r.id, name: r.name, volume: remaining, price: round(r.price * ({normal:1,peak:1.2,low:0.85}[o.season||'normal'])) });
    o.allocated = allocatedVolume(o);
    o.fee = round(o.allocations.reduce((sum, a) => sum + a.volume * a.price * o.days, 0));
    o.status = 'allocated';
    const compensation = round(remaining * o.days * o.allocations[o.allocations.length-1].price * 0.8);
    o.emergency = { resourceId: r.id, provider: r.owner, volume: remaining, points: 0, expectedPoints: round(compensation * 0.05), compensation, settled: false };
    o.history.push({ message: '供给企业接受应急请求，锁定' + remaining + 'm³；完成后结算贡献积分', at });
    log(state, enterprise(state, r.owner).name + '接受' + o.id + '的应急协作请求', at);
  } else if (action === 'cancel') {
    if (!['allocated', 'partial', 'waiting', 'emergency_pending', 'confirmed'].includes(o.status)) fail('当前阶段不能取消');
    o.status = 'cancelled';
    o.history.push({ message: '取消预约，释放锁定库容', at });
  } else if (action === 'checkIn') {
    if (o.status !== 'confirmed') fail('请先确认预约');
    if (data.code !== o.id) fail('入库码与当前订单不一致');
    o.status = 'stored';
    o.history.push({ message: '使用模拟入库码登记，开始展示模拟温度记录', at });
  } else if (action === 'dispatch') {
    if (o.status !== 'stored') fail('请先完成模拟入库');
    o.transport = matchVehicles(state, o, data);
    o.status = 'shipping';
    o.history.push({ message: '匹配' + o.transport.name + '，本次运输' + o.transport.cargoVolume + 'm³（模拟）', at });
  } else if (action === 'complete') {
    if (o.status !== 'shipping') fail('请先申请模拟运输');
    o.shippedVolume = round((o.shippedVolume || 0) + o.transport.cargoVolume);
    o.shipments = (o.shipments || []).concat([Object.assign({}, o.transport, { completedAt: at })]);
    const provider = enterprise(state, o.transport.owner);
    const earned = round(o.transport.distance * (o.transport.monitored ? 1.2 : 1));
    alliance.credit(provider, earned, '车辆完成1台次 × ' + o.transport.distance + 'km × 温控系数', at);
    o.transport.contributionPoints = earned;
    if (o.shippedVolume >= o.allocated) {
      o.status = 'completed';
      if (o.emergency && !o.emergency.settled) {
        alliance.credit(enterprise(state, o.emergency.provider), o.emergency.expectedPoints, '应急调剂供给方收益 × 5%', at);
        o.emergency.points = o.emergency.expectedPoints;
        o.emergency.settled = true;
      }
    } else {
      o.status = 'stored';
    }
    o.history.push({ message: '完成本批模拟运输，累计运出' + o.shippedVolume + '/' + o.allocated + 'm³；车辆供给方获得' + earned + '演示积分', at });
  } else if (action === 'appeal') {
    if (['completed', 'cancelled'].includes(o.status)) fail('该订单已结束');
    const reason = String(data.reason || '').trim();
    if (reason.length < 5 || reason.length > 300) fail('申诉原因须为5至300字');
    if (o.appeal) fail('该订单已有申诉记录');
    o.appeal = { reason, status: '待模拟复核', createdAt: at, dueAt: at + 48 * 3600000 };
    o.history.push({ message: '已记录申诉，演示复核时限48小时', at });
  } else fail('不支持的操作');
  log(state, o.id + '：' + o.history[o.history.length - 1].message, at);
  return state;
}
function view(state, start, days) {
  state = alliance.prepare(clone(state), Date.now());
  const window = { start: start || '2026-11-02', end: addDays(start || '2026-11-02', days || 3) };
  const selected = enterprise(state, state.selectedEnterprise);
  const resources = state.resources.map(r => Object.assign({}, r, { available: available(state, r, window), ownerName: enterprise(state, r.owner).name }));
  const orders = state.orders.map(o => Object.assign({}, o, {
    companyName: enterprise(state, o.enterpriseId).name, statusText: STATUS[o.status], bill:alliance.bill(o),
    remaining: round(o.volume - o.allocated), unshipped: round(o.allocated - (o.shippedVolume || 0)),
    scoreRows: o.score ? [
      ['contribution', '贡献度'], ['urgency', '紧急度'], ['risk', '风险度'], ['waiting', '等待时长']
    ].map(row => ({ key: row[0], name: row[1], raw: o.score.parts[row[0]], weight: o.score.weights[row[0]] * 100, weighted: round(o.score.parts[row[0]] * o.score.weights[row[0]]) })) : []
  })).reverse();
  const mine = orders.filter(o => o.enterpriseId === selected.id);
  const supportRequests = orders.filter(o => o.status === 'emergency_pending').map(o => Object.assign({}, o, {
    candidates: resources.filter(r => r.type === 'emergency' && r.owner === selected.id && r.active && r.qualified && r.temp === o.temp && (!o.isolation || r.isolated) && available(state, r, o) >= o.remaining)
  })).filter(o => o.candidates.length);
  return {
    selected, enterprises: clone(state.enterprises), resources, vehicles: clone(state.vehicles), alliance:alliance.dashboard(state,selected,Date.now(),available,addDays),
    orders, mine, supportRequests, events: clone(state.events), window,
    availableCold: round(resources.filter(r => r.type === 'pool' && r.temp === '2-8℃').reduce((sum, r) => sum + r.available, 0)),
    availableFrozen: round(resources.filter(r => r.type === 'pool' && r.temp === '-20℃').reduce((sum, r) => sum + r.available, 0)),
    pendingCount: mine.filter(o => ['allocated', 'partial', 'emergency_pending'].includes(o.status)).length
  };
}
module.exports = { VERSION, WEIGHTS, STATUS, seed, apply, view, available, addDays, matchVehicles, migrate };
