/**
 * Api.gs : Điểm vào Web App + toàn bộ nghiệp vụ.
 * Giao diện gọi: api(token, 'tenThaoTac', duLieu)  -> chuỗi JSON {ok, data | error}
 */

function doGet() {
  // Bản PWA (GitHub) không cần các file HTML trong Apps Script -> chuyển hướng sang link app
  try { HtmlService.createHtmlOutputFromFile('Index'); }
  catch (e) {
    const u = prop_('APP_URL');
    return HtmlService.createHtmlOutput(u
      ? '<p style="font-family:sans-serif">Ứng dụng đã chuyển sang: <a href="' + u + '" target="_top">' + u + '</a></p>'
      : '<p style="font-family:sans-serif">Máy chủ KTHT đang chạy.</p>');
  }
  return HtmlService.createTemplateFromFile('Index').evaluate()
    .setTitle(APP.NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes');
}

function include(name) { return HtmlService.createHtmlOutputFromFile(name).getContent(); }

/* ---------------- Đăng nhập (chưa có token) ---------------- */
function login_request(email) { return wrap_(function () { return Auth.requestOtp(email); }); }
function login_verify(email, code) { return wrap_(function () { return Auth.verifyOtp(email, code); }); }
function logout(token) { return wrap_(function () { return Auth.logout(token); }); }

/* ---------------- Cổng API chung ---------------- */
function api(token, action, payload) {
  return wrap_(function () {
    Db.reset();
    const user = Auth.check(token);
    const def = ACTIONS[action];
    if (!def) throw new Error('Thao tác không hợp lệ: ' + action);
    if (def.roles && def.roles.indexOf(user.VaiTro) < 0) throw new Error('Bạn không có quyền thực hiện thao tác này');
    if (def.write) {
      const lock = LockService.getScriptLock();
      lock.waitLock(20000);
      try { return def.run(payload || {}, user); } finally { lock.releaseLock(); }
    }
    return def.run(payload || {}, user);
  });
}

function wrap_(fn) {
  try { return JSON.stringify({ ok: true, data: fn() }); }
  catch (e) {
    console.error(e && e.stack || e);
    return JSON.stringify({ ok: false, error: String(e && e.message || e), auth: e && e.name === 'AuthError' });
  }
}

/* ======================================================================
 *  DANH SÁCH THAO TÁC  (roles: ai được gọi; write: cần khoá ghi)
 * ==================================================================== */
const ACTIONS = {
  bootstrap:       { run: bootstrap_ },
  listEquipment:   { run: function (p, u) { return listEquipment_(u); } },
  getEquipment:    { run: getEquipment_ },
  saveEquipment:   { run: saveEquipment_, roles: ROLES_TECH, write: true },
  deleteEquipment: { run: deleteEquipment_, roles: [ROLE.ADMIN], write: true },

  saveDoc:         { run: saveDoc_, roles: ROLES_TECH, write: true },
  deleteDoc:       { run: function (p, u) { return delChild_('GiayTo', p.ID, u); }, roles: ROLES_TECH, write: true },
  savePart:        { run: savePart_, roles: ROLES_TECH, write: true },
  deletePart:      { run: function (p, u) { return delChild_('LinhKien', p.ID, u); }, roles: ROLES_TECH, write: true },
  saveFileDoc:     { run: saveFileDoc_, roles: ROLES_TECH, write: true },
  deleteFileDoc:   { run: function (p, u) { return delChild_('TaiLieu', p.ID, u); }, roles: ROLES_TECH, write: true },

  listRepairs:     { run: listRepairs_ },
  getRepair:       { run: getRepair_ },
  createRepair:    { run: createRepair_, write: true },
  updateRepair:    { run: updateRepair_, roles: ROLES_TECH, write: true },

  upload:          { run: upload_ },
  thumbs:          { run: thumbs_ },
  fileFull:        { run: function (p) { checkFile_(p.id); return { url: Storage.full(p.id) }; } },
  fileLink:        { run: function (p) { checkFile_(p.id); return { url: Storage.link(p.id) }; } },

  listUsers:       { run: function () { return Db.all('NguoiDung').map(out_); }, roles: [ROLE.ADMIN] },
  saveUser:        { run: saveUser_, roles: [ROLE.ADMIN], write: true },
  deleteUser:      { run: deleteUser_, roles: [ROLE.ADMIN], write: true }
};

/* ---------------- Khởi động ---------------- */
function bootstrap_(p, u) {
  const users = Db.all('NguoiDung');
  return {
    user: publicUser_(u),
    app: { name: APP.NAME, org: APP.ORG },
    modules: MODULES,
    dm: {
      loaiTB: Db.all('DM_LoaiTB').map(out_).sort(byOrder_),
      giayTo: Db.all('DM_GiayTo').map(out_).sort(byOrder_),
      equipStatus: EQUIP_STATUS, repairStatus: REPAIR_STATUS, repairOpen: REPAIR_OPEN,
      repairTypes: REPAIR_TYPES, partTypes: PART_TYPES, roles: ROLES_ALL
    },
    names: users.reduce(function (m, x) { m[Auth.norm(x.Email)] = x.HoTen; return m; }, {}),
    equipment: listEquipment_(u),
    repairs: listRepairs_({ scope: 'open' }, u)
  };
}

function publicUser_(u) {
  return { ID: u.ID, Email: Auth.norm(u.Email), HoTen: u.HoTen, VaiTro: u.VaiTro, XeDuocGiao: splitIds_(u.XeDuocGiao) };
}

function byOrder_(a, b) { return (Number(a.ThuTu) || 999) - (Number(b.ThuTu) || 999); }

/* ---------------- Phân quyền theo xe ---------------- */
function canSee_(u, maTB) {
  if (u.VaiTro !== ROLE.LX) return true;
  const list = splitIds_(u.XeDuocGiao);
  return !list.length || list.indexOf(String(maTB)) >= 0;   // Lái xe chưa giao xe -> xem tất cả
}

/* ---------------- Giấy tờ: tính cảnh báo ---------------- */
function docSummary_(docs, dmGT, today) {
  return dmGT.map(function (dm) {
    let latest = null;
    docs.forEach(function (d) {
      if (d.LoaiGiayTo !== dm.LoaiGiayTo) return;
      const h = parseDate_(d.NgayHetHan);
      if (h && (!latest || h > latest)) latest = h;
    });
    if (!latest) return { loai: dm.LoaiGiayTo, state: 'missing', batBuoc: dm.BatBuoc !== false && dm.BatBuoc !== 'FALSE' };
    const days = daysBetween_(today, latest);
    const warn = Number(dm.CanhBaoTruoc) || APP.ALERT_DAYS_DEFAULT;
    return { loai: dm.LoaiGiayTo, han: fmtDate_(latest), days: days,
      state: days < 0 ? 'expired' : days <= warn ? 'warning' : 'ok' };
  });
}

function groupBy_(list, key) {
  return list.reduce(function (m, x) { (m[x[key]] = m[x[key]] || []).push(x); return m; }, {});
}

/* ---------------- Thiết bị ---------------- */
function listEquipment_(u) {
  const today = today_();
  const dmGT = Db.all('DM_GiayTo').slice().sort(byOrder_);
  const docs = groupBy_(Db.all('GiayTo'), 'MaTB');
  const openRep = groupBy_(Db.all('SuaChua').filter(function (r) { return REPAIR_OPEN.indexOf(r.TrangThai) >= 0; }), 'MaTB');
  const order = {};
  Db.all('DM_LoaiTB').forEach(function (l) { order[l.TenLoai] = Number(l.ThuTu) || 999; });
  return Db.all('ThietBi')
    .filter(function (e) { return canSee_(u, e.MaTB); })
    .map(function (e) {
      return {
        MaTB: e.MaTB, Module: e.Module, TenTB: e.TenTB, LoaiTB: e.LoaiTB, BienSo: e.BienSo, NhanHieu: e.NhanHieu,
        TrangThai: e.TrangThai || 'Bình thường', AnhID: e.AnhID,
        docs: docSummary_(docs[e.MaTB] || [], dmGT, today),
        openRepairs: (openRep[e.MaTB] || []).length
      };
    })
    .sort(function (a, b) {
      return ((order[a.LoaiTB] || 999) - (order[b.LoaiTB] || 999)) ||
        String(a.LoaiTB).localeCompare(String(b.LoaiTB), 'vi') ||
        String(a.BienSo || a.MaTB).localeCompare(String(b.BienSo || b.MaTB), 'vi', { numeric: true });
    });
}

function getEquipment_(p, u) {
  if (!canSee_(u, p.MaTB)) throw new Error('Bạn không được giao thiết bị này');
  const e = Db.find('ThietBi', 'MaTB', p.MaTB);
  if (!e) throw new Error('Không tìm thấy thiết bị ' + p.MaTB);
  const docs = Db.all('GiayTo').filter(function (d) { return d.MaTB === e.MaTB; });
  const dmGT = Db.all('DM_GiayTo').slice().sort(byOrder_);
  return {
    equipment: out_(e),
    docSummary: docSummary_(docs, dmGT, today_()),
    docs: docs.map(out_).sort(function (a, b) { return String(b.NgayHetHan).localeCompare(String(a.NgayHetHan)); }),
    parts: Db.all('LinhKien').filter(function (x) { return x.MaTB === e.MaTB; }).map(out_),
    repairs: Db.all('SuaChua').filter(function (x) { return x.MaTB === e.MaTB; }).map(out_)
      .sort(function (a, b) { return String(b.NgayBao).localeCompare(String(a.NgayBao)); }),
    files: Db.all('TaiLieu').filter(function (x) { return x.MaTB === e.MaTB; }).map(out_)
  };
}

function saveEquipment_(p, u) {
  const d = p.data || {};
  const ma = String(d.MaTB || '').trim();
  if (!/^[A-Za-z0-9_.-]{1,20}$/.test(ma)) throw new Error('Mã thiết bị chỉ gồm chữ không dấu, số, dấu - _ (tối đa 20 ký tự)');
  if (!String(d.TenTB || '').trim()) throw new Error('Chưa nhập tên thiết bị');
  const allowed = SCHEMA.ThietBi.cols.filter(function (c) { return ['NgayCapNhat', 'NguoiCapNhat'].indexOf(c) < 0; });
  const rec = {};
  allowed.forEach(function (c) { if (c in d) rec[c] = typeof d[c] === 'string' ? d[c].trim() : d[c]; });
  rec.NgayCapNhat = new Date();
  rec.NguoiCapNhat = Auth.norm(u.Email);
  const exists = Db.find('ThietBi', 'MaTB', ma);
  if (p.isNew) {
    if (u.VaiTro !== ROLE.ADMIN) throw new Error('Chỉ Admin được thêm thiết bị mới');
    if (exists) throw new Error('Mã thiết bị ' + ma + ' đã tồn tại');
    rec.Module = rec.Module || 'PTTBMD';
    rec.TrangThai = rec.TrangThai || 'Bình thường';
    Db.insert('ThietBi', rec);
    log_(u.Email, 'Thêm', 'ThietBi', ma, rec.TenTB);
  } else {
    if (!exists) throw new Error('Không tìm thấy thiết bị ' + ma);
    Db.update('ThietBi', 'MaTB', ma, rec);
    log_(u.Email, 'Sửa', 'ThietBi', ma, rec);
  }
  return getEquipment_({ MaTB: ma }, u);
}

function deleteEquipment_(p, u) {
  const ma = p.MaTB;
  if (Db.all('SuaChua').some(function (r) { return r.MaTB === ma; })) {
    throw new Error('Thiết bị đã có lịch sử sửa chữa, không xoá được. Hãy chuyển trạng thái sang "Thanh lý".');
  }
  ['GiayTo', 'LinhKien', 'TaiLieu'].forEach(function (t) { Db.removeWhere(t, function (x) { return x.MaTB === ma; }); });
  Db.remove('ThietBi', 'MaTB', ma);
  log_(u.Email, 'Xoá', 'ThietBi', ma, '');
  return { ok: true };
}

function requireEquip_(ma) {
  const e = Db.find('ThietBi', 'MaTB', ma);
  if (!e) throw new Error('Không tìm thấy thiết bị ' + ma);
  return e;
}

/* ---------------- Giấy tờ / Linh kiện / Tài liệu ---------------- */
function saveDoc_(p, u) {
  const d = p.data || {};
  requireEquip_(d.MaTB);
  if (!d.LoaiGiayTo) throw new Error('Chưa chọn loại giấy tờ');
  if (!parseDate_(d.NgayHetHan)) throw new Error('Chưa nhập ngày hết hạn');
  const rec = { MaTB: d.MaTB, LoaiGiayTo: d.LoaiGiayTo, SoGiay: d.SoGiay || '', NgayCap: d.NgayCap || '',
    NgayHetHan: d.NgayHetHan, FileIDs: splitIds_(d.FileIDs).join(','), GhiChu: d.GhiChu || '' };
  return saveChild_('GiayTo', d.ID, rec, u);
}

function savePart_(p, u) {
  const d = p.data || {};
  requireEquip_(d.MaTB);
  if (!d.Loai || !d.QuyCach) throw new Error('Chưa nhập loại và quy cách');
  const rec = { MaTB: d.MaTB, Loai: d.Loai, ViTri: d.ViTri || '', QuyCach: d.QuyCach, SoLuong: d.SoLuong || 1,
    NgayThay: d.NgayThay || '', GhiChu: d.GhiChu || '' };
  return saveChild_('LinhKien', d.ID, rec, u);
}

function saveFileDoc_(p, u) {
  const d = p.data || {};
  requireEquip_(d.MaTB);
  if (!d.FileID) throw new Error('Chưa có file');
  const rec = { MaTB: d.MaTB, TenTaiLieu: d.TenTaiLieu || 'Tài liệu', FileID: d.FileID, MimeType: d.MimeType || '' };
  return saveChild_('TaiLieu', d.ID, rec, u);
}

function saveChild_(table, id, rec, u) {
  if (id) {
    Db.update(table, 'ID', id, rec);
    log_(u.Email, 'Sửa', table, id, rec);
  } else {
    id = newId_();
    rec.ID = id;
    if (SCHEMA[table].cols.indexOf('NgayTao') >= 0) { rec.NgayTao = new Date(); rec.NguoiTao = Auth.norm(u.Email); }
    Db.insert(table, rec);
    log_(u.Email, 'Thêm', table, id, rec);
  }
  return out_(Db.find(table, 'ID', id));
}

function delChild_(table, id, u) {
  const ok = Db.remove(table, 'ID', id);
  if (ok) log_(u.Email, 'Xoá', table, id, '');
  return { ok: ok };
}

/* ---------------- Sửa chữa ---------------- */
function enrichRepair_(r, eqMap) {
  const o = out_(r);
  const e = eqMap[r.MaTB] || {};
  o.TenTB = e.TenTB || r.MaTB;
  o.BienSo = e.BienSo || '';
  o.AnhTB = e.AnhID || '';
  return o;
}

function eqMap_() {
  return Db.all('ThietBi').reduce(function (m, e) { m[e.MaTB] = e; return m; }, {});
}

function listRepairs_(p, u) {
  const eq = eqMap_();
  const me = Auth.norm(u.Email);
  return Db.all('SuaChua')
    .filter(function (r) {
      if (p.MaTB && r.MaTB !== p.MaTB) return false;
      if (p.scope === 'open' && REPAIR_OPEN.indexOf(r.TrangThai) < 0) return false;
      if (u.VaiTro === ROLE.LX && !canSee_(u, r.MaTB) && Auth.norm(r.NguoiBao) !== me) return false;
      return true;
    })
    .map(function (r) { return enrichRepair_(r, eq); })
    .sort(function (a, b) { return String(b.NgayBao).localeCompare(String(a.NgayBao)); });
}

function getRepair_(p, u) {
  const r = Db.find('SuaChua', 'ID', p.ID);
  if (!r) throw new Error('Không tìm thấy phiếu');
  if (u.VaiTro === ROLE.LX && !canSee_(u, r.MaTB) && Auth.norm(r.NguoiBao) !== Auth.norm(u.Email)) {
    throw new Error('Bạn không xem được phiếu này');
  }
  const o = enrichRepair_(r, eqMap_());
  o.parts = Db.all('LinhKien').filter(function (x) { return x.MaTB === r.MaTB; }).map(out_);
  return o;
}

function nextRepairNo_() {
  const y = Utilities.formatDate(new Date(), APP.TZ, 'yyyy');
  const pre = APP.REPAIR_PREFIX + '-' + y + '-';
  let max = 0;
  Db.all('SuaChua').forEach(function (r) {
    const s = String(r.SoPhieu || '');
    if (s.indexOf(pre) === 0) max = Math.max(max, Number(s.slice(pre.length)) || 0);
  });
  return pre + ('000' + (max + 1)).slice(-4);
}

function createRepair_(p, u) {
  const d = p.data || {};
  const e = requireEquip_(d.MaTB);
  if (!canSee_(u, d.MaTB)) throw new Error('Bạn không được giao thiết bị này');
  if (!String(d.MoTa || '').trim()) throw new Error('Chưa mô tả hư hỏng / công việc');
  const rec = {
    ID: newId_(), SoPhieu: nextRepairNo_(), MaTB: d.MaTB, LoaiCV: d.LoaiCV || REPAIR_TYPES[0],
    NguoiBao: Auth.norm(u.Email), NgayBao: new Date(), MoTa: String(d.MoTa).trim(),
    AnhTruoc: splitIds_(d.AnhTruoc).join(','), DungXe: !!d.DungXe, TrangThai: 'Mới báo', GhiChu: d.GhiChu || ''
  };
  Db.insert('SuaChua', rec);
  log_(u.Email, 'Báo hỏng', 'SuaChua', rec.ID, rec.SoPhieu + ' ' + e.MaTB);
  syncEquipStatus_(d.MaTB);
  notifyNewRepair_(rec, e, u);
  return getRepair_({ ID: rec.ID }, u);
}

/**
 * Các bước xử lý phiếu:
 *  tiepnhan  : Mới báo -> Đã tiếp nhận (KTV = người bấm)
 *  capnhat   : cập nhật nội dung, ảnh sau, linh kiện, trạng thái Đang sửa / Chờ vật tư
 *  hoanthanh : -> Hoàn thành (cập nhật ngày thay linh kiện, trả xe về Bình thường)
 *  nghiemthu : Hoàn thành -> Đã nghiệm thu   (Admin)
 *  molai     : Hoàn thành -> Đang sửa         (Admin)
 *  huy       : -> Huỷ                         (Admin)
 */
function updateRepair_(p, u) {
  const r = Db.find('SuaChua', 'ID', p.ID);
  if (!r) throw new Error('Không tìm thấy phiếu');
  const d = p.data || {};
  const me = Auth.norm(u.Email);
  const now = new Date();
  const patch = {};
  const st = r.TrangThai;
  const isAdmin = u.VaiTro === ROLE.ADMIN;
  const closed = REPAIR_OPEN.indexOf(st) < 0;

  function common() {
    ['NoiDungKhacPhuc', 'MoTa', 'LoaiCV', 'GhiChu'].forEach(function (k) { if (k in d) patch[k] = d[k]; });
    if ('AnhSau' in d) patch.AnhSau = splitIds_(d.AnhSau).join(',');
    if ('AnhTruoc' in d) patch.AnhTruoc = splitIds_(d.AnhTruoc).join(',');
    if ('LinhKienThay' in d) patch.LinhKienThay = splitIds_(d.LinhKienThay).join(',');
    if ('DungXe' in d) patch.DungXe = !!d.DungXe;
    if (!r.KTV) { patch.KTV = me; }
    if (!r.NgayTiepNhan) { patch.NgayTiepNhan = now; }
  }

  switch (p.step) {
    case 'tiepnhan':
      if (st !== 'Mới báo') throw new Error('Phiếu đã được tiếp nhận');
      patch.TrangThai = 'Đã tiếp nhận'; patch.KTV = me; patch.NgayTiepNhan = now;
      break;
    case 'capnhat':
      if (closed && !isAdmin) throw new Error('Phiếu đã đóng, chỉ Admin được sửa');
      common();
      if (d.TrangThai && ['Đang sửa', 'Chờ vật tư', 'Đã tiếp nhận'].indexOf(d.TrangThai) >= 0 && !closed) patch.TrangThai = d.TrangThai;
      else if (st === 'Mới báo') patch.TrangThai = 'Đang sửa';
      break;
    case 'hoanthanh':
      if (closed) throw new Error('Phiếu đã đóng');
      common();
      const nd = ('NoiDungKhacPhuc' in d) ? d.NoiDungKhacPhuc : r.NoiDungKhacPhuc;
      if (!String(nd || '').trim()) throw new Error('Cần nhập nội dung khắc phục trước khi hoàn thành');
      patch.TrangThai = 'Hoàn thành';
      patch.NgayXong = parseDate_(d.NgayXong) || now;
      const parts = splitIds_(('LinhKienThay' in d) ? d.LinhKienThay : r.LinhKienThay);
      parts.forEach(function (id) {
        if (Db.find('LinhKien', 'ID', id)) Db.update('LinhKien', 'ID', id, { NgayThay: patch.NgayXong });
      });
      break;
    case 'nghiemthu':
      if (!isAdmin) throw new Error('Chỉ Admin được nghiệm thu');
      if (st !== 'Hoàn thành') throw new Error('Phiếu chưa hoàn thành');
      patch.TrangThai = 'Đã nghiệm thu'; patch.NguoiNghiemThu = me; patch.NgayNghiemThu = now;
      break;
    case 'molai':
      if (!isAdmin) throw new Error('Chỉ Admin được mở lại phiếu');
      if (st !== 'Hoàn thành') throw new Error('Chỉ mở lại được phiếu đang ở trạng thái Hoàn thành');
      patch.TrangThai = 'Đang sửa'; patch.NgayXong = '';
      break;
    case 'huy':
      if (!isAdmin) throw new Error('Chỉ Admin được huỷ phiếu');
      patch.TrangThai = 'Huỷ';
      patch.GhiChu = [r.GhiChu, d.LyDo ? 'Huỷ: ' + d.LyDo : ''].filter(String).join(' | ');
      break;
    default:
      throw new Error('Bước xử lý không hợp lệ');
  }
  Db.update('SuaChua', 'ID', r.ID, patch);
  log_(u.Email, 'Phiếu SC: ' + p.step, 'SuaChua', r.ID, patch);
  syncEquipStatus_(r.MaTB);
  return getRepair_({ ID: r.ID }, u);
}

/** Đồng bộ trạng thái xe theo phiếu sửa chữa đang mở có "dừng xe" */
function syncEquipStatus_(ma) {
  const e = Db.find('ThietBi', 'MaTB', ma);
  if (!e) return;
  const stop = Db.all('SuaChua').some(function (r) {
    return r.MaTB === ma && REPAIR_OPEN.indexOf(r.TrangThai) >= 0 && (r.DungXe === true || r.DungXe === 'TRUE');
  });
  const cur = e.TrangThai || 'Bình thường';
  if (stop && cur === 'Bình thường') Db.update('ThietBi', 'MaTB', ma, { TrangThai: 'Đang sửa chữa' });
  if (!stop && cur === 'Đang sửa chữa') Db.update('ThietBi', 'MaTB', ma, { TrangThai: 'Bình thường' });
}

/** Email báo cho Admin + Kỹ thuật khi có phiếu mới (tắt: Script Property NOTIFY_REPAIR = off) */
function notifyNewRepair_(rec, e, u) {
  try {
    if (prop_('NOTIFY_REPAIR') === 'off') return;
    const to = Db.all('NguoiDung')
      .filter(function (x) { return ROLES_TECH.indexOf(x.VaiTro) >= 0 && x.KichHoat !== false && Auth.norm(x.Email) !== Auth.norm(u.Email); })
      .map(function (x) { return x.Email; });
    if (!to.length) return;
    MailApp.sendEmail({
      to: to.join(','),
      subject: '[Báo hỏng] ' + rec.SoPhieu + ' – ' + e.TenTB + (e.BienSo ? ' (' + e.BienSo + ')' : ''),
      htmlBody: '<b>' + (u.HoTen || u.Email) + '</b> vừa báo hỏng:<br><br>' +
        'Thiết bị: <b>' + e.TenTB + '</b> ' + (e.BienSo || '') + '<br>' +
        'Loại: ' + rec.LoaiCV + (rec.DungXe ? ' – <b style="color:#c62828">XE PHẢI DỪNG</b>' : '') + '<br>' +
        'Nội dung: ' + rec.MoTa + '<br><br><a href="' + appUrl_() + '">Mở ứng dụng</a>',
      name: APP.NAME
    });
  } catch (err) { console.warn('notify fail', err); }
}

/* ---------------- File ---------------- */
function upload_(p, u) {
  if (FILE_KINDS.indexOf(p.kind) < 0) throw new Error('Loại file không hợp lệ');
  if (p.kind !== 'SuaChua' && ROLES_TECH.indexOf(u.VaiTro) < 0) throw new Error('Bạn không có quyền tải file này');
  const e = requireEquip_(p.MaTB);
  if (!canSee_(u, e.MaTB)) throw new Error('Bạn không được giao thiết bị này');
  if (!p.data || p.data.length > 14000000) throw new Error('File quá lớn (tối đa 10MB)');
  const mod = MODULES.find(function (m) { return m.id === (e.Module || 'PTTBMD'); }) || MODULES[0];
  const folder = (e.MaTB + (e.BienSo ? '_' + e.BienSo : '')).replace(/[\\/:*?"<>|]/g, '');
  const stamp = Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmmss');
  const ext = (String(p.name || '').match(/\.[A-Za-z0-9]{1,5}$/) || [p.mime === 'application/pdf' ? '.pdf' : '.jpg'])[0];
  const base = p.kind === 'TaiLieu'
    ? stamp + '_' + String(p.name || 'tai_lieu').replace(/[\\/:*?"<>|]/g, '')
    : e.MaTB + '_' + p.kind + '_' + stamp + '_' + Math.floor(Math.random() * 1000) + ext;
  const f = Storage.upload([mod.folder, folder, p.kind], base, p.mime || 'image/jpeg', p.data);
  log_(u.Email, 'Tải file', p.kind, f.id, base);
  return f;
}

/** Chỉ cho xem file đã gắn vào dữ liệu app (không xem được file khác trong Drive) */
function knownFiles_() {
  const s = {};
  function add(v) { splitIds_(v).forEach(function (id) { s[id] = 1; }); }
  Db.all('ThietBi').forEach(function (x) { add(x.AnhID); });
  Db.all('GiayTo').forEach(function (x) { add(x.FileIDs); });
  Db.all('SuaChua').forEach(function (x) { add(x.AnhTruoc); add(x.AnhSau); });
  Db.all('TaiLieu').forEach(function (x) { add(x.FileID); });
  return s;
}

function checkFile_(id) {
  if (!knownFiles_()[id]) throw new Error('File không thuộc dữ liệu ứng dụng');
}

function thumbs_(p) {
  const known = knownFiles_();
  const ids = (p.ids || []).filter(function (id) { return known[id]; }).slice(0, 24);
  return ids.length ? Storage.thumbs(ids, Math.min(Number(p.size) || 400, 800)) : {};
}

/* ---------------- Người dùng ---------------- */
function saveUser_(p, u) {
  const d = p.data || {};
  const email = Auth.norm(d.Email);
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Email không hợp lệ');
  if (ROLES_ALL.indexOf(d.VaiTro) < 0) throw new Error('Vai trò không hợp lệ');
  const dup = Db.all('NguoiDung').find(function (x) { return Auth.norm(x.Email) === email && x.ID !== d.ID; });
  if (dup) throw new Error('Email đã có trong danh sách');
  const rec = { Email: email, HoTen: String(d.HoTen || '').trim(), VaiTro: d.VaiTro,
    XeDuocGiao: splitIds_(d.XeDuocGiao).join(','), KichHoat: d.KichHoat !== false, GhiChu: d.GhiChu || '' };
  if (d.ID && d.ID === u.ID && (rec.VaiTro !== ROLE.ADMIN || !rec.KichHoat)) {
    throw new Error('Không thể tự hạ quyền hoặc khoá chính mình');
  }
  return saveChild_('NguoiDung', d.ID, rec, u);
}

function deleteUser_(p, u) {
  if (p.ID === u.ID) throw new Error('Không thể xoá chính mình');
  return delChild_('NguoiDung', p.ID, u);
}
