const { shareAppMessage } = require('../../services/share');
const platform = require('../../services/platform');
const navigation = require('../../services/navigation');
const { load } = require('../../services/page-state');
const { decorateModel } = require('../../utils/presentation');
Page({
  onShareAppMessage: shareAppMessage,
  data: { ready: false, loading: false, loadError: '', scope: 'mine', filter: 'all', orders: [], mine: [], displayed: [], busy: false },
  onShow() { const entry=navigation.take('orders'); this.setData(Object.assign({},entry.scope ? {scope:entry.scope}:{},entry.filter ? {filter:entry.filter}:{})); return this.refresh(); },
  onPullDownRefresh() { return this.refresh(); },
  async refresh() { return load(this,async()=>{const v=decorateModel(await platform.getView());this.setData(v);this.setScope();return v;}); },
  scope(e) { this.setData({scope:e.currentTarget.dataset.value});this.setScope(); },
  filter(e) { this.setData({filter:e.currentTarget.dataset.value});this.setScope(); },
  setScope() {
    const source=this.data.scope==='all'?this.data.orders:this.data.mine;
    const filter=this.data.filter;
    this.setData({displayed:source.filter(o=>filter==='all'||(filter==='pending'&&['allocated','partial','waiting','emergency_pending','confirmed'].includes(o.status))||(filter==='stored'&&['stored','shipping'].includes(o.status))||(filter==='ended'&&o.ended)||(filter==='support'&&o.status==='emergency_pending'))});
  },
  detail(e) { wx.navigateTo({url:'/pages/detail/index?id='+e.currentTarget.dataset.id}); },
  book() { navigation.go('booking'); },
  clearFilter() { this.setData({filter:'all'});this.setScope(); },
  async accept(e) {
    if(this.data.busy)return;this.setData({busy:true});
    try { await platform.action('acceptEmergency',{id:e.currentTarget.dataset.id,resourceId:e.currentTarget.dataset.resource});await this.refresh();wx.showToast({title:'应急协作已确认'}); }
    catch(err){platform.error(err);}finally{this.setData({busy:false});}
  }
});
