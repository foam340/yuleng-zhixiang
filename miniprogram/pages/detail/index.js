const { shareAppMessage } = require('../../services/share');
const platform = require('../../services/platform');
const navigation = require('../../services/navigation');
const { load } = require('../../services/page-state');
const { decorateOrder } = require('../../utils/presentation');
function timeLabel(timestamp) {
  const d = new Date(timestamp);
  const pad = value => String(value).padStart(2, '0');
  return pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
}
Page({
  trace(){wx.navigateTo({url:'/pages/alliance/index?section=trace&id='+encodeURIComponent(this.orderId)});},
  onShareAppMessage: shareAppMessage,
  data: { ready: false, loading: false, loadError: '', busy: false, showDispatch: false, showScore: false },
  onLoad(options) { this.orderId = options.id; },
  onShow() { return this.refresh(); },
  onPullDownRefresh() { return this.refresh(); },
  async refresh() {
    return load(this, async () => {
      const v = await platform.getView();
      const raw = v.orders.find(item => item.id === this.orderId);
      const o = raw && decorateOrder(raw);
      if (!o) { this.setData({ ready: false }); throw new Error('订单不存在，可能已恢复演示数据'); }
      const temperature = o.temp === '2-8℃' ? [4.2, 4.4, 4.3, 4.6, 4.5, 4.1, 4.2, 4.4, 4.3, 4.5, 4.4, 4.2] : [-20.2, -20.4, -20.1, -20.3, -20.5, -20.2, -20.4, -20.3, -20.1, -20.2, -20.3, -20.2];
      this.setData({
        ready: true, o, selected: v.selected, own: o.enterpriseId === v.selected.id,
        history: o.history.map(item => Object.assign({}, item, { time: timeLabel(item.at) })),
        canConfirm: ['allocated', 'partial'].includes(o.status),
        canCancel: ['allocated', 'partial', 'waiting', 'emergency_pending', 'confirmed'].includes(o.status),
        canEmergency: ['waiting', 'partial'].includes(o.status) && o.risk >= 90,
        monitoring: ['stored', 'shipping', 'completed'].includes(o.status),
        defaultVolume: Math.min(20, o.unshipped),
        temperature: temperature.map(value => ({ value, height: Math.max(0, Math.min(100, o.temp === '2-8℃' ? (value - 2) / 6 * 100 : (value + 22) / 4 * 100)) })),
        currentTemperature: temperature[temperature.length - 1],
        appealDue: o.appeal ? timeLabel(o.appeal.dueAt) : ''
      });
      return v;
    });
  },
  async act(name, payload) {
    if (this.data.busy) return false;
    this.setData({ busy: true });
    try { await platform.action(name, Object.assign({ id: this.orderId }, payload)); await this.refresh(); wx.showToast({ title: '操作已记录', icon: 'success' }); return true; }
    catch (err) { platform.error(err); return false; } finally { this.setData({ busy: false }); }
  },
  confirm() { this.act('confirm'); },
  cancel() { wx.showModal({ title: '取消模拟预约', content: '取消后将释放已锁定的库容。', success: res => { if (res.confirm) this.act('cancel'); } }); },
  emergency() { this.act('requestEmergency'); },
  demoCheckIn() { this.act('checkIn', { code: this.orderId }); },
  scan() { wx.scanCode({ onlyFromCamera: false, scanType: ['qrCode'], success: res => this.act('checkIn', { code: res.result }), fail: err => { if (!/cancel/i.test(err.errMsg || '')) platform.error(new Error('未能读取二维码，可使用模拟入库码按钮')); } }); },
  toggleDispatch() { this.setData({ showDispatch: !this.data.showDispatch }); },
  toggleScore() { this.setData({ showScore: !this.data.showScore }); },
  dispatch(e) { this.act('dispatch', e.detail.value).then(ok => { if (ok) this.setData({ showDispatch: false }); }); },
  complete() { this.act('complete'); },
  appeal() { wx.showModal({ title: '提交模拟申诉', content: '请描述原因（5至300字），将记录48小时演示复核期限。', editable: true, success: res => { if (res.confirm) this.act('appeal', { reason: res.content }); } }); },
  async switchCompany() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { await platform.action('selectEnterprise', { id: this.data.o.enterpriseId }); await this.refresh(); wx.showToast({ title: '已切换模拟企业', icon: 'none' }); }
    catch (err) { platform.error(err); } finally { this.setData({ busy: false }); }
  },
  async openSupply() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      const v = await platform.getView(this.data.o.start, this.data.o.days);
      const current = v.orders.find(o => o.id === this.orderId);
      if (!current || current.status !== 'emergency_pending') throw new Error('该请求已处理，请刷新订单后查看');
      const candidates = v.resources.filter(r => r.type === 'emergency' && r.active && r.qualified && r.temp === current.temp && (!current.isolation || r.isolated) && r.available >= current.remaining);
      if (!candidates.length) throw new Error('当前时段暂无满足条件的应急供给资源');
      const chosen = candidates.length === 1 ? candidates[0] : await new Promise(resolve => wx.showActionSheet({ itemList: candidates.slice(0, 6).map(r => r.ownerName + ' · ' + r.name), success: res => resolve(candidates[res.tapIndex]), fail: () => resolve(null) }));
      if (!chosen) return;
      await platform.action('selectEnterprise', { id: chosen.owner });
      navigation.go('orders', { filter: 'support', scope: 'all' });
    } catch (err) { platform.error(err); } finally { this.setData({ busy: false }); }
  }
});
