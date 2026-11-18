const { shareAppMessage } = require('../../services/share');
const platform = require('../../services/platform');
const navigation = require('../../services/navigation');
const { load } = require('../../services/page-state');
Page({
  alliance(){wx.navigateTo({url:'/pages/alliance/index'});},
  onShareAppMessage: shareAppMessage,
  data:{ready:false,loading:false,loadError:'',mode:platform.mode,showRules:false},
  onShow(){return this.refresh();},
  onPullDownRefresh(){return this.refresh();},
  async refresh(){return load(this,async()=>{
    const v=await platform.getView();
    const storageIncome=v.orders.filter(o=>o.status==='completed').reduce((sum,o)=>sum+o.allocations.filter(a=>v.resources.some(r=>r.id===a.resourceId&&r.owner===v.selected.id)).reduce((subtotal,a)=>subtotal+a.volume*a.price*o.days*0.8,0),0);
    const income=storageIncome+v.orders.reduce((sum,o)=>sum+(o.shipments||[]).filter(s=>s.owner===v.selected.id).reduce((subtotal,s)=>subtotal+s.providerIncome,0),0);
    this.setData(Object.assign({},v,{selectedIndex:v.enterprises.findIndex(e=>e.id===v.selected.id),companyNames:v.enterprises.map(e=>e.name),recentEvents:v.events.slice(0,6),sharedIncome:Math.round(income*100)/100}));return v;
  });},
  async company(e){try{await platform.action('selectEnterprise',{id:this.data.enterprises[Number(e.detail.value)].id});await this.refresh();}catch(err){platform.error(err);}},
  rules(){this.setData({showRules:!this.data.showRules});},
  orders(){navigation.go('orders',{scope:'mine',filter:'all'});},
  resources(){navigation.go('resources');},
  reset(){wx.showModal({title:'恢复演示数据',content:'清空当前工作区的模拟预约、资源发布和积分变化，恢复初始数据。',confirmText:'恢复数据',confirmColor:'#A45A40',success:async r=>{if(!r.confirm)return;try{await platform.action('reset');await this.refresh();wx.showToast({title:'演示数据已恢复'});}catch(err){platform.error(err);}}});},
  about(){wx.showModal({title:'关于渝冷智享',content:'重庆国际生物城生物药集群池化共享智慧冷链平台设计。\n\n本程序仅用于比赛演示。企业、资源、资质标记、订单、费用、温控与运输均为模拟，不提供真实药品仓储、运输、交易或医疗服务。日志未接区块链。\n\n本地模式数据保存在当前设备；远程模式保存独立演示工作区。不会要求手机号、真实姓名、定位或患者信息，可通过恢复演示数据清空记录。',showCancel:false});}
});
