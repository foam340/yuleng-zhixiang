// 模拟订单只存在当前设备，分享入口统一回到首页，不携带订单或身份参数。
function shareAppMessage() {
  return {
    title: '渝冷智享，让冷库与运力共享更高效',
    path: '/pages/home/index',
    imageUrl: '/assets/brand/share-cover.jpg'
  };
}
module.exports = { shareAppMessage };
