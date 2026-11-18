const { shareAppMessage } = require('../../services/share');
const platform = require('../../services/platform');
const navigation = require('../../services/navigation');
const { load } = require('../../services/page-state');
const { decorateModel } = require('../../utils/presentation');
Page({
  onShareAppMessage: shareAppMessage,
  data: { ready: false, loading: false, loadError: '', busy: false, mode: platform.mode },
  onShow() { return this.refresh(); },
  onPullDownRefresh() { return this.refresh(); },
  async refresh() {
    return load(this, async () => {
      const model = decorateModel(await platform.getView());
      const coldTotal = model.resources.filter(r => r.pool && r.cold).reduce((s,r) => s+r.capacity,0);
      const frozenTotal = model.resources.filter(r => r.pool && !r.cold).reduce((s,r) => s+r.capacity,0);
      this.setData(Object.assign({}, model, {
        activeOrders: model.mine.filter(o => !o.ended).slice(0,2),
        hasOrders: model.orders.length > 0,
        emergencyCount: model.mine.filter(o => o.status === 'emergency_pending').length + model.supportRequests.length,
        coldTotal, frozenTotal
      }));
      return model;
    });
  },
  book() { navigation.go('booking'); },
  resources(e) { navigation.go('resources', { temp: e && e.currentTarget.dataset.temp || 'all' }); },
  orders() { navigation.go('orders', { filter: 'all', scope: 'mine' }); },
  support() { navigation.go('orders', { filter: 'support', scope: 'all' }); },
  detail(e) { wx.navigateTo({ url: '/pages/detail/index?id=' + e.currentTarget.dataset.id }); },
  switchCompany() {
    const companies = this.data.enterprises || [];
    if (!companies.length) return;
    wx.showActionSheet({ itemList: companies.map(e => e.name + (e.id === this.data.selected.id ? '（当前）' : '')), success: async res => {
      try { await platform.action('selectEnterprise', { id: companies[res.tapIndex].id }); await this.refresh(); } catch (err) { platform.error(err); }
    } });
  },
  async runCase() {
    if (this.data.busy) return;
    this.setData({ busy: true });
    try {
      if (this.data.hasOrders) {
        const confirmed = await new Promise(resolve => wx.showModal({ title: '重新演示旺季案例', content: '将恢复当前工作区的初始资源、清空已有模拟预约，再生成六家企业案例。', confirmText: '重新演示', success: r => resolve(r.confirm), fail: () => resolve(false) }));
        if (!confirmed) return;
        await platform.action('reset');
      }
      await platform.action('runCase'); await this.refresh();
      wx.showToast({ title: '案例分配已完成', icon: 'none' });
    } catch (err) { platform.error(err); } finally { this.setData({ busy: false }); }
  }
});
