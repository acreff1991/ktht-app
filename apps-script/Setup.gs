/**
 * Setup.gs : Khởi tạo hệ thống + cảnh báo tự động.
 *
 * CHẠY 1 LẦN: chọn hàm setup -> Run. Chạy lại bao nhiêu lần cũng được:
 * chỉ tạo phần còn thiếu, không xoá dữ liệu.
 */
function setup() {
  const logs = [];
  const props = PropertiesService.getScriptProperties();

  // 1. Thư mục gốc lưu file
  let root;
  const rootId = props.getProperty('ROOT_FOLDER_ID');
  if (rootId) root = DriveApp.getFolderById(rootId);
  else {
    root = DriveApp.createFolder(APP.ROOT_FOLDER_NAME);
    props.setProperty('ROOT_FOLDER_ID', root.getId());
    logs.push('Đã tạo thư mục "' + APP.ROOT_FOLDER_NAME + '"');
  }

  // 2. Google Sheet dữ liệu
  let ss;
  const dbId = props.getProperty('DB_ID');
  if (dbId) ss = SpreadsheetApp.openById(dbId);
  else {
    ss = SpreadsheetApp.create(APP.DB_NAME);
    props.setProperty('DB_ID', ss.getId());
    try { DriveApp.getFileById(ss.getId()).moveTo(root); } catch (e) { /* bỏ qua */ }
    logs.push('Đã tạo Google Sheet "' + APP.DB_NAME + '"');
  }
  ss.setSpreadsheetTimeZone(APP.TZ);

  // 3. Các bảng + cột
  Object.keys(SCHEMA).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) { sh = ss.insertSheet(name); logs.push('Tạo bảng ' + name); }
    const want = SCHEMA[name].cols;
    const lastCol = sh.getLastColumn();
    const have = lastCol ? sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String) : [];
    const missing = want.filter(function (c) { return have.indexOf(c) < 0; });
    if (missing.length) {
      sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
      logs.push(name + ': thêm cột ' + missing.join(', '));
    }
    const head = have.concat(missing);
    sh.getRange(1, 1, 1, head.length).setFontWeight('bold').setBackground('#0b4f8a').setFontColor('#ffffff');
    sh.setFrozenRows(1);
    const rows = Math.max(sh.getMaxRows() - 1, 1);
    head.forEach(function (c, i) {
      const rg = sh.getRange(2, i + 1, rows, 1);
      if (DATE_COLS.indexOf(c) >= 0) rg.setNumberFormat('dd/MM/yyyy');
      else if (DATETIME_COLS.indexOf(c) >= 0) rg.setNumberFormat('dd/MM/yyyy HH:mm');
      else if (NUMBER_COLS.indexOf(c) >= 0 || BOOL_COLS.indexOf(c) >= 0) { /* giữ mặc định */ }
      else rg.setNumberFormat('@');   // dạng chữ: giữ số 0 đầu (số máy, số khung, số giấy…)
    });
  });

  // Xoá sheet trống mặc định
  ss.getSheets().forEach(function (sh) {
    if (!SCHEMA[sh.getName()] && sh.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(sh);
  });

  Db.reset();

  // 4. Danh mục mặc định
  if (!Db.all('DM_GiayTo').length) { Db.insertMany('DM_GiayTo', SEED.DM_GiayTo); logs.push('Nạp danh mục giấy tờ'); }

  // 5. Người chạy setup là Admin
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  if (me && !Auth.userByEmail(me)) {
    Db.insert('NguoiDung', { ID: newId_(), Email: me, HoTen: 'Quản trị', VaiTro: ROLE.ADMIN, KichHoat: true });
    logs.push('Thêm Admin: ' + me);
  }

  // 6. Trigger tự động
  const have = ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction(); });
  if (have.indexOf('cleanupSessions') < 0) {
    ScriptApp.newTrigger('cleanupSessions').timeBased().everyDays(1).atHour(2).create();
    logs.push('Cài trigger dọn phiên đăng nhập (2h sáng)');
  }
  if (have.indexOf('guiCanhBaoHangNgay') < 0) {
    ScriptApp.newTrigger('guiCanhBaoHangNgay').timeBased().everyDays(1).atHour(7).create();
    logs.push('Cài trigger email cảnh báo giấy tờ (7h sáng)');
  }

  logs.push('Sheet dữ liệu: ' + ss.getUrl());
  logs.push('Thư mục file: ' + root.getUrl());
  const msg = logs.join('\n');
  console.log(msg);
  return msg;
}

/**
 * Email cảnh báo giấy tờ (trigger 7h sáng).
 * Không gửi hằng ngày cho đỡ phiền: chỉ gửi khi có giấy tờ chạm mốc
 * còn 30/15/7/3/1/0 ngày hoặc vừa quá hạn, và gửi bản tổng hợp mỗi thứ Hai.
 */
function guiCanhBaoHangNgay() {
  Db.reset();
  const sysUser = { VaiTro: ROLE.ADMIN };
  const list = listEquipment_(sysUser).filter(function (e) { return e.TrangThai !== 'Thanh lý'; });
  const MOC = [30, 15, 7, 3, 1, 0, -1];
  const rows = [];
  let trigger = new Date().getDay() === 1;  // thứ Hai
  list.forEach(function (e) {
    e.docs.forEach(function (d) {
      if (d.state !== 'expired' && d.state !== 'warning') return;
      if (MOC.indexOf(d.days) >= 0) trigger = true;
      rows.push({ e: e, d: d });
    });
  });
  if (!rows.length || !trigger) return 'Không gửi';
  rows.sort(function (a, b) { return a.d.days - b.d.days; });
  const html = '<div style="font-family:Arial,sans-serif;font-size:14px"><b>Giấy tờ phương tiện cần xử lý</b><br><br>' +
    '<table cellpadding="6" style="border-collapse:collapse;border:1px solid #ddd">' +
    '<tr style="background:#0b4f8a;color:#fff"><th>Thiết bị</th><th>Biển số</th><th>Giấy tờ</th><th>Hết hạn</th><th>Tình trạng</th></tr>' +
    rows.map(function (r) {
      const color = r.d.days < 0 ? '#c62828' : '#e65100';
      const txt = r.d.days < 0 ? 'Quá hạn ' + (-r.d.days) + ' ngày' : r.d.days === 0 ? 'Hết hạn hôm nay' : 'Còn ' + r.d.days + ' ngày';
      const h = r.d.han.split('-').reverse().join('/');
      return '<tr style="border-top:1px solid #ddd"><td>' + r.e.TenTB + '</td><td>' + (r.e.BienSo || '') + '</td><td>' +
        r.d.loai + '</td><td>' + h + '</td><td style="color:' + color + ';font-weight:bold">' + txt + '</td></tr>';
    }).join('') + '</table><br><a href="' + appUrl_() + '">Mở ứng dụng</a></div>';
  const to = Db.all('NguoiDung').filter(function (u) {
    return ROLES_TECH.indexOf(u.VaiTro) >= 0 && u.KichHoat !== false;
  }).map(function (u) { return u.Email; });
  if (!to.length) return 'Không có người nhận';
  MailApp.sendEmail({ to: to.join(','), subject: '[KTHT] ' + rows.length + ' giấy tờ phương tiện sắp/đã hết hạn', htmlBody: html, name: APP.NAME });
  return 'Đã gửi ' + rows.length + ' dòng tới ' + to.length + ' người';
}
