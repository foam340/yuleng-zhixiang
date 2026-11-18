const domain = require('../core/domain');
const config = require('../config');
function localState() {
  const state = wx.getStorageSync(config.storageKey);
  if (!state) {
    const initial = domain.migrate(domain.seed());
    wx.setStorageSync(config.storageKey, initial);
    return initial;
  }
  if (state.version !== domain.VERSION) throw new Error('演示数据版本不兼容，请在“我的”恢复演示数据');
  // 将首次迁移时间固定到缓存，后续只查看页面也不会延后积分有效期。
  const migrated = domain.migrate(state);
  if (JSON.stringify(migrated) !== JSON.stringify(state)) wx.setStorageSync(config.storageKey, migrated);
  return migrated;
}
function request(path, method, data, token) {
  return new Promise((resolve, reject) => {
    if (!/^https:\/\//.test(config.apiBase)) { reject(new Error('远程模式需要配置HTTPS接口域名')); return; }
    wx.request({
      url: config.apiBase.replace(/\/$/, '') + path, method, data,
      header: { 'content-type': 'application/json', authorization: token ? 'Bearer ' + token : '' },
      timeout: 15000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(res.data);
        else {
          if (res.statusCode === 401) wx.removeStorageSync('biocity-demo-token');
          reject(new Error((res.data && res.data.error) || '接口暂时不可用'));
        }
      },
      fail() { reject(new Error('无法连接服务器，请检查网络和合法域名配置')); }
    });
  });
}
let sessionPending;
async function session() {
  const existing = wx.getStorageSync('biocity-demo-token');
  if (existing) return existing;
  if (!sessionPending) sessionPending = (async () => {
    const result = await new Promise((resolve, reject) => wx.showModal({
      title: '连接比赛演示服务', content: '请输入组织者提供的演示访问码', editable: true,
      success: res => res.confirm ? resolve(res.content || '') : reject(new Error('已取消连接')),
      fail: reject
    }));
    const response = await request('/api/session', 'POST', { accessCode: result });
    wx.setStorageSync('biocity-demo-token', response.token);
    return response.token;
  })().finally(() => { sessionPending = null; });
  return sessionPending;
}
async function getView(start, days) {
  if (config.mode === 'local') return domain.view(localState(), start, days);
  return request('/api/view?start=' + encodeURIComponent(start || '2026-11-02') + '&days=' + (days || 3), 'GET', undefined, await session());
}
async function action(name, payload) {
  if (config.mode === 'local') {
    const current = name === 'reset' ? domain.seed() : localState();
    const next = domain.migrate(domain.apply(current, name, payload));
    wx.setStorageSync(config.storageKey, next);
    return domain.view(next);
  }
  return request('/api/action', 'POST', { action: name, payload: payload || {} }, await session());
}
function error(err) { wx.showModal({ title: '操作提示', content: err.message || '操作失败，请重试', showCancel: false }); }
module.exports = { getView, action, error, mode: config.mode };
