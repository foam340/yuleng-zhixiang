const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const domain = require('../miniprogram/core/domain');
const navigation = require('../miniprogram/services/navigation');
function harness(initial = domain.seed()) {
  let state = initial;
  const modals = [];
  const visits = [];
  for (const name of ['home','resources','booking','orders','profile']) navigation.take(name);
  global.wx = {
    getStorageSync: () => JSON.parse(JSON.stringify(state)), setStorageSync: (_,value) => { state=value; },
    showModal: value => modals.push(value), showToast() {}, switchTab: value => visits.push(value.url), navigateTo: value => visits.push(value.url), stopPullDownRefresh() {}
  };
  function page(name) {
    let definition;global.Page=value=>{definition=value;};
    const file=path.join(__dirname,'../miniprogram/pages',name,'index.js');delete require.cache[require.resolve(file)];require(file);
    return Object.assign({},definition,{data:JSON.parse(JSON.stringify(definition.data)),setData(value){Object.assign(this.data,value);}});
  }
  return {page,modals,visits,state:()=>state,dispose(){delete global.wx;delete global.Page;}};
}
test('各页面转发不携带本机订单或身份，接收者首次打开可正常进入首页',async()=>{
  const h=harness();try{
    const app=require('../miniprogram/app.json');
    for(const route of app.pages){
      const page=h.page(route.split('/')[1]);
      page.orderId='sender-local-order';
      page.data.selected={id:'sender-company'};
      assert.equal(typeof page.onShareAppMessage,'function',route+'需提供转发处理函数');
      const share=page.onShareAppMessage({from:'menu'});
      assert.ok(app.pages.includes(share.path.slice(1)),'分享目标必须是可独立打开的已注册页面');
      assert.equal(share.path,'/pages/home/index');
      assert.equal(share.title,'渝冷智享，让冷库与运力共享更高效');
    }
    const home=h.page('home');await home.onShow();
    assert.equal(home.data.ready,true);assert.equal(home.data.loadError,'');
    assert.equal(h.state().orders.length,0);
  }finally{h.dispose();}
});

test('联盟页面可核定保底，并从订单号查询后走完整告警闭环',async()=>{
  let state=domain.apply(domain.seed(),'book',{temp:'2-8℃',start:'2026-11-02',days:3,volume:10,urgency:'normal',risk:30});
  const id=state.orders[0].id;state=domain.apply(state,'confirm',{id});state=domain.apply(state,'checkIn',{id,code:id});
  const h=harness(state);try{
    const page=h.page('alliance');page.onLoad({id,section:'trace'});await page.onShow();assert.equal(page.data.trace.id,id);
    await page.act('setGuarantee',{basis:'history',months:Array(12).fill(100).join(',')});assert.equal(page.data.selected.guarantee,80);
    await page.act('createAlert',{id});const alert=page.data.alliance.alerts[0].id;
    for(let i=0;i<3;i++)await page.act('advanceAlert',{id:alert});assert.equal(page.data.alliance.alerts[0].status,'archived');
    page.setData({query:'不存在'});page.lookup();assert.equal(page.data.trace,null);assert.ok(page.data.traceError);
  }finally{h.dispose();}
});

test('查看旧缓存时固定保存积分迁移时间，重看或重置不延长账龄',async()=>{
  const h=harness();try{
    const platform=require('../miniprogram/services/platform');
    await platform.getView();const before=h.state().enterprises[1].ledger[0];
    assert.ok(before.expiresAt>before.at);
    const realNow=Date.now;
    try{
      Date.now=()=>before.at+86400000;
      await platform.getView();assert.deepEqual(h.state().enterprises[1].ledger[0],before);
      const migrated=domain.migrate(h.state(),before.expiresAt);
      assert.equal(migrated.enterprises[1].points,0);
    }finally{Date.now=realNow;}
    await platform.action('reset');assert.ok(h.state().enterprises[1].ledger);
  }finally{h.dispose();}
});

test('从冷冻资源发起预约时温区、日期、天数真实传递并提交',async()=>{
  const h=harness();try{
    const resources=h.page('resources');await resources.refresh();resources.setData({start:'2026-11-09',days:5});
    resources.book({currentTarget:{dataset:{id:'C'}}});
    const booking=h.page('booking');await booking.onShow();
    assert.equal(booking.data.tempIndex,1);assert.equal(booking.data.start,'2026-11-09');assert.equal(booking.data.fields.days,'5');
    booking.setData({fields:{volume:'12',days:'5',drug:'模拟蛋白原液'}});
    await booking.submit({detail:{value:{}}});
    assert.equal(h.state().orders.length,1);assert.equal(h.state().orders[0].temp,'-20℃');assert.equal(h.state().orders[0].days,5);assert.equal(h.state().orders[0].start,'2026-11-09');assert.equal(booking.data.busy,false);
  }finally{h.dispose();}
});
test('状态筛选区分待处理、存储运输和结束订单',async()=>{
  let state=domain.apply(domain.seed(),'book',{temp:'2-8℃',start:'2026-11-02',days:3,volume:10,urgency:'normal',risk:30});
  const first=state.orders[0].id;state=domain.apply(state,'confirm',{id:first});state=domain.apply(state,'checkIn',{id:first,code:first});
  state=domain.apply(state,'book',{temp:'2-8℃',start:'2026-11-02',days:3,volume:20,urgency:'normal',risk:30});
  const second=state.orders[1].id;state=domain.apply(state,'cancel',{id:second});
  const h=harness(state);try{
    const orders=h.page('orders');await orders.refresh();
    orders.filter({currentTarget:{dataset:{value:'pending'}}});assert.equal(orders.data.displayed.length,0);
    orders.filter({currentTarget:{dataset:{value:'stored'}}});assert.deepEqual(orders.data.displayed.map(o=>o.id),[first]);
    orders.filter({currentTarget:{dataset:{value:'ended'}}});assert.deepEqual(orders.data.displayed.map(o=>o.id),[second]);
  }finally{h.dispose();}
});
test('加载错误可从账户恢复，预约校验错误留在表单且可重试',async()=>{
  const state=domain.seed();state.version=-1;const h=harness(state);try{
    const profile=h.page('profile');await profile.refresh();assert.equal(profile.data.ready,false);assert.ok(profile.data.loadError);
    profile.reset();await h.modals[0].success({confirm:true});assert.equal(profile.data.ready,true);assert.equal(profile.data.loadError,'');
    const booking=h.page('booking');await booking.onShow();await booking.submit({detail:{value:{volume:'',days:3}}});
    assert.ok(booking.data.formError);assert.equal(booking.data.busy,false);assert.equal(h.state().orders.length,0);
    await booking.submit({detail:{value:{volume:10,days:3}}});assert.equal(booking.data.formError,'');assert.equal(h.state().orders.length,1);
  }finally{h.dispose();}
});
