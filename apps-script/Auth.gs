/**
 * Auth.gs : Đăng nhập bằng mã OTP gửi qua email.
 *
 * Vì sao không dùng đăng nhập Google trực tiếp?
 *  Web App chạy "Execute as: Me" (để người dùng không cần quyền trên Sheet/Drive),
 *  khi đó Google KHÔNG cho biết email của người dùng Gmail cá nhân.
 *  => Tự xác thực: nhập email trong danh sách NguoiDung -> nhận mã 6 số -> dùng 30 ngày.
 */
const Auth = (function () {
  function norm(email) { return String(email || '').trim().toLowerCase(); }

  function userByEmail(email) {
    const e = norm(email);
    return Db.all('NguoiDung').find(function (u) { return norm(u.Email) === e; }) || null;
  }

  function isActive(u) { return u && u.KichHoat !== false && u.KichHoat !== 'FALSE'; }

  function requestOtp(email) {
    const e = norm(email);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new Error('Email không hợp lệ');
    const u = userByEmail(e);
    if (!isActive(u)) throw new Error('Email này chưa được cấp quyền. Liên hệ Admin Phòng KTHT.');
    const cache = CacheService.getScriptCache();
    if (cache.get('otpcool_' + e)) throw new Error('Vừa gửi mã, vui lòng đợi 60 giây rồi thử lại.');
    const code = String(Math.floor(100000 + Math.random() * 900000));
    cache.put('otp_' + e, JSON.stringify({ code: code, tries: 0 }), APP.OTP_MINUTES * 60);
    cache.put('otpcool_' + e, '1', 60);
    MailApp.sendEmail({
      to: e,
      subject: 'Mã đăng nhập ' + APP.NAME + ': ' + code,
      htmlBody: '<div style="font-family:Arial,sans-serif;font-size:15px">' +
        'Xin chào ' + (u.HoTen || '') + ',<br><br>Mã đăng nhập của bạn là:<br>' +
        '<div style="font-size:32px;font-weight:bold;letter-spacing:6px;margin:12px 0;color:#0b4f8a">' + code + '</div>' +
        'Mã có hiệu lực ' + APP.OTP_MINUTES + ' phút. Nếu bạn không yêu cầu, hãy bỏ qua email này.<br><br>' +
        '<span style="color:#888">' + APP.ORG + '</span></div>',
      name: APP.NAME
    });
    return { ok: true };
  }

  function verifyOtp(email, code) {
    const e = norm(email);
    const cache = CacheService.getScriptCache();
    const raw = cache.get('otp_' + e);
    if (!raw) throw new Error('Mã đã hết hạn, hãy gửi lại mã mới.');
    const st = JSON.parse(raw);
    if (st.tries >= 5) { cache.remove('otp_' + e); throw new Error('Nhập sai quá 5 lần, hãy gửi lại mã mới.'); }
    if (String(code).trim() !== st.code) {
      st.tries++;
      cache.put('otp_' + e, JSON.stringify(st), APP.OTP_MINUTES * 60);
      throw new Error('Mã không đúng (còn ' + (5 - st.tries) + ' lần thử).');
    }
    cache.remove('otp_' + e);
    const u = userByEmail(e);
    if (!isActive(u)) throw new Error('Tài khoản đã bị khoá.');
    const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const exp = Date.now() + APP.SESSION_DAYS * 86400000;
    PropertiesService.getScriptProperties().setProperty('sess_' + token, JSON.stringify({ email: e, exp: exp }));
    log_(e, 'Đăng nhập', 'NguoiDung', u.ID, '');
    return { token: token };
  }

  /** Kiểm tra token, trả về user (object NguoiDung) */
  function check(token) {
    if (!token) throw authErr_('Chưa đăng nhập');
    const props = PropertiesService.getScriptProperties();
    const raw = props.getProperty('sess_' + token);
    if (!raw) throw authErr_('Phiên đăng nhập đã hết, vui lòng đăng nhập lại');
    const s = JSON.parse(raw);
    if (s.exp < Date.now()) { props.deleteProperty('sess_' + token); throw authErr_('Phiên đăng nhập đã hết hạn'); }
    const u = userByEmail(s.email);
    if (!isActive(u)) { props.deleteProperty('sess_' + token); throw authErr_('Tài khoản đã bị khoá'); }
    return u;
  }

  function logout(token) {
    if (token) PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
    return { ok: true };
  }

  /** Dọn phiên hết hạn (trigger chạy hằng ngày, setup() tự cài) */
  function cleanup() {
    const props = PropertiesService.getScriptProperties();
    const all = props.getProperties();
    let n = 0;
    Object.keys(all).forEach(function (k) {
      if (k.indexOf('sess_') !== 0) return;
      try { if (JSON.parse(all[k]).exp < Date.now()) { props.deleteProperty(k); n++; } }
      catch (e) { props.deleteProperty(k); n++; }
    });
    return n;
  }

  function authErr_(msg) { const e = new Error(msg); e.name = 'AuthError'; return e; }

  return { requestOtp: requestOtp, verifyOtp: verifyOtp, check: check, logout: logout, cleanup: cleanup,
    userByEmail: userByEmail, norm: norm };
})();

function cleanupSessions() { return Auth.cleanup(); }

/** Ghi nhật ký hệ thống (không làm hỏng thao tác chính nếu lỗi) */
function log_(email, action, table, key, detail) {
  try {
    Db.insert('NhatKyHeThong', {
      ThoiGian: new Date(), Email: email, HanhDong: action, Bang: table, KhoaID: key,
      ChiTiet: typeof detail === 'string' ? detail : JSON.stringify(detail).slice(0, 2000)
    });
  } catch (e) { /* bỏ qua */ }
}
