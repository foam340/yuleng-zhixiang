const test=require('node:test');
const assert=require('node:assert/strict');
const d=require('../miniprogram/core/domain');
const a=require('../miniprogram/core/alliance');
const now=Date.parse('2026-11-01T00:00:00Z');
const book={temp:'2-8℃',start:'2026-11-02',days:3,volume:10,urgency:'normal',risk:30};
function completed(){let s=d.apply(d.seed(),'book',book,now);const id=s.orders[0].id;for(const [name,p] of [['confirm',{}],['checkIn',{code:id}],['dispatch',{volume:10,tons:1,minutes:120}],['complete',{}]])s=d.apply(s,name,{id,...p},now);return s;}
test('新版基准价、季节浮动与80/20账单守恒',()=>{
 const s=d.apply(d.seed(),'book',{...book,season:'peak'},now),o=s.orders[0];
 assert.equal(o.fee,126);const b=a.bill(o);assert.equal(b.storageProvider+b.storagePlatform,b.storage);assert.equal(b.total,126);
 assert.equal(d.apply(d.seed(),'book',{...book,season:'low'},now).orders[0].allocations[0].price,2.98);
});
test('投放积分按温区计算，资源仅在投放时间内可用',()=>{
 const s=d.apply(d.seed(),'publish',{name:'模拟测试库',temp:'-20℃',capacity:10,price:5,start:'2026-11-02',days:3},now);
 const e=s.enterprises.find(e=>e.id==='yi');assert.equal(e.points,3039);
 const r=s.resources.at(-1);assert.equal(d.available(s,r,{start:'2026-11-01',end:'2026-11-03'}),0);assert.equal(d.available(s,r,{start:'2026-11-02',end:'2026-11-05'}),10);
});
test('完整12个月核定80%保底，新企业计划需要模拟审核',()=>{
 let s=d.apply(d.seed(),'setGuarantee',{basis:'history',months:Array(12).fill(100).join(',')},now);assert.equal(s.enterprises[1].guarantee,80);
 assert.throws(()=>d.apply(s,'setGuarantee',{basis:'history',months:'1,2'},now),/12个月/);
 assert.throws(()=>d.apply(s,'setGuarantee',{basis:'plan',volume:50},now),/审核/);
 s=d.apply(s,'setGuarantee',{basis:'plan',volume:50,approved:true},now);assert.equal(s.enterprises[1].guarantee,50);
});
test('完成才可抵扣，仅抵平台仓储服务费，不能重复抵扣',()=>{
 let s=completed(),id=s.orders[0].id;const original=s.enterprises[1].points;
 s=d.apply(s,'redeem',{id,points:1000},now);assert.equal(s.orders[0].discount,21);assert.equal(s.enterprises[1].points,original-21);assert.equal(a.bill(s.orders[0]).total,132);
 assert.throws(()=>d.apply(s,'redeem',{id,points:1},now),/已办理/);
});
test('车辆按里程和温控系数记分，积分满12个月过期',()=>{
 let s=completed();assert.equal(s.enterprises.find(e=>e.id==='bing').ledger.at(-1).points,7.2);
 s=d.apply(s,'selectEnterprise',{id:'bing'},Date.parse('2027-11-01T00:00:00Z'));assert.equal(s.enterprises.find(e=>e.id==='bing').points,0);
 assert.equal(new Date(a.expires(Date.parse('2024-02-29T10:00:00Z'))).toISOString(),'2025-02-28T10:00:00.000Z');
});
test('退出30天后取消保底，可继续付费预约但不可投放',()=>{
 let s=d.apply(d.seed(),'requestExit',{},now),later=now+30*86400000;
 assert.equal(s.enterprises[1].membership.exitAt,later);
 s=d.apply(s,'book',book,later);assert.equal(s.enterprises[1].membership.status,'exited');assert.equal(s.enterprises[1].guarantee,0);
 assert.throws(()=>d.apply(s,'publish',{name:'模拟库'},later),/退出已生效/);
});
test('告警必须属于本企业在库订单，响应处置归档逐步执行',()=>{
 let s=d.apply(d.seed(),'book',book,now),id=s.orders[0].id;
 assert.throws(()=>d.apply(s,'createAlert',{id},now),/在库/);
 s=d.apply(s,'confirm',{id},now);s=d.apply(s,'checkIn',{id,code:id},now);s=d.apply(s,'createAlert',{id},now);
 assert.throws(()=>d.apply(s,'createAlert',{id},now),/未归档/);
 const alert=s.alerts[0].id;
 for(const status of ['responded','resolved','archived']){s=d.apply(s,'advanceAlert',{id:alert},now);assert.equal(s.alerts[0].status,status);}
 assert.throws(()=>d.apply(s,'advanceAlert',{id:alert},now),/已归档/);
});
test('旧缓存不丢订单和余额，view只读升级不修改原对象',()=>{
 const old=d.seed(),snapshot=JSON.stringify(old);const v=d.view(old);assert.equal(JSON.stringify(old),snapshot);assert.equal(v.selected.points,3000);assert.equal(v.alliance.forecast.length,14);
 const s=d.apply(old,'selectEnterprise',{id:'yi'},now);assert.equal(s.enterprises[1].ledger[0].points,3000);
});
test('旧内置报价升级不重算历史订单，积分按月份汇总',()=>{
 const old=d.apply(d.seed(),'book',book,now);old.resources[0].price=6;old.orders[0].fee=180;old.orders[0].allocations[0].price=6;
 const s=d.apply(old,'selectEnterprise',{id:'yi'},now);assert.equal(s.resources[0].price,3.5);assert.equal(s.orders[0].fee,180);assert.equal(s.orders[0].allocations[0].price,6);
 const v=d.view(s);assert.equal(v.alliance.monthly[0].earned,3000);
});
test('应急积分仅履约完成结算供给方收益5%，取消不计入',()=>{
 let s=d.apply(d.seed(),'runCase',{},now),o=s.orders.find(x=>x.enterpriseId==='ji');
 s=d.apply(s,'selectEnterprise',{id:'jia'},now);s=d.apply(s,'acceptEmergency',{id:o.id,resourceId:'E'},now);
 o=s.orders.find(x=>x.id===o.id);assert.equal(o.emergency.compensation,1008);assert.equal(o.emergency.expectedPoints,50.4);assert.equal(o.emergency.points,0);
 s=d.apply(s,'selectEnterprise',{id:'ji'},now);s=d.apply(s,'cancel',{id:o.id},now);assert.equal(s.enterprises[0].points,12000);
});
