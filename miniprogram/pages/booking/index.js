const { shareAppMessage } = require('../../services/share');
const platform = require('../../services/platform');
const navigation = require('../../services/navigation');
const { load } = require('../../services/page-state');
Page({
  onShareAppMessage: shareAppMessage,
  seasonChange(e){this.setData({seasonIndex:Number(e.detail.value)});},
  data: { seasonIndex:0, seasonOptions:['平季：基准价','旺季：上浮20%','淡季：下浮15%'], ready: false, loading: false, loadError: '', tempOptions: ['2-8℃','-20℃'], tempIndex: 0, urgencyOptions: ['普通备货','临床急需（模拟）','急救（模拟）','温控风险紧急'], urgencyKeys: ['normal','clinical','rescue','urgent'], urgencyIndex: 0, riskOptions: ['低风险 · 30分','存在隐患 · 80分','高风险 · 100分'], riskValues: [30,80,100], riskIndex: 0, start: '2026-11-02', isolation: false, evidence: false, busy: false, formError: '', sourceName: '', fields: { volume: '', days: '3', drug: '' } },
  onShow() {
    const entry = navigation.take('booking');
    const update = { formError: '' };
    if (entry.temp) update.tempIndex = this.data.tempOptions.indexOf(entry.temp);
    if (entry.start) update.start = entry.start;
    if (entry.days) update.fields = Object.assign({},this.data.fields,{days:String(entry.days)});
    if (entry.sourceName) update.sourceName = entry.sourceName;
    else if (Object.keys(entry).length) update.sourceName = '';
    this.setData(update);
    return this.refresh();
  },
  async refresh() { return load(this, async () => { const v = await platform.getView(); this.setData({ selected: v.selected }); return v; }); },
  input(e) { this.setData({ fields: Object.assign({},this.data.fields,{[e.currentTarget.dataset.field]:e.detail.value}), formError: '' }); },
  tempChange(e) { this.setData({ tempIndex: Number(e.detail.value), sourceName: '' }); },
  chooseTemp(e) { this.tempChange({ detail: { value: e.currentTarget.dataset.index } }); },
  urgencyChange(e) { this.setData({ urgencyIndex: Number(e.detail.value), evidence: false }); },
  riskChange(e) { this.setData({ riskIndex: Number(e.detail.value) }); },
  dateChange(e) { this.setData({ start: e.detail.value }); },
  isolationChange(e) { this.setData({ isolation: e.detail.value }); },
  evidenceChange(e) { this.setData({ evidence: e.detail.value }); },
  async submit(e) {
    if (this.data.busy) return;
    this.setData({ busy: true, formError: '' });
    try {
      const v = await platform.action('book',Object.assign({},this.data.fields,e.detail.value,{
        season:['normal','peak','low'][this.data.seasonIndex],temp: this.data.tempOptions[this.data.tempIndex], urgency: this.data.urgencyKeys[this.data.urgencyIndex], risk: this.data.riskValues[this.data.riskIndex], start: this.data.start, isolation: this.data.isolation, evidenceConfirmed: this.data.evidence
      }));
      wx.navigateTo({url:'/pages/detail/index?id='+v.mine[0].id});
    } catch (err) { this.setData({formError:err.message || '预约提交失败，请重试'}); } finally { this.setData({busy:false}); }
  }
});
