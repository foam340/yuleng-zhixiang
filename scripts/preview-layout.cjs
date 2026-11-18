'use strict';
// 本工具只把真实编译后的WXML转成布局检查HTML，不替代微信模拟器/真机。
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { pathToFileURL } = require('node:url');
const d = require('../miniprogram/core/domain');
const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const buildDir = require('./compile-wechat.cjs').compile();
const previewDir = path.join(root, 'artifacts/previews');
fs.mkdirSync(previewDir, { recursive: true });
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(buildDir, 'wxml.js'), 'utf8'), sandbox);
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8').replace(/^\uFEFF/, ''));
const generated = [];
let state;
global.wx = {
  getStorageSync: () => JSON.parse(JSON.stringify(state)),
  setStorageSync: (_, value) => { state = value; },
  showModal: value => { throw new Error(value.content); },
  showToast() {}, navigateTo() {}, switchTab() {}, stopPullDownRefresh() {}
};
const escape = value => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
function asset(source) { return source && source.startsWith('/assets/') ? pathToFileURL(path.join(miniRoot,source.slice(1))).href : source || ''; }
function html(node) {
  if(node == null)return '';
  if(typeof node !== 'object')return escape(node);
  if(Array.isArray(node))return node.map(html).join('');
  const children=(node.children||[]).map(html).join('');
  if(node.tag==='virtual')return children;
  const attrs=node.attr||{};
  const kind=(node.tag||'wx-view').replace(/^wx-/,'');
  if(kind==='br')return '<br>';
  let tag=kind==='text'?'span':kind==='button'?'button':kind==='input'?'input':kind==='form'?'form':kind==='image'?'img':'div';
  let attributes=' class="'+escape((attrs.class||'')+(kind==='page'?' wx-page':''))+'"';
  if(attrs.style)attributes+=' style="'+escape(attrs.style)+'"';
  if(attrs.id)attributes+=' id="'+escape(attrs.id)+'"';
  if(attrs.disabled)attributes+=' disabled';
  if(kind==='button' && attrs.size)attributes+=' size="'+escape(attrs.size)+'"';
  if(kind==='input')attributes+=' value="'+escape(attrs.value)+'" placeholder="'+escape(attrs.placeholder)+'"';
  if(kind==='image')attributes+=' src="'+escape(asset(attrs.src))+'" alt=""';
  if(kind==='switch')return '<span class="native-switch '+(attrs.checked?'on':'')+'"></span>';
  return '<'+tag+attributes+'>'+children+(['input','img'].includes(tag)?'':'</'+tag+'>');
}
function style(file) { return fs.readFileSync(file,'utf8').replace(/@import\s+["']([^"']+)["'];/g,(_,name)=>style(path.resolve(path.dirname(file),name))); }
const appStyle=style(path.join(miniRoot,'app.wxss')).replace(/(^|\n)page\s*\{/g,'$1.wx-page{').replace(/\bimage\b/g,'img');
const rpx=(text,width)=>text.replace(/(-?[\d.]+)rpx/g,(_,number)=>Number(number)*width/750+'px');
// 回归近似层：保留原生按钮的块布局、默认行高和v2非mini宽度选择器。
// 避免浏览器reset提前把按钮设成flex而掩盖问题；这仍不是微信运行时。
const nativeButtonBaseline='button{display:block;position:relative;margin-left:auto;margin-right:auto;padding-left:14px;padding-right:14px;border:0;font-size:18px;line-height:2.55555556;text-align:center;cursor:pointer}button:not([size="mini"]){width:184px;padding:8px 24px}button[size="mini"]{display:inline-block;width:auto;padding:0 1.34em;font-size:13px}';
const chrome='*{box-sizing:border-box}body{margin:0;background:#F3F7FB;font-family:"PingFang SC","Microsoft YaHei",sans-serif}'+nativeButtonBaseline+'input{font:inherit;border:0;outline:0;min-width:0}form{margin:0}img{object-fit:contain}.status{height:28px;padding:4px 21px 0;font-size:11px;display:flex;justify-content:space-between;color:#153348}.navbar{height:44px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:500;color:#153348}.tabs{display:flex;height:62px;align-items:center;background:#fff;box-shadow:0 -1px 0 #E4EDF4;position:fixed;bottom:0;left:0;z-index:5}.tabs a{flex:1;text-align:center;color:#7A8B99;font-size:10px;text-decoration:none}.tabs img{display:block;width:22px;height:22px;margin:0 auto 4px}.tabs .selected{color:#096C9C}.native-switch{display:inline-block;width:42px;height:25px;border-radius:20px;background:#DDE7EF;position:relative;flex-shrink:0}.native-switch:after{content:"";position:absolute;left:2px;top:2px;width:21px;height:21px;border-radius:50%;background:#fff}.native-switch.on{background:#096C9C}.native-switch.on:after{left:19px}.qa-note{font-size:10px;text-align:center;color:#607689;padding:8px 16px 80px}.wx-page{padding-bottom:55px}';
function fixture(variant) {
  let result=d.seed();
  if(['empty','loading','error','form-error','busy'].includes(variant))return result;
  if(['stored','dispatch','shipping','completed','trace','alert'].includes(variant)) {
    result=d.apply(result,'book',{temp:'2-8℃',volume:10,days:3,start:'2026-11-02',urgency:'normal',risk:30});
    const id=result.orders[0].id;
    result=d.apply(result,'confirm',{id});result=d.apply(result,'checkIn',{id,code:id});
    if(variant==='alert')result=d.apply(result,'createAlert',{id});
    if(['shipping','completed'].includes(variant))result=d.apply(result,'dispatch',{id,volume:10,tons:1,minutes:120});
    if(variant==='completed')result=d.apply(result,'complete',{id});
    return result;
  }
  result=d.apply(result,'runCase',{},Date.now());
  if(variant==='support')result=d.apply(result,'selectEnterprise',{id:'jia'});
  return result;
}
async function render(name,variant,width) {
  state=fixture(variant);
  const navigation=require('../miniprogram/services/navigation');
  for(const key of ['home','resources','booking','orders','profile'])navigation.take(key);
  let definition;global.Page=value=>{definition=value;};
  const file=path.join(miniRoot,'pages',name,'index.js');delete require.cache[require.resolve(file)];require(file);
  const page=Object.assign({},definition,{data:JSON.parse(JSON.stringify(definition.data)),setData(update){Object.assign(this.data,update);}});
  if(page.onLoad)page.onLoad({id:(state.orders.find(o=>o.enterpriseId===(variant==='emergency'?'ji':'yi'))||{}).id});
  if(page.refresh)await page.refresh();else await page.onShow();
  if(variant==='loading')page.setData({ready:false,loading:true,loadError:''});
  if(variant==='error')page.setData({ready:false,loading:false,loadError:'暂时无法连接演示服务，请检查网络后重试。'});
  if(variant==='busy')page.setData({busy:true});
  if(variant==='form-error')page.setData({formError:'请填写有效的需求库容，再提交预约。'});
  if(variant==='publish')page.setData({showPublish:true});
  if(variant==='rules')page.setData({showRules:true});
  if(variant==='dispatch')page.setData({showDispatch:true});
  if(variant==='score')page.setData({showScore:true});
  if(name==='alliance' && ['trace','alert'].includes(variant))page.setData({section:'trace'});
  if(name==='alliance' && variant==='forecast')page.setData({section:'forecast'});
  if(variant==='support')page.setData({scope:'all',filter:'support'});
  if(name==='orders') { if(variant==='all')page.setData({scope:'all'}); if(variant==='ended')page.setData({filter:'ended'}); page.setScope(); }
  if(variant==='long-name')page.setData({selected:Object.assign({},page.data.selected,{name:'重庆国际生物城创新生物制药研发有限公司'})});
  const tree=sandbox.$gwx('./pages/'+name+'/index.wxml')(page.data);if(!tree)throw new Error('WXML未返回渲染结果');
  const tabs=['detail','alliance'].includes(name)?'':'<nav class="tabs">'+app.tabBar.list.map(item=>{const active=item.pagePath==='pages/'+name+'/index';return '<a class="'+(active?'selected':'')+'"><img alt="" src="'+escape(asset('/'+(active?item.selectedIconPath:item.iconPath)))+'">'+escape(item.text)+'</a>';}).join('')+'</nav>';
  const output='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+chrome+rpx(appStyle,width)+'html,body{width:'+width+'px;max-width:'+width+'px;overflow-x:hidden}.tabs{width:'+width+'px}</style><div class="status"><span>9:41</span><span>●●● ▰</span></div><header class="navbar">'+escape(app.window.navigationBarTitleText)+'</header>'+rpx(html(tree),width)+'<div class="qa-note">编译后模板的布局检查，非真机截图</div>'+tabs+'</html>';
  const filename=name+'-'+variant+'-'+width+'.html';fs.writeFileSync(path.join(previewDir,filename),output);generated.push({filename,page:name,state:variant,width});
}
(async()=>{
  for(const width of [320,375,390]){
    for(const name of ['home','resources','booking','orders','profile','detail','alliance'])await render(name,name==='home'?'empty':'case',width);
    if(width!==375)await render('orders','empty',width);
  }
  for(const width of [320,375,390])for(const variant of ['trace','alert','forecast','completed','error','empty'])await render('alliance',variant,width);
  for(const [page,variant] of [['home','case'],['home','loading'],['home','error'],['home','long-name'],['resources','publish'],['resources','error'],['booking','busy'],['booking','form-error'],['orders','empty'],['orders','all'],['orders','support'],['orders','ended'],['profile','rules'],['profile','error'],['detail','emergency'],['detail','score'],['detail','stored'],['detail','dispatch'],['detail','shipping'],['detail','completed']])await render(page,variant,375);
  const index='<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>冷链小程序布局检查</title><body style="font-family:Microsoft YaHei,sans-serif;padding:28px;color:#153348"><h1>渝冷智享布局检查</h1><p>真实WXML编译后转HTML，仅用于布局与状态检查，不替代微信模拟器或真机。</p><ul>'+generated.map(item=>'<li style="margin:12px 0"><a href="'+escape(item.filename)+'">'+escape(item.filename)+'</a></li>').join('')+'</ul></body></html>';
  fs.writeFileSync(path.join(previewDir,'index.html'),index);fs.writeFileSync(path.join(previewDir,'manifest.json'),JSON.stringify(generated,null,2));
  console.log('已生成'+generated.length+'个布局/状态预览，入口：artifacts/previews/index.html');
})().catch(error=>{console.error(error);process.exitCode=1;});
