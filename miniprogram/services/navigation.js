const routes = {
  home: '/pages/home/index', resources: '/pages/resources/index',
  booking: '/pages/booking/index', orders: '/pages/orders/index', profile: '/pages/profile/index'
};
const pending = {};
function go(key, params) {
  if (!routes[key]) throw new Error('页面不存在');
  pending[key] = params || {};
  wx.switchTab({ url: routes[key] });
}
function take(key) { const value = pending[key] || {}; delete pending[key]; return value; }
module.exports = { go, take };
