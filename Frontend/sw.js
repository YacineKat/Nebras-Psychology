importScripts('./js/version.js');

var CACHE_NAME = 'nebras-static-v' + (typeof APP_VERSION !== 'undefined' ? APP_VERSION.replace(/\./g, '-') : '0');
var STATIC_ASSETS = [
  '/home.html',
  '/auth.html',
  '/rule.html',
  '/manifest.json',
  '/css/hom.css',
  '/css/pwa.css',
  '/js/api.js',
  '/js/config.js',
  '/js/version.js',
  '/js/pwa.js',
  '/assets/image/logo.png',
  '/assets/image/icon-192.png',
  '/assets/image/icon-512.png'
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return Promise.all(
        STATIC_ASSETS.map(function(url) {
          return cache.add(url).catch(function() {});
        })
      );
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          if (name !== CACHE_NAME) {
            return caches.delete(name);
          }
        })
      );
    })
  );
  return self.clients.claim();
});

self.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('fetch', function(event) {
  var request = event.request;
  var url = new URL(request.url);

  // Never cache API calls or socket.io requests
  if (url.pathname.startsWith('/api/') || url.pathname.includes('socket.io')) {
    return;
  }

  // Network-first: try network, fall back to cache
  event.respondWith(
    fetch(request).then(function(response) {
      return caches.open(CACHE_NAME).then(function(cache) {
        cache.put(request, response.clone());
        return response;
      });
    }).catch(function() {
      return caches.match(request);
    })
  );
});
