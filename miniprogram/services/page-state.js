async function load(page, fetchModel) {
  page.setData({ loading: true, loadError: '' });
  try {
    const result = await fetchModel();
    page.setData({ ready: true, loading: false, loadError: '' });
    return result;
  } catch (error) {
    page.setData({ loading: false, loadError: error.message || '加载失败，请稍后重试' });
    return null;
  } finally {
    if (wx.stopPullDownRefresh) wx.stopPullDownRefresh();
  }
}
module.exports = { load };
