const CACHE = 'edutest-v149';
const IMG_CACHE = 'edutest-img-v1';
const FILES = ['./', './index.html'];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE).then(function(cache) {
      return cache.addAll(FILES).catch(function(){});
    })
  );
  // 2026-10-02: yangi versiya O'ZICHA faollashmaydi (ochiq sahifani qayta yuklab, foydalanuvchini
  // ish joyidan sakratardi). Sahifa "Yangilash" bannerida SKIP_WAITING yuborganda faollashadi.
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    Promise.all([
      // Eski barcha keshlarni tozalaymiz (IMG_CACHE bundan mustasno)
      caches.keys().then(function(keys) {
        return Promise.all(
          keys.filter(function(k) {
            return k !== CACHE && k !== IMG_CACHE;
          }).map(function(k) {
            return caches.delete(k);
          })
        );
      }),
      // Joriy ochiq sahifalarni ham yangi SW ostida ishlashga o'tkazamiz
      // - bu maktab kompyuterida sahifani yopmasdan yangilanishini ta'minlaydi
      self.clients.claim()
    ])
  );
});

// Sahifani yangilash kerakligini mijozga xabar berish
self.addEventListener('activate', function(e) {
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(function(clients) {
      clients.forEach(function(client) {
        // Yangi versiya o'rnatilganini sahifaga xabar beramiz
        client.postMessage({ type: 'SW_UPDATED', cache: CACHE });
      });
    })
  );
});

function isImageRequest(url) {
  return /\/storage\/v1\/object\/public\/edutest-images\//.test(url) ||
         /\.(png|jpe?g|webp|gif)(\?|$)/i.test(url);
}

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;
  var url = e.request.url;

  if (isImageRequest(url)) {
    e.respondWith(
      caches.open(IMG_CACHE).then(function(cache) {
        return cache.match(e.request).then(function(cached) {
          var fetchPromise = fetch(e.request).then(function(res) {
            if (res && res.status === 200) cache.put(e.request, res.clone());
            return res;
          }).catch(function() { return cached; });
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  if (new URL(url).origin !== self.location.origin) return;

  // Network-first strategiya: avval internetdan olish, bo'lmasa keshdan.
  // index.html uchun har doim yangi versiyani tekshiramiz.
  e.respondWith(
    fetch(e.request).then(function(res) {
      if (res && res.status === 200) {
        var clone = res.clone();
        caches.open(CACHE).then(function(cache){ cache.put(e.request, clone); });
      }
      return res;
    }).catch(function() {
      return caches.match(e.request);
    })
  );
});

self.addEventListener('message', function(e) {
  var data = e.data || {};
  if (data.type === 'CACHE_IMAGES' && Array.isArray(data.urls)) {
    e.waitUntil(
      caches.open(IMG_CACHE).then(function(cache) {
        return Promise.all(data.urls.map(function(u) {
          return fetch(u).then(function(res) {
            if (res && res.status === 200) return cache.put(u, res);
          }).catch(function(){});
        }));
      })
    );
  }
  // Eski keshni to'liq tozalash buyrug'i (admin/debug uchun)
  if (data.type === 'CLEAR_CACHE') {
    e.waitUntil(
      caches.keys().then(function(keys) {
        return Promise.all(keys.map(function(k) { return caches.delete(k); }));
      })
    );
  }
});

self.addEventListener('push', function(e) {
  var data = {};
  try { data = e.data ? e.data.json() : {}; } catch (err) {}
  var title = data.title || 'EduTest Pro';
  var opts = {
    body: data.body || '',
    icon: './icon-192.png',
    badge: './icon-192.png',
    data: { url: data.url || './' }
  };
  e.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || './';
  e.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list) {
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// Sahifa "Yangilash" bosilganda shu xabarni yuboradi
self.addEventListener('message', function(e){
  if(e.data && e.data.type === 'SKIP_WAITING') self.skipWaiting();
});
