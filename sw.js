/* Service worker: lưu khung app để mở nhanh, cập nhật tự động khi có bản mới */
const VERSION = 'ktht-1.2.0';
const SHELL = ['./', './index.html', './config.js', './manifest.webmanifest', './vendor/vue.global.prod.js',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/favicon.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;                       // API (POST) luôn đi thẳng lên máy chủ
  const url = new URL(req.url);
  if (/google\.com$|googleusercontent\.com$/.test(url.hostname) && !/fonts\./.test(url.hostname)) return;

  // Font Google: lưu lại, lần sau dùng bản đã lưu
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    e.respondWith(caches.open(VERSION + '-fonts').then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      c.put(req, res.clone()); return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;

  // Trang chính + cấu hình: ưu tiên mạng (để nhận bản cập nhật), mất mạng thì dùng bản lưu
  if (req.mode === 'navigate' || /index\.html$|config\.js$|\/$/.test(url.pathname)) {
    e.respondWith(fetch(req).then(res => {
      const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res;
    }).catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('./index.html'))));
    return;
  }
  // Thư viện, icon: ưu tiên bản lưu
  e.respondWith(caches.match(req).then(hit => hit || fetch(req)));
});
