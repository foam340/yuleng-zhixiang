const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

test('小程序页面控制器完成旺季案例、供给方响应和订单入库流程', async () => {
  const storage = new Map();
  const errors = [];
  global.wx = {
    getStorageSync: key => storage.get(key),
    setStorageSync: (key, value) => storage.set(key, JSON.parse(JSON.stringify(value))),
    showToast() {},
    showModal: options => errors.push(options.content),
    navigateTo() {}, switchTab() {}
  };
  function page(name) {
    let definition;
    global.Page = value => { definition = value; };
    require(path.join('../miniprogram/pages', name, 'index.js'));
    return Object.assign({}, definition, { data: JSON.parse(JSON.stringify(definition.data)), setData(update) { Object.assign(this.data, update); } });
  }
  const home = page('home');
  await home.refresh();
  assert.equal(home.data.availableCold, 500);
  await home.runCase();
  assert.equal(home.data.orders.length, 6);
  assert.equal(home.data.availableCold, 0);
  const detail = page('detail');
  detail.onLoad({ id: home.data.orders.find(o => o.enterpriseId === 'ji').id });
  await detail.refresh();
  assert.equal(detail.data.own, false);
  await detail.openSupply();
  const profile = page('profile');
  await profile.refresh();
  assert.equal(profile.data.selected.id, 'jia');
  const orders = page('orders');
  await orders.refresh();
  assert.equal(orders.data.supportRequests.length, 1);
  const support = orders.data.supportRequests[0];
  await orders.accept({ currentTarget: { dataset: { id: support.id, resource: 'E' } } });
  await detail.switchCompany();
  await detail.refresh();
  assert.equal(detail.data.own, true);
  assert.equal(detail.data.selected.id, 'ji');
  assert.equal(detail.data.o.allocated, 120);
  await detail.act('confirm');
  await detail.act('checkIn', { code: support.id });
  assert.equal(detail.data.o.status, 'stored');
  assert.equal(detail.data.monitoring, true);
  assert.equal(errors.length, 0);
  delete global.wx;
  delete global.Page;
});
