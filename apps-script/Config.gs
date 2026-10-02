/**
 * ============================================================
 *  KTHT – QUẢN LÝ THIẾT BỊ KỸ THUẬT
 *  Phòng Kỹ thuật Hạ tầng – Cảng hàng không Buôn Ma Thuột
 * ------------------------------------------------------------
 *  Config.gs : Cấu hình chung + cấu trúc bảng dữ liệu
 *  Muốn thêm cột: thêm tên cột vào SCHEMA rồi chạy lại setup()
 *  (setup chỉ THÊM cột còn thiếu, không xoá dữ liệu).
 * ============================================================
 */

const APP = {
  NAME: 'KTHT – Quản lý thiết bị',
  ORG: 'Phòng KTHT – CHK Buôn Ma Thuột',
  TZ: 'Asia/Ho_Chi_Minh',
  DB_NAME: 'KTHT_Data',            // Tên Google Sheet dữ liệu (setup tự tạo)
  ROOT_FOLDER_NAME: 'Data KTHT',   // Thư mục gốc lưu file (setup tự tạo)
  STORAGE: 'gdrive',               // 'gdrive' | 'onedrive' (khi IT cấp quyền Graph)
  SESSION_DAYS: 30,                // Đăng nhập 1 lần dùng 30 ngày
  OTP_MINUTES: 10,                 // Mã đăng nhập hết hạn sau 10 phút
  ALERT_DAYS_DEFAULT: 30,          // Cảnh báo giấy tờ trước X ngày (nếu DM không ghi)
  REPAIR_PREFIX: 'SC'              // Số phiếu: SC-2026-0001
};

const ROLE = { ADMIN: 'Admin', KT: 'Kỹ thuật', LX: 'Lái xe' };
const ROLES_ALL = [ROLE.ADMIN, ROLE.KT, ROLE.LX];
const ROLES_TECH = [ROLE.ADMIN, ROLE.KT];

/** Các module (menu). Module chưa làm để active:false -> hiện "Sắp có". */
const MODULES = [
  { id: 'PTTBMD', name: 'Phương tiện & TTB mặt đất', folder: 'PhuongTien_TTBMD', icon: 'airport_shuttle', active: true },
  { id: 'DIEN',   name: 'Hệ thống điện',             folder: 'HeThongDien',      icon: 'bolt',            active: false },
  { id: 'DHKK',   name: 'Điều hoà – Thông gió',      folder: 'DieuHoa',          icon: 'mode_fan',        active: false },
  { id: 'DDHK',   name: 'Thiết bị dẫn đường',         folder: 'DanDuong',         icon: 'cell_tower',      active: false }
];

const EQUIP_STATUS = ['Bình thường', 'Đang sửa chữa', 'Ngừng hoạt động', 'Thanh lý'];
const REPAIR_STATUS = ['Mới báo', 'Đã tiếp nhận', 'Đang sửa', 'Chờ vật tư', 'Hoàn thành', 'Đã nghiệm thu', 'Huỷ'];
const REPAIR_OPEN = ['Mới báo', 'Đã tiếp nhận', 'Đang sửa', 'Chờ vật tư'];
const REPAIR_TYPES = ['Hỏng đột xuất', 'Bảo dưỡng', 'Kiểm tra', 'Khác'];
const PART_TYPES = ['Ắc quy', 'Lốp', 'Lọc', 'Dầu', 'Khác'];
const FILE_KINDS = ['AnhXe', 'GiayTo', 'SuaChua', 'TaiLieu'];

/**
 * Cấu trúc bảng. Tên cột dùng không dấu để công thức/code dễ đọc.
 * key: cột khoá chính (dòng đầu tiên của mỗi bảng)
 */
const SCHEMA = {
  NguoiDung: {
    key: 'ID',
    cols: ['ID', 'Email', 'HoTen', 'VaiTro', 'XeDuocGiao', 'KichHoat', 'GhiChu']
  },
  DM_LoaiTB: {
    key: 'TenLoai',
    cols: ['TenLoai', 'Module', 'Nhom', 'DonViDo', 'ThuTu']
  },
  DM_GiayTo: {
    key: 'LoaiGiayTo',
    cols: ['LoaiGiayTo', 'CanhBaoTruoc', 'BatBuoc', 'ThuTu']
  },
  ThietBi: {
    key: 'MaTB',
    cols: ['MaTB', 'Module', 'TenTB', 'LoaiTB', 'NhanHieu', 'NuocSX', 'BienSo', 'NamSX', 'NamSD',
      'Serial', 'SoMay', 'SoKhung', 'Dai', 'Rong', 'Cao', 'KhoiLuong', 'TaiTrongCongSuat',
      'ThongTinKhac', 'TrangThai', 'ChiSo', 'AnhID', 'GhiChu', 'NgayCapNhat', 'NguoiCapNhat']
  },
  GiayTo: {
    key: 'ID',
    cols: ['ID', 'MaTB', 'LoaiGiayTo', 'SoGiay', 'NgayCap', 'NgayHetHan', 'FileIDs', 'GhiChu', 'NgayTao', 'NguoiTao']
  },
  LinhKien: {
    key: 'ID',
    cols: ['ID', 'MaTB', 'Loai', 'ViTri', 'QuyCach', 'SoLuong', 'NgayThay', 'GhiChu']
  },
  SuaChua: {
    key: 'ID',
    cols: ['ID', 'SoPhieu', 'MaTB', 'LoaiCV', 'NguoiBao', 'NgayBao', 'MoTa', 'AnhTruoc', 'DungXe',
      'KTV', 'NgayTiepNhan', 'NoiDungKhacPhuc', 'LinhKienThay', 'AnhSau', 'NgayXong',
      'NguoiNghiemThu', 'NgayNghiemThu', 'TrangThai', 'GhiChu']
  },
  TaiLieu: {
    key: 'ID',
    cols: ['ID', 'MaTB', 'TenTaiLieu', 'FileID', 'MimeType', 'NgayTao', 'NguoiTao']
  },
  NhatKyHeThong: {
    key: 'ThoiGian',
    cols: ['ThoiGian', 'Email', 'HanhDong', 'Bang', 'KhoaID', 'ChiTiet']
  }
};

/** Cột ngày (lưu dạng Date trong Sheet, gửi về giao diện dạng chuỗi) */
const DATE_COLS = ['NgayCap', 'NgayHetHan', 'NgayThay', 'NgayNghiemThu'];
/** Cột ngày-giờ */
const DATETIME_COLS = ['NgayBao', 'NgayTiepNhan', 'NgayXong', 'NgayTao', 'NgayCapNhat', 'ThoiGian'];
/** Cột số */
const NUMBER_COLS = ['NamSX', 'NamSD', 'Dai', 'Rong', 'Cao', 'KhoiLuong', 'SoLuong', 'ChiSo', 'CanhBaoTruoc', 'ThuTu'];
/** Cột đúng/sai */
const BOOL_COLS = ['DungXe', 'KichHoat', 'BatBuoc'];

/** Dữ liệu danh mục khởi tạo */
const SEED = {
  DM_GiayTo: [
    { LoaiGiayTo: 'Kiểm định', CanhBaoTruoc: 30, BatBuoc: true, ThuTu: 1 },
    { LoaiGiayTo: 'Bảo hiểm', CanhBaoTruoc: 30, BatBuoc: true, ThuTu: 2 }
  ]
};

function prop_(k) { return PropertiesService.getScriptProperties().getProperty(k); }
function setProp_(k, v) { PropertiesService.getScriptProperties().setProperty(k, v); }
