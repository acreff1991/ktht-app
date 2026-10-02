/**
 * Rest.gs : CỔNG API cho bản cài trên điện thoại (GitHub Pages / PWA)
 *
 * Giao diện trên GitHub gửi POST tới link /exec với nội dung {"fn": "...", "args": [...]}
 * -> gọi đúng các hàm như bản chạy trong Apps Script -> trả JSON.
 * Gửi dạng text/plain nên trình duyệt không chặn CORS.
 */
function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const FNS = { login_request: login_request, login_verify: login_verify, logout: logout, api: api };
    const f = FNS[req.fn];
    if (!f) throw new Error('Thao tác không được hỗ trợ: ' + req.fn);
    out = f.apply(null, req.args || []);
  } catch (err) {
    out = JSON.stringify({ ok: false, error: String((err && err.message) || err) });
  }
  return ContentService.createTextOutput(out).setMimeType(ContentService.MimeType.JSON);
}

/** Link mở app dùng trong email (đặt Script Property APP_URL = link GitHub Pages) */
function appUrl_() {
  return prop_('APP_URL') || ScriptApp.getService().getUrl();
}
