/**
 * Storage.gs : LỚP LƯU TRỮ FILE (ảnh, giấy tờ, biên bản, tài liệu)
 *
 * Toàn bộ app chỉ gọi Storage.upload / Storage.thumbs / Storage.full / Storage.link.
 * Khi chuyển sang OneDrive: viết thêm adapter OneDrive cùng 4 hàm này,
 * đổi APP.STORAGE = 'onedrive' trong Config.gs. Không phải sửa chỗ khác.
 *
 * Cấu trúc thư mục (tự tạo):
 *   Data KTHT/<Module>/<MaTB>_<BienSo>/<AnhXe|GiayTo|SuaChua|TaiLieu>/
 */
const Storage = (function () {

  /* ================= GOOGLE DRIVE ================= */
  const GDrive = {
    root: function () {
      const id = prop_('ROOT_FOLDER_ID');
      if (!id) throw new Error('Chưa có thư mục lưu trữ. Admin cần chạy setup().');
      return DriveApp.getFolderById(id);
    },

    child: function (parent, name) {
      const it = parent.getFoldersByName(name);
      return it.hasNext() ? it.next() : parent.createFolder(name);
    },

    upload: function (path, fileName, mime, base64) {
      let folder = GDrive.root();
      path.forEach(function (p) { folder = GDrive.child(folder, p); });
      const blob = Utilities.newBlob(Utilities.base64Decode(base64), mime, fileName);
      const f = folder.createFile(blob);
      return { id: f.getId(), name: f.getName(), mime: mime };
    },

    /** Ảnh thu nhỏ cho danh sách. Trả về {id: dataUrl}. Dùng fetchAll để chạy song song. */
    thumbs: function (ids, size) {
      size = size || 400;
      const cache = CacheService.getScriptCache();
      const res = {};
      const need = [];
      const cached = cache.getAll(ids.map(function (id) { return 'th' + size + '_' + id; }));
      ids.forEach(function (id) {
        const c = cached['th' + size + '_' + id];
        if (c) res[id] = c; else need.push(id);
      });
      if (!need.length) return res;

      const token = ScriptApp.getOAuthToken();
      const metaReqs = need.map(function (id) {
        return { url: 'https://www.googleapis.com/drive/v3/files/' + id + '?fields=thumbnailLink,mimeType&supportsAllDrives=true',
          headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true };
      });
      const metas = UrlFetchApp.fetchAll(metaReqs);
      const imgReqs = [], imgIds = [];
      metas.forEach(function (r, i) {
        if (r.getResponseCode() !== 200) return;
        const m = JSON.parse(r.getContentText());
        if (!m.thumbnailLink) return;
        imgIds.push(need[i]);
        imgReqs.push({ url: m.thumbnailLink.replace(/=s\d+$/, '=s' + size),
          headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true });
      });
      const imgs = imgReqs.length ? UrlFetchApp.fetchAll(imgReqs) : [];
      const toCache = {};
      imgs.forEach(function (r, i) {
        if (r.getResponseCode() !== 200) return;
        const b = r.getBlob();
        const url = 'data:' + (b.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(b.getBytes());
        res[imgIds[i]] = url;
        if (url.length < 95000) toCache['th' + size + '_' + imgIds[i]] = url;
      });
      if (Object.keys(toCache).length) cache.putAll(toCache, 21600);
      // File vừa upload: Drive chưa kịp tạo thumbnail -> gửi luôn ảnh gốc nếu nhỏ
      need.forEach(function (id) {
        if (res[id]) return;
        try {
          const f = DriveApp.getFileById(id);
          if (f.getMimeType().indexOf('image/') === 0 && f.getSize() < 400000) {
            res[id] = 'data:' + f.getMimeType() + ';base64,' + Utilities.base64Encode(f.getBlob().getBytes());
          }
        } catch (e) { /* bỏ qua */ }
      });
      return res;
    },

    /** Ảnh cỡ lớn để xem chi tiết (ảnh > 1.5MB thì lấy bản thu nhỏ 1600px) */
    full: function (id) {
      const f = DriveApp.getFileById(id);
      const mime = f.getMimeType();
      if (mime.indexOf('image/') === 0 && f.getSize() <= 1500000) {
        return 'data:' + mime + ';base64,' + Utilities.base64Encode(f.getBlob().getBytes());
      }
      const t = GDrive.thumbs([id], 1600)[id];
      if (t) return t;
      throw new Error('Không xem trước được file này');
    },

    /** Link mở file gốc (PDF, Word…) – người xem cần có quyền xem trên Drive */
    link: function (id) { return 'https://drive.google.com/file/d/' + id + '/view'; },

    remove: function (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* bỏ qua */ } }
  };

  /* ================= ONEDRIVE (chờ IT cấp App registration) ================= */
  const OneDrive = {
    upload: function () { throw new Error('OneDrive chưa được cấu hình'); },
    thumbs: function () { return {}; },
    full: function () { throw new Error('OneDrive chưa được cấu hình'); },
    link: function () { return ''; },
    remove: function () {}
  };

  function impl() { return APP.STORAGE === 'onedrive' ? OneDrive : GDrive; }

  return {
    upload: function (p, n, m, b) { return impl().upload(p, n, m, b); },
    thumbs: function (ids, s) { return impl().thumbs(ids, s); },
    full: function (id) { return impl().full(id); },
    link: function (id) { return impl().link(id); },
    remove: function (id) { return impl().remove(id); },
    gdrive: GDrive
  };
})();
