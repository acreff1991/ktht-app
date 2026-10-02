# KTHT – Quản lý thiết bị kỹ thuật (bản cài trên điện thoại)

Phòng Kỹ thuật Hạ tầng – Cảng hàng không Buôn Ma Thuột.

```
Điện thoại (app KTHT)  ──►  GitHub Pages (giao diện, thư mục này)
                               │  gửi yêu cầu
                               ▼
                       Google Apps Script (/exec)  ──►  Google Sheet KTHT_Data + Google Drive (ảnh, file)
```

- **GitHub** chỉ chứa giao diện, **không chứa dữ liệu**. Dữ liệu vẫn nằm trong Google Sheet/Drive của anh.
- Muốn đọc/ghi được dữ liệu phải đăng nhập bằng mã OTP gửi qua email, và chỉ email có trong bảng `NguoiDung` mới nhận được mã.

---

## PHẦN A – Cập nhật Apps Script (máy chủ), làm 1 lần

1. Mở project Apps Script → bấm **+** → **Tập lệnh** → đặt tên `Rest` → dán nội dung `apps-script/Rest.gs`.
2. Dán đè 2 file đã sửa: `Api.gs` và `Setup.gs` (lấy trong thư mục `apps-script/`).
3. Bấm **Lưu**. Nếu báo lỗi cú pháp ở file nào, xem lại file đó đã dán đúng chưa: dòng 2–3 của mỗi file `.gs` có ghi tên chính file đó.
4. **Triển khai** → **Quản lý bản triển khai** → ✏️ → Phiên bản: **Phiên bản mới** → **Triển khai**.
   Link `/exec` giữ nguyên. Quyền truy cập phải là **Bất kỳ ai** (Anyone).
5. Sau khi có link GitHub ở phần B: **Cài đặt dự án** ⚙ → **Thuộc tính tập lệnh** → **Thêm**:
   `APP_URL` = `https://<tên-tài-khoản>.github.io/ktht-app/`
   Khi đó link "Mở ứng dụng" trong email sẽ trỏ về app trên điện thoại.

> 3 file HTML (`Index`, `Styles`, `App`) trong Apps Script có thể giữ lại làm bản dự phòng (mở bằng link `/exec`), hoặc xoá đi. Nếu xoá, link `/exec` sẽ tự chuyển sang `APP_URL`.

## PHẦN B – Đưa lên GitHub Pages, khoảng 5 phút

1. Tạo tài khoản tại https://github.com (nếu chưa có).
2. Bấm **New repository**:
   - Repository name: `ktht-app`
   - Chọn **Public** (tài khoản GitHub miễn phí chỉ bật được Pages cho repo Public; repo chỉ chứa code, không chứa dữ liệu)
   - Bấm **Create repository**
3. Trong repo vừa tạo: bấm **uploading an existing file** (hoặc **Add file → Upload files**).
   Kéo thả **toàn bộ nội dung** thư mục này vào: `index.html`, `config.js`, `sw.js`, `manifest.webmanifest`, `404.html`, `.nojekyll`, `README.md` và các thư mục `icons/`, `vendor/`, `apps-script/`.
   Bấm **Commit changes**.
   > File `.nojekyll` bị ẩn trên Windows/Mac: nếu không kéo được thì bỏ qua, app vẫn chạy.
4. **Settings** → **Pages** → Source: **Deploy from a branch** → Branch: **main** / **(root)** → **Save**.
5. Đợi 1–2 phút, link app sẽ hiện ở đầu trang Pages:
   **`https://<tên-tài-khoản>.github.io/ktht-app/`**

## PHẦN C – Cài lên điện thoại

| Điện thoại | Cách cài |
|---|---|
| **iPhone** | Mở link bằng **Safari** → nút **Chia sẻ** (ô vuông có mũi tên) → **Thêm vào MH chính** → **Thêm** |
| **Android** | Mở link bằng **Chrome** → ⋮ → **Cài đặt ứng dụng** (hoặc **Thêm vào màn hình chính**) |
| Máy tính | Chrome/Edge: biểu tượng **Cài đặt** ở cuối thanh địa chỉ |

Sau khi cài, app mở toàn màn hình, có biểu tượng KTHT như app thật. Đăng nhập 1 lần, dùng được 30 ngày.
Trên iPhone, app đã cài và Safari không dùng chung đăng nhập, nên trong app cần đăng nhập lại 1 lần.

## Cập nhật sau này

- **Sửa giao diện:** upload đè file `index.html` lên GitHub. Mở lại app là thấy bản mới (có thể cần đóng hẳn rồi mở lại).
- **Sửa nghiệp vụ / máy chủ:** dán code vào Apps Script → **Triển khai** → **Phiên bản mới**.
- **Đổi link máy chủ:** sửa 1 dòng trong `config.js`.

## Cấu trúc thư mục

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ giao diện (Vue 3) |
| `config.js` | Link máy chủ Apps Script |
| `manifest.webmanifest` | Thông tin để cài thành app (tên, biểu tượng, màu) |
| `sw.js` | Lưu khung app để mở nhanh, tự cập nhật khi có bản mới |
| `icons/` | Biểu tượng app |
| `vendor/vue.global.prod.js` | Thư viện Vue (đặt sẵn, không phụ thuộc CDN) |
| `apps-script/` | Mã nguồn máy chủ (bản lưu, để dán vào Apps Script) |
