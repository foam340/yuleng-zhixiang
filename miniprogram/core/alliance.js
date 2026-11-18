/* 修改稿第四、六章的机制演示；纯函数，不代表真实资质审核、物联网或区块链。 */
const round = n => Math.round((n + Number.EPSILON) * 100) / 100;
const day = 86400000;
function requireValue(ok, message) { if (!ok) throw new Error(message); }
function amount(value, min, max) { const n = Number(value); requireValue(value !== '' && value != null && typeof value !== 'boolean' && Number.isFinite(n) && n >= min && n <= max, '数值不在有效范围内'); return n; }
function expires(at) { const d = new Date(at), original = d.getUTCDate(); d.setUTCDate(1); d.setUTCFullYear(d.getUTCFullYear()+1); const month=d.getUTCMonth(); d.setUTCDate(original); if(d.getUTCMonth()!==month)d.setUTCDate(0); return d.getTime(); }
function credit(e, points, reason, at) { e.ledger.push({id:'P'+(e.ledger.length+1),points:round(points),used:0,reason,at,expiresAt:expires(at)}); sync(e,at); }
function sync(e,at) { e.points=round(e.ledger.reduce((s,p)=>s+(p.expiresAt>at ? Math.max(0,p.points-p.used):0),0)); }
function prepare(state,at) {
  state.alerts=state.alerts||[];
  // 只迁移内置库区的旧基准价；历史订单内的成交单价与账单保持原值。
  const prices={A:[6,3.5],B:[6,3.5],C:[8,5],E:[7,3.5]};
  state.resources.forEach(r=>{const p=prices[r.id];if(p&&r.price===p[0])r.price=p[1];});
  state.enterprises.forEach(e=>{
    const codes={jia:'B03',yi:'B05',bing:'B06',ding:'B08',wu:'B07',ji:'B12'};
    e.code=codes[e.id]||e.id;
    e.name=e.name.replace(/^[甲乙丙丁戊己] ·/,e.code+' ·');
    if(!e.ledger)e.ledger=[{id:'P0',points:e.points,used:0,reason:'历史积分期初余额（模拟迁移）',at,expiresAt:expires(at)}];
    if(!e.membership)e.membership={status:'active',basis:e.guarantee ? '历史月均用量×80%（模拟核定）':'暂无核定额度',average:round(e.guarantee/0.8)};
    if(e.membership.exitAt<=at){e.membership.status='exited';e.guarantee=0;}
    sync(e,at);
  });
  return state;
}
function bill(o) {
  const storageProvider=round(o.fee*0.8), storagePlatform=round(o.fee-storageProvider);
  const transport=(o.shipments||[]).reduce((s,t)=>s+t.fee,0);
  const discount=o.discount||0;
  return {storage:o.fee,storageProvider,storagePlatform,transport:round(transport),discount,total:round(o.fee+transport-discount),settled:o.status==='completed',season:o.season||'normal'};
}
function act(state,name,data,at) {
  const e=state.enterprises.find(x=>x.id===state.selectedEnterprise);
  if(name==='setGuarantee'){
    requireValue(['history','plan'].includes(data.basis),'请选择历史用量或新企业生产计划');
    requireValue(e.membership.status==='active','退出申请中不能重新核定额度');
    if(data.basis==='history'){
      const months=String(data.months||'').split(/[,，\s]+/).filter(Boolean).map(x=>amount(x,0,10000));
      requireValue(months.length===12,'请填写完整12个月用量，以逗号分隔');
      const avg=months.reduce((s,n)=>s+n,0)/12;
      e.guarantee=round(avg*0.8);e.membership={status:'active',basis:'过去12个月平均月使用库容×80%',average:round(avg)};
    }else{
      requireValue(data.approved===true,'新企业生产计划需模拟联盟审核确认');
      e.guarantee=round(amount(data.volume,0,10000));e.membership={status:'active',basis:'新企业生产计划经模拟审核核定',average:null};
    }
    return true;
  }
  if(name==='requestExit'){
    requireValue(e.membership.status==='active','已存在退出申请');
    e.membership.status='exiting';e.membership.requestedAt=at;e.membership.exitAt=at+30*day;
    return true;
  }
  if(name==='redeem'){
    const o=state.orders.find(x=>x.id===data.id);
    requireValue(o&&o.enterpriseId===e.id,'只能抵扣本企业账单');
    requireValue(o.status==='completed','全部履约完成后可模拟结算抵扣');
    requireValue(!o.redeemed,'该账单已办理积分抵扣');
    const points=round(Math.min(amount(data.points,0.01,1000000),e.points,bill(o).storagePlatform));
    requireValue(points>0,'没有可抵扣积分或平台仓储服务费');
    let left=points;
    e.ledger.slice().sort((a,b)=>a.expiresAt-b.expiresAt).forEach(p=>{if(p.expiresAt<=at||left<=0)return;const take=Math.min(left,p.points-p.used);p.used=round(p.used+take);left=round(left-take);});
    o.discount=points;o.redeemed=true;sync(e,at);return true;
  }
  if(name==='createAlert'){
    const o=state.orders.find(x=>x.id===data.id);
    requireValue(o&&o.enterpriseId===e.id&&['stored','shipping'].includes(o.status),'仅本企业在库或在途订单可演示告警');
    requireValue(!state.alerts.some(a=>a.orderId===o.id&&a.status!=='archived'),'该订单已有未归档告警');
    state.alerts.unshift({id:'AL'+(state.alerts.length+1),orderId:o.id,owner:e.id,level:'严重超温（模拟）',temperature:o.temp==='2-8℃'?10:-15,status:'open',createdAt:at,steps:[{message:'模拟推送质量负责人和平台运营方',at}]});return true;
  }
  if(name==='advanceAlert'){
    const a=state.alerts.find(x=>x.id===data.id);requireValue(a&&a.owner===e.id,'告警不属于当前企业');
    const next={open:['responded','人员响应（模拟）'],responded:['resolved','现场处置：转移备用冷库并复测正常（模拟）'],resolved:['archived','结果归档并复盘（本机记录，未上链）']}[a.status];
    requireValue(next,'该告警已归档');a.status=next[0];a.steps.push({message:next[1],at});return true;
  }
  return false;
}
function dashboard(state,e,at,available,addDays) {
  const start=new Date(at).toISOString().slice(0,10);
  const forecast=[];
  for(let i=0;i<7;i++)for(const temp of ['2-8℃','-20℃']){
    const date=addDays(start,i), window={start:date,end:addDays(date,1)};
    const resources=state.resources.filter(r=>r.active&&r.qualified&&r.type==='pool'&&r.temp===temp);
    const free=round(resources.reduce((s,r)=>s+available(state,r,window),0));
    const demand=round(state.orders.filter(o=>o.temp===temp&&!['cancelled','completed'].includes(o.status)&&o.start<=date&&date<o.end).reduce((s,o)=>s+o.volume,0));
    const shortage=round(state.orders.filter(o=>o.temp===temp&&!['cancelled','completed'].includes(o.status)&&o.start<=date&&date<o.end).reduce((s,o)=>s+Math.max(0,o.volume-o.allocated),0));
    const capacity=resources.reduce((s,r)=>s+r.capacity,0);
    forecast.push({date,temp,free,demand,shortage,tight:shortage>free||(capacity>0&&free/capacity<0.2), note:'已登记订单推演，非预测模型'});
  }
  const months={};
  e.ledger.forEach(p=>{const month=new Date(p.at).toISOString().slice(0,7);months[month]=round((months[month]||0)+p.points);});
  return {monthly:Object.keys(months).sort().reverse().map(month=>({month,earned:months[month]})),ledger:e.ledger.map(p=>Object.assign({},p,{remaining:round(Math.max(0,p.points-p.used)),expired:p.expiresAt<=at,date:new Date(p.at).toISOString().slice(0,10),expiry:new Date(p.expiresAt).toISOString().slice(0,10)})),membership:e.membership,forecast,alerts:state.alerts.filter(a=>a.owner===e.id).map(a=>Object.assign({},a,{statusText:{open:'待响应',responded:'待处置',resolved:'待归档',archived:'已归档'}[a.status],actionText:{open:'模拟人员响应',responded:'模拟完成处置',resolved:'归档并复盘'}[a.status]})),exitDate:e.membership.exitAt?new Date(e.membership.exitAt).toISOString().slice(0,10):'',bills:state.orders.filter(o=>o.enterpriseId===e.id).map(o=>Object.assign({id:o.id},bill(o)))};
}
module.exports={prepare,credit,sync,bill,act,dashboard,expires};
