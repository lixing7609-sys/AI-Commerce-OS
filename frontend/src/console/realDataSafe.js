/**
 * 真实数据的失败安全包装——沿用 operator-preview/helpers/realDataApi.js
 * 已经验证过的模式：任何真实 API 调用失败都不抛出、不崩溃页面，
 * 退化为 {connected:false, data:null}，调用方据此展示"尚未接入"
 * 而不是报错界面。
 */
export async function safeCall(fetcher) {
  try {
    const data = await fetcher();
    return { connected: true, data, error: null };
  } catch (error) {
    return { connected: false, data: null, error };
  }
}
