/**
 * Migration.gs : CHUYỂN DỮ LIỆU TỪ APPSHEET SANG (chạy 1 lần)
 *
 * Cách dùng:
 *  1. Điền SOURCE_SHEET_ID = ID Google Sheet đang làm nguồn cho AppSheet
 *     (đoạn giữa /d/ và /edit trong link Sheet).
 *     Nếu chỉ có file Excel: tải lên Drive -> mở bằng Google Sheets -> Tệp -> Lưu dưới dạng Google Sheets.
 *  2. IMAGE_FOLDER_ID = thư mục chứa các thư mục Vehicle_Images, Paper_Images, Task_Images…
 *  3. Chạy hàm chuyenDuLieuAppSheet. Xem kết quả ở Nhật ký thực thi (Execution log).
 *
 *  - Ảnh KHÔNG bị di chuyển/sao chép: app trỏ thẳng tới file ảnh cũ, AppSheet vẫn chạy song song được.
 *  - Chạy lại sẽ GHI ĐÈ dữ liệu thiết bị/giấy tờ/linh kiện/sửa chữa (phải đặt OVERWRITE = true).
 */
const MIGRATE = {
  SOURCE_SHEET_ID: 'DAN_ID_GOOGLE_SHEET_APPSHEET_VAO_DAY',
  IMAGE_FOLDER_ID: '1dUdpwyEP7EQTGJmTC9T8_cfPokAkR2mZ',
  OVERWRITE: false
};

function chuyenDuLieuAppSheet() {
  if (/DAN_ID/.test(MIGRATE.SOURCE_SHEET_ID)) throw new Error('Chưa điền SOURCE_SHEET_ID trong Migration.gs');
  Db.reset();
  if (Db.all('ThietBi').length && !MIGRATE.OVERWRITE) {
    throw new Error('Đã có dữ liệu thiết bị. Muốn chuyển lại, đặt MIGRATE.OVERWRITE = true rồi chạy lại.');
  }

  // 1. Đọc dữ liệu nguồn
  const src = SpreadsheetApp.openById(MIGRATE.SOURCE_SHEET_ID);
  const tables = {};
  ['Vehicle', 'InfoVehicle', 'Acquy', 'Tires', 'Task', 'Paper', 'Document', 'User'].forEach(function (n) {
    const sh = src.getSheetByName(n);
    tables[n] = sh ? sh.getDataRange().getValues() : [];
  });

  // 2. Lập chỉ mục file ảnh: "Vehicle_Images/CT1.Photo.063509.jpg" -> fileId
  const index = {};
  function walk(folder, prefix, depth) {
    const files = folder.getFiles();
    while (files.hasNext()) {
      const f = files.next();
      index[prefix + f.getName()] = f.getId();
      if (!index[f.getName()]) index[f.getName()] = f.getId();
    }
    if (depth <= 0) return;
    const subs = folder.getFolders();
    while (subs.hasNext()) { const s = subs.next(); walk(s, s.getName() + '/', depth - 1); }
  }
  walk(DriveApp.getFolderById(MIGRATE.IMAGE_FOLDER_ID), '', 3);

  // 3. Chuyển đổi + làm sạch
  const me = Session.getEffectiveUser().getEmail().toLowerCase();
  const r = transformAppSheet_(tables, index, me);

  // 4. Ghi
  ['DM_LoaiTB', 'ThietBi', 'GiayTo', 'LinhKien', 'SuaChua', 'TaiLieu'].forEach(function (t) {
    Db.clear(t);
    Db.insertMany(t, r[t]);
  });
  const have = {};
  Db.all('NguoiDung').forEach(function (u) { have[String(u.Email).toLowerCase()] = 1; });
  // Admin do setup() tạo tạm tên "Quản trị" -> lấy họ tên thật từ AppSheet
  r.NguoiDung.forEach(function (nu) {
    const cur = Auth.userByEmail(nu.Email);
    if (cur && (!cur.HoTen || cur.HoTen === 'Quản trị') && nu.HoTen) Db.update('NguoiDung', 'ID', cur.ID, { HoTen: nu.HoTen });
  });
  Db.insertMany('NguoiDung', r.NguoiDung.filter(function (u) { return !have[u.Email]; }));

  const msg = [
    'HOÀN TẤT CHUYỂN DỮ LIỆU',
    'Thiết bị: ' + r.ThietBi.length + ' | Loại TB: ' + r.DM_LoaiTB.length,
    'Giấy tờ: ' + r.GiayTo.length + ' (gộp từ ' + r.stats.paperRows + ' dòng ảnh)',
    'Linh kiện: ' + r.LinhKien.length + ' | Phiếu sửa chữa: ' + r.SuaChua.length + ' | Tài liệu: ' + r.TaiLieu.length,
    'Người dùng mới: ' + r.NguoiDung.filter(function (u) { return !have[u.Email]; }).length,
    'Ảnh tìm thấy: ' + r.stats.imgFound + '/' + r.stats.imgTotal,
    r.warnings.length ? 'CẢNH BÁO:\n - ' + r.warnings.join('\n - ') : 'Không có cảnh báo'
  ].join('\n');
  console.log(msg);
  return msg;
}

