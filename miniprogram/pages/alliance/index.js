const platform=require('../../services/platform');
const {load}=require('../../services/page-state');
const {shareAppMessage}=require('../../services/share');
Page({
  data:{ready:false,loading:false,loadError:'',busy:false,section:'rights',query:'',trace:null,traceError:'',tabLabels:['权益与账单','溯源与告警','七天供需'],tabKeys:['rights','trace','forecast']},
  onShareAppMessage:shareAppMessage,
  onLoad(options){if(['rights','trace','forecast'].includes(options.section))this.setData({section:options.section});if(options.id)this.setData({query:options.id});},
  onShow(){return this.refresh();},
  onPullDownRefresh(){return this.refresh();},
  async refresh(){return load(this,async()=>{const v=await platform.getView();this.setData(v);if(this.data.query)this.lookup();return v;});},
  section(e){this.setData({section:e.currentTarget.dataset.value});},
  inputQuery(e){this.setData({query:e.detail.value});},
  lookup(){const key=this.data.query.trim();const o=(this.data.orders||[]).find(x=>x.id===key);this.setData({trace:o||null,traceError:o?'':'未找到当前设备／工作区的模拟订单，请核对完整订单号。'});},
  scan(){wx.scanCode({scanType:['qrCode'],success:r=>{this.setData({query:r.result});this.lookup();},fail:e=>{if(!/cancel/i.test(e.errMsg||''))platform.error(new Error('扫码失败，请输入模拟订单号查询'));}});},
  async act(name,payload){if(this.data.busy)return;this.setData({busy:true});try{await platform.action(name,payload);await this.refresh();wx.showToast({title:'模拟操作已记录',icon:'none'});}catch(e){platform.error(e);}finally{this.setData({busy:false});}},
  guarantee(e){const v=e.detail.value;this.act('setGuarantee',{basis:v.months?'history':'plan',months:v.months,volume:v.volume,approved:v.approved===true});},
  exit(){wx.showModal({title:'申请模拟退出',content:'模拟申请将在30天后生效，现有订单仍须交接履约，未过期积分保留。',success:r=>{if(r.confirm)this.act('requestExit',{});}});},
  redeem(e){this.act('redeem',{id:e.currentTarget.dataset.id,points:this.data.selected.points});},
  alert(){if(this.data.trace)this.act('createAlert',{id:this.data.trace.id});},
  advance(e){this.act('advanceAlert',{id:e.currentTarget.dataset.id});}
});
