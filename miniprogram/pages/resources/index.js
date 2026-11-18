const { shareAppMessage } = require('../../services/share');
const platform = require('../../services/platform');
const navigation = require('../../services/navigation');
const { load } = require('../../services/page-state');
const { decorateModel } = require('../../utils/presentation');
Page({
  onShareAppMessage: shareAppMessage,
  data: { ready: false, loading: false, loadError: '', filter: 'all', start: '2026-11-02', days: 3, showPublish: false, tempOptions: ['2-8℃', '-20℃'], publishTemp: 0, isolated: false, emergency: false, busy: false },
  onShow() {
    const entry = navigation.take('resources');
    if (entry.temp) this.setData({ filter: entry.temp });
    return this.refresh();
  },
  onPullDownRefresh() { return this.refresh(); },
  async refresh() {
    return load(this, async () => { const model = decorateModel(await platform.getView(this.data.start,this.data.days)); this.setData(model); this.filterCards(); return model; });
  },
  filterCards() { this.setData({ filtered: (this.data.resources || []).filter(r => this.data.filter === 'all' || r.temp === this.data.filter) }); },
  filter(e) { this.setData({ filter: e.currentTarget.dataset.value }); this.filterCards(); },
  dateChange(e) { this.setData({ start: e.detail.value }); return this.refresh(); },
  daysChange(e) {
    const days = Number(e.detail.value);
    if (!Number.isInteger(days) || days < 1 || days > 90) { platform.error(new Error('查询天数须为1至90的整数')); return; }
    this.setData({ days }); return this.refresh();
  },
  togglePublish() { this.setData({ showPublish: !this.data.showPublish }); },
  tempChange(e) { this.setData({ publishTemp: Number(e.detail.value) }); },
  isolationChange(e) { this.setData({ isolated: e.detail.value }); },
  emergencyChange(e) { this.setData({ emergency: e.detail.value }); },
  async publish(e) {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try { await platform.action('publish', Object.assign({}, e.detail.value, { temp: this.data.tempOptions[this.data.publishTemp], isolated: this.data.isolated, emergency: this.data.emergency })); this.setData({ showPublish: false }); await this.refresh(); wx.showToast({ title: '模拟资源已发布' }); }
    catch (err) { platform.error(err); } finally { this.setData({ busy: false }); }
  },
  book(e) {
    const key = e && e.currentTarget.dataset.id;
    const resource = (this.data.resources || []).find(r => r.id === key);
    navigation.go('booking', { temp: resource && resource.temp, sourceName: resource && resource.name, start: this.data.start, days: this.data.days });
  },
  openOrders() { navigation.go('orders', { filter: 'support', scope: 'all' }); },
  transportOrders() {
    if ((this.data.mine || []).some(o => o.status === 'stored')) { navigation.go('orders', { filter: 'stored', scope: 'mine' }); return; }
    wx.showModal({ title: '配车前需完成入库', content: '请先预约冷库、确认预约并登记入库，再从订单申请车辆。', confirmText: '查看订单', cancelText: '稍后', success: r => { if (r.confirm) navigation.go('orders', { filter: 'all', scope: 'mine' }); } });
  }
});