/**
 * Hàm chuyển đổi thuần (không gọi dịch vụ Google) -> dễ kiểm thử.
 * tables: { TênSheet: [[header...], [row...]] } ; fileIndex: {đường dẫn: fileId}
 */
function transformAppSheet_(tables, fileIndex, ownerEmail) {
  const warnings = [];
  const stats = { imgTotal: 0, imgFound: 0, paperRows: 0 };

  function objs(rows) {
    if (!rows || rows.length < 2) return [];
    const head = rows[0].map(function (h) { return String(h || '').trim(); });
    return rows.slice(1).filter(function (r) { return r.some(function (c) { return c !== '' && c !== null; }); })
      .map(function (r) { const o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); o._raw = r; return o; });
  }
  function s(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(v);
    return String(v).replace(/\s+/g, ' ').trim();
  }
  function n(v) { if (v === '' || v === null || v === undefined) return ''; const x = Number(v); return isNaN(x) ? '' : x; }
  function d(v) { return (v && Object.prototype.toString.call(v) === '[object Date]') ? v : parseDate_(v); }
  function img(path, ctx) {
    path = s(path);
    if (!path) return '';
    stats.imgTotal++;
    const base = path.split('/').pop();
    const id = fileIndex[path] || fileIndex[base] || '';
    if (id) stats.imgFound++; else warnings.push('Không thấy ảnh "' + path + '" (' + ctx + ')');
    return id;
  }

  // --- Người dùng
  const usersSrc = objs(tables.User);
  const userById = {};
  const NguoiDung = usersSrc.map(function (u) {
    const email = s(u.Email).toLowerCase();
    userById[s(u.ID)] = email;
    const role = ROLES_ALL.indexOf(s(u.Role)) >= 0 ? s(u.Role) : ROLE.LX;
    return { ID: s(u.ID) || newId_(), Email: email, HoTen: s(u.Name), VaiTro: role, XeDuocGiao: '', KichHoat: true, GhiChu: 'Chuyển từ AppSheet' };
  }).filter(function (u) { return u.Email; });
  function who(v) { v = s(v); return userById[v] || v.toLowerCase(); }

  // --- Thiết bị (+ gộp InfoVehicle)
  const info = {};
  objs(tables.InfoVehicle).forEach(function (x) { if (s(x.VehicleID)) info[s(x.VehicleID)] = x; });
  const ThietBi = [];
  const seen = {};
  objs(tables.Vehicle).forEach(function (v) {
    const ma = s(v.VehicleID);
    if (!ma) return;
    if (seen[ma]) { warnings.push('Trùng mã xe ' + ma + ' (bỏ dòng sau)'); return; }
    seen[ma] = 1;
    const i = info[ma] || {};
    ThietBi.push({
      MaTB: ma, Module: 'PTTBMD', TenTB: s(v['Tên xe']), LoaiTB: s(v['Loại xe']), NhanHieu: s(v['Nhãn hiệu']),
      NuocSX: s(v['Nước sản xuất']), BienSo: s(v['Biển số xe']), NamSX: n(v['Năm sản xuất']), NamSD: n(v['Năm sử dụng']),
      Serial: s(v.Serial), SoMay: s(i['Số máy']), SoKhung: s(i['Số khung']), Dai: n(i['Dài (mm)']), Rong: n(i['Rộng (mm)']),
      Cao: n(i['Cao (mm)']), KhoiLuong: n(i['Khối lượng (kg)']), TaiTrongCongSuat: s(i['Tải trọng / Công suất']),
      ThongTinKhac: s(i['Thông tin khác']), TrangThai: 'Bình thường', ChiSo: '', AnhID: img(v.Photo, 'xe ' + ma),
      GhiChu: '', NgayCapNhat: new Date(), NguoiCapNhat: ownerEmail
    });
  });
  Object.keys(info).forEach(function (k) { if (!seen[k]) warnings.push('Thông số của mã ' + k + ' không có xe tương ứng'); });

  // --- Danh mục loại thiết bị
  const loai = {};
  ThietBi.forEach(function (e) {
    if (!e.LoaiTB) { e.LoaiTB = 'Khác'; warnings.push('Xe ' + e.MaTB + ' chưa có loại -> "Khác"'); }
    const L = loai[e.LoaiTB] || (loai[e.LoaiTB] = { road: 0, n: 0 });
    L.n++;
    if (/^\d{2}[A-Z]/.test(e.BienSo)) L.road++;
  });
  const DM_LoaiTB = Object.keys(loai).sort(function (a, b) { return a.localeCompare(b, 'vi'); }).map(function (k, idx) {
    const road = loai[k].road > 0;
    return { TenLoai: k, Module: 'PTTBMD', Nhom: road ? 'Phương tiện giao thông' : 'TTB mặt đất (khu bay)',
      DonViDo: road ? 'km' : 'giờ máy', ThuTu: idx + 1 };
  });

  // --- Giấy tờ: gộp các dòng ảnh của cùng 1 giấy (cùng xe + cùng ngày hết hạn)
  function docType(t) {
    t = s(t).toLowerCase();
    if (!t) return '';
    if (t.indexOf('bảo hiểm') >= 0) return 'Bảo hiểm';
    if (t.indexOf('đăng kiểm') >= 0 || t.indexOf('kiểm định') >= 0) return 'Kiểm định';
    return s(t);
  }
  const groups = {};
  const order = [];
  objs(tables.Paper).forEach(function (p) {
    stats.paperRows++;
    const ma = s(p.VehicleID);
    const han = d(p['Ngày hết hạn']);
    const key = ma + '|' + (han ? fmtDate_(han) : 'x');
    if (!groups[key]) { groups[key] = { ma: ma, han: han, types: [], files: [] }; order.push(key); }
    const t = docType(p['Loại giấy tờ']);
    if (t) groups[key].types.push(t);
    const f = img(p.Photo, 'giấy tờ xe ' + ma);
    if (f) groups[key].files.push(f);
  });
  const GiayTo = [];
  order.forEach(function (k) {
    const g = groups[k];
    if (!seen[g.ma]) { warnings.push('Giấy tờ của mã ' + g.ma + ' không có xe tương ứng'); return; }
    const types = g.types.filter(function (t, i, a) { return a.indexOf(t) === i; });
    let type = types[0];
    if (!type) { type = 'Kiểm định'; warnings.push('Giấy tờ xe ' + g.ma + ' (hết hạn ' + (g.han ? fmtDate_(g.han) : '?') + ') không ghi loại -> "Kiểm định"'); }
    if (types.length > 1) warnings.push('Xe ' + g.ma + ': cùng ngày hết hạn nhưng nhiều loại giấy (' + types.join(', ') + ') -> gộp vào ' + type);
    if (!g.han) warnings.push('Giấy tờ xe ' + g.ma + ' thiếu ngày hết hạn');
    GiayTo.push({ ID: newId_(), MaTB: g.ma, LoaiGiayTo: type, SoGiay: '', NgayCap: '', NgayHetHan: g.han || '',
      FileIDs: g.files.join(','), GhiChu: 'Chuyển từ AppSheet', NgayTao: new Date(), NguoiTao: ownerEmail });
  });

  // --- Linh kiện: Ắc quy + Lốp
  const LinhKien = [];
  objs(tables.Acquy).forEach(function (a) {
    if (!seen[s(a.VehicleID)]) return;
    LinhKien.push({ ID: newId_(), MaTB: s(a.VehicleID), Loai: 'Ắc quy', ViTri: '', QuyCach: s(a['Loại Acquy']),
      SoLuong: n(a['Số lượng']) || 1, NgayThay: d(a['Ngày thay']) || '', GhiChu: s(a['Ghi chú']) });
  });
  objs(tables.Tires).forEach(function (t) {
    if (!seen[s(t.VehicleID)]) return;
    LinhKien.push({ ID: newId_(), MaTB: s(t.VehicleID), Loai: 'Lốp', ViTri: s(t['Type Tires']), QuyCach: s(t['Code Tires']),
      SoLuong: n(t['Số lượng']) || 1, NgayThay: d(t['Ngày thay']) || '', GhiChu: s(t['Ghi chú']) });
  });

  // --- Sửa chữa (sửa lỗi lệch cột của sheet Task)
  const taskRows = tables.Task && tables.Task.length ? tables.Task : [];
  const SuaChua = [];
  if (taskRows.length > 1) {
    const head = taskRows[0].map(function (h) { return String(h || '').trim(); });
    const iLoai = head.indexOf('Loại công việc');
    taskRows.slice(1).forEach(function (raw) {
      if (!raw.some(function (c) { return c !== '' && c !== null; })) return;
      let row = raw.slice();
      // Lệch cột: ô "Loại công việc" lại chứa ID người dùng -> dịch phải 1 ô
      if (iLoai >= 0 && userById[s(row[iLoai])]) {
        row = row.slice(0, iLoai).concat(['']).concat(row.slice(iLoai, row.length - 1));
        warnings.push('Phiếu ' + s(row[0]) + ': đã sửa lỗi lệch cột');
      }
      const o = {};
      head.forEach(function (h, i) { o[h] = row[i]; });
      const ma = s(o.VehicleID);
      const ngayXong = d(o['Ngày khắc phục']);
      const tienDo = s(o['Tiến độ công việc']).toLowerCase();
      const done = !!ngayXong || tienDo.indexOf('hoàn thành') >= 0 || tienDo.indexOf('xong') >= 0;
      SuaChua.push({
        ID: s(o.TaskID) || newId_(), SoPhieu: '', MaTB: ma, LoaiCV: s(o['Loại công việc']) || 'Hỏng đột xuất',
        NguoiBao: who(o['Người báo hỏng']), NgayBao: d(o['Ngày tạo']) || new Date(), MoTa: s(o['Nội dung cần sửa chữa']),
        AnhTruoc: img(o['Hình ảnh'], 'phiếu ' + s(o.TaskID)), DungXe: false, KTV: who(o['Người kiểm tra']),
        NgayTiepNhan: '', NoiDungKhacPhuc: s(o['Nội dung khắc phục']), LinhKienThay: '', AnhSau: '',
        NgayXong: ngayXong || '', NguoiNghiemThu: '', NgayNghiemThu: '',
        TrangThai: done ? 'Hoàn thành' : 'Đang sửa', GhiChu: s(o['Tiến độ công việc'])
      });
    });
  }
  SuaChua.sort(function (a, b) { return a.NgayBao - b.NgayBao; });
  const cnt = {};
  SuaChua.forEach(function (r) {
    const y = r.NgayBao.getFullYear();
    cnt[y] = (cnt[y] || 0) + 1;
    r.SoPhieu = APP.REPAIR_PREFIX + '-' + y + '-' + ('000' + cnt[y]).slice(-4);
  });

  // --- Tài liệu
  const TaiLieu = objs(tables.Document).filter(function (x) { return s(x.VehicleID) && s(x.Document); }).map(function (x) {
    return { ID: newId_(), MaTB: s(x.VehicleID), TenTaiLieu: s(x.Document).split('/').pop(),
      FileID: img(x.Document, 'tài liệu ' + s(x.VehicleID)), MimeType: '', NgayTao: new Date(), NguoiTao: ownerEmail };
  }).filter(function (x) { return x.FileID; });

  return { NguoiDung: NguoiDung, ThietBi: ThietBi, DM_LoaiTB: DM_LoaiTB, GiayTo: GiayTo, LinhKien: LinhKien,
    SuaChua: SuaChua, TaiLieu: TaiLieu, warnings: warnings, stats: stats };
}
