/**
 * Db.gs : Đọc/ghi Google Sheet theo kiểu "bảng – dòng – object".
 * Mỗi request đọc 1 bảng tối đa 1 lần (cache trong bộ nhớ).
 */
const Db = (function () {
  let ss_ = null;
  const memo_ = {};

  function ss() {
    if (!ss_) {
      const id = prop_('DB_ID');
      if (!id) throw new Error('Chưa khởi tạo dữ liệu. Admin cần chạy hàm setup() trong Apps Script.');
      ss_ = SpreadsheetApp.openById(id);
    }
    return ss_;
  }

  function sheet(name) {
    const sh = ss().getSheetByName(name);
    if (!sh) throw new Error('Thiếu sheet "' + name + '". Hãy chạy lại setup().');
    return sh;
  }

  function headers(name) {
    const sh = sheet(name);
    const lastCol = sh.getLastColumn();
    if (!lastCol) return [];
    return sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  }

  /** Đọc toàn bộ bảng -> mảng object (có _row = số dòng trong sheet) */
  function all(name) {
    if (memo_[name]) return memo_[name];
    const sh = sheet(name);
    const lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
    if (lastRow < 2) return (memo_[name] = []);
    const vals = sh.getRange(1, 1, lastRow, lastCol).getValues();
    const head = vals[0].map(String);
    const out = [];
    for (let i = 1; i < vals.length; i++) {
      const r = vals[i];
      if (!r.some(function (c) { return c !== '' && c !== null; })) continue;
      const o = { _row: i + 1 };
      head.forEach(function (h, j) { if (h) o[h] = r[j]; });
      out.push(o);
    }
    return (memo_[name] = out);
  }

  function find(name, key, val) {
    const k = String(val);
    return all(name).find(function (o) { return String(o[key]) === k; }) || null;
  }

  function rowValues_(head, obj, base) {
    return head.map(function (h) {
      const v = (h in obj) ? obj[h] : (base ? base[h] : '');
      return toCell_(h, v);
    });
  }

  function insert(name, obj) {
    const head = headers(name);
    const sh = sheet(name);
    const row = rowValues_(head, obj, null);
    sh.getRange(sh.getLastRow() + 1, 1, 1, head.length).setValues([row]);
    delete memo_[name];
    return obj;
  }

  /** Thêm nhiều dòng một lần (dùng cho chuyển dữ liệu) */
  function insertMany(name, list) {
    if (!list.length) return;
    const head = headers(name);
    const sh = sheet(name);
    const rows = list.map(function (o) { return rowValues_(head, o, null); });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, head.length).setValues(rows);
    delete memo_[name];
  }

  function update(name, key, val, patch) {
    const cur = find(name, key, val);
    if (!cur) throw new Error('Không tìm thấy bản ghi ' + val + ' trong ' + name);
    const head = headers(name);
    const merged = Object.assign({}, cur, patch);
    const row = rowValues_(head, merged, cur);
    sheet(name).getRange(cur._row, 1, 1, head.length).setValues([row]);
    delete memo_[name];
    return merged;
  }

  function remove(name, key, val) {
    const cur = find(name, key, val);
    if (!cur) return false;
    sheet(name).deleteRow(cur._row);
    delete memo_[name];
    return true;
  }

  /** Xoá nhiều dòng theo điều kiện (xoá từ dưới lên) */
  function removeWhere(name, pred) {
    const rows = all(name).filter(pred).map(function (o) { return o._row; }).sort(function (a, b) { return b - a; });
    const sh = sheet(name);
    rows.forEach(function (r) { sh.deleteRow(r); });
    delete memo_[name];
    return rows.length;
  }

  function clear(name) {
    const sh = sheet(name);
    const n = sh.getLastRow();
    if (n > 1) sh.getRange(2, 1, n - 1, Math.max(1, sh.getLastColumn())).clearContent();
    delete memo_[name];
  }

  function reset() { Object.keys(memo_).forEach(function (k) { delete memo_[k]; }); }

  return { ss: ss, sheet: sheet, headers: headers, all: all, find: find, insert: insert,
    insertMany: insertMany, update: update, remove: remove, removeWhere: removeWhere, clear: clear, reset: reset };
})();

/* ---------- Chuyển đổi kiểu dữ liệu Sheet <-> giao diện ---------- */

function toCell_(col, v) {
  if (v === undefined || v === null) return '';
  if (DATE_COLS.indexOf(col) >= 0 || DATETIME_COLS.indexOf(col) >= 0) return parseDate_(v);
  if (NUMBER_COLS.indexOf(col) >= 0) {
    if (v === '') return '';
    const n = Number(String(v).replace(',', '.'));
    return isNaN(n) ? v : n;
  }
  if (BOOL_COLS.indexOf(col) >= 0) return v === true || v === 'TRUE' || v === 'true' || v === 1 || v === 'Y';
  if (Array.isArray(v)) return v.join(',');
  return v;
}

/** Nhận Date | 'yyyy-MM-dd' | 'yyyy-MM-ddTHH:mm' | 'dd/MM/yyyy' -> Date hoặc '' */
function parseDate_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') return isNaN(v.getTime()) ? '' : v;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/);
  if (m) return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
  return '';
}

function fmtDate_(d, withTime) {
  if (!d || Object.prototype.toString.call(d) !== '[object Date]' || isNaN(d.getTime())) return '';
  return Utilities.formatDate(d, APP.TZ, withTime ? "yyyy-MM-dd'T'HH:mm" : 'yyyy-MM-dd');
}

/** Object trong Sheet -> object gửi về giao diện (Date -> chuỗi, bỏ _row) */
function out_(o) {
  if (!o) return null;
  const r = {};
  Object.keys(o).forEach(function (k) {
    if (k === '_row') return;
    const v = o[k];
    if (DATE_COLS.indexOf(k) >= 0) r[k] = fmtDate_(v, false);
    else if (DATETIME_COLS.indexOf(k) >= 0) r[k] = fmtDate_(v, true);
    else if (Object.prototype.toString.call(v) === '[object Date]') r[k] = fmtDate_(v, false);
    else r[k] = v;
  });
  return r;
}

function today_() {
  const s = Utilities.formatDate(new Date(), APP.TZ, 'yyyy-MM-dd').split('-');
  return new Date(+s[0], +s[1] - 1, +s[2]);
}

function daysBetween_(from, to) {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function newId_() { return Utilities.getUuid().replace(/-/g, '').slice(0, 10); }

function splitIds_(s) {
  if (!s) return [];
  if (Array.isArray(s)) return s.filter(String);
  return String(s).split(',').map(function (x) { return x.trim(); }).filter(String);
}
