/* Service worker: mở app tức thì từ bản đã lưu, cập nhật ngầm phía sau.
 * Mỗi lần sửa index.html / config.js trên GitHub: tăng VERSION (VD 1.2.0 -> 1.2.1) để mọi máy nhận bản mới. */
const VERSION = 'ktht-1.2.1';
const FONTS = 'ktht-fonts';            // font giữ lâu dài, không xoá khi đổi phiên bản
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './vendor/vue.global.prod.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png'];

self.addEventListener('install', e => {
  // cache:'reload' = luôn lấy bản mới nhất từ GitHub, không dùng bản trình duyệt nhớ tạm
  e.waitUntil(caches.open(VERSION)
    .then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // API (POST) luôn đi thẳng lên máy chủ
  const url = new URL(req.url);

  // Font Google: lưu lại, lần sau dùng bản đã lưu
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(FONTS).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      if (res.ok || res.type === 'opaque') c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;

  // Trang chính + cấu hình: TRẢ NGAY bản đã lưu (mở app tức thì, kể cả mạng yếu),
  // đồng thời tải bản mới ngầm để lần mở sau dùng. Chưa có bản lưu thì lấy từ mạng.
  if (req.mode === 'navigate' || /index\.html$|config\.js$|\/$/.test(url.pathname)) {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = (await c.match(req, { ignoreSearch: true })) ||
        (req.mode === 'navigate' ? await c.match('./index.html') : null);
      const net = fetch(req, { cache: 'no-cache' }).then(res => {
        if (res.ok) c.put(req, res.clone());
        return res;
      });
      if (hit) { e.waitUntil(net.catch(() => {})); return hit; }
      return net.catch(() => c.match('./index.html'));
    }));
    return;
  }
  // Thư viện, icon: ưu tiên bản lưu
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
