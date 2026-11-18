const tone = { allocated: 'blue', partial: 'amber', waiting: 'amber', emergency_pending: 'amber', confirmed: 'blue', stored: 'teal', shipping: 'blue', completed: 'gray', cancelled: 'gray' };
const next = { allocated: '确认预约', partial: '查看分配', waiting: '查看方案', emergency_pending: '查看协作', confirmed: '登记入库', stored: '出库配车', shipping: '查看运输', completed: '查看记录', cancelled: '查看详情' };
const stage = { allocated: 1, partial: 1, waiting: 0, emergency_pending: 1, confirmed: 1, stored: 2, shipping: 3, completed: 4, cancelled: 0 };
function decorateOrder(o) {
  return Object.assign({}, o, {
    tone: tone[o.status] || 'gray', nextAction: next[o.status] || '查看详情',
    cold: o.temp === '2-8℃', dateLabel: o.start.slice(5).replace('-', '月') + '日',
    ended: ['completed', 'cancelled'].includes(o.status),
    steps: ['提交', '分配', '入库', '运输', '完成'].map((name, index) => ({ name, index, active: index === stage[o.status], done: index < stage[o.status] }))
  });
}
function decorateModel(model) {
  return Object.assign({}, model, {
    mine: model.mine.map(decorateOrder), orders: model.orders.map(decorateOrder),
    resources: model.resources.map(r => Object.assign({}, r, {
      cold: r.temp === '2-8℃', freePct: Math.max(0, Math.min(100, Math.round(r.available / r.capacity * 100))),
      pool: r.type === 'pool', tight: r.available === 0
    }))
  });
}
module.exports = { decorateOrder, decorateModel };
