// Service worker de FUEGO GRILL
// - Guarda el menú en el celular para que abra sin internet.
// - Con internet siempre intenta traer la versión más nueva (los cambios se ven al instante).
// - No toca agotados.txt ni descuentos.txt: esos deben ser siempre en vivo.

var CACHE = 'fuego-grill-v1';
var SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'icon-192.png',
  'icon-512.png',
  'icon-maskable-512.png',
  'apple-touch-icon.png'
];
var EN_VIVO = ['agotados.txt', 'descuentos.txt'];
var ESPERA_RED_MS = 4000; // si la red tarda más, se muestra lo guardado

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(function (c) {
      // Se guarda archivo por archivo: si uno falla, los demás igual se guardan.
      return Promise.all(SHELL.map(function (u) {
        return c.add(u).catch(function () {});
      }));
    })
  );
});

self.addEventListener('activate', function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE; })
        .map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

function esEnVivo(url) {
  return EN_VIVO.some(function (n) { return url.pathname.slice(-n.length) === n; });
}

function conEspera(promesa, ms) {
  return new Promise(function (ok, fail) {
    var t = setTimeout(function () { fail(new Error('timeout')); }, ms);
    promesa.then(function (r) { clearTimeout(t); ok(r); },
                 function (er) { clearTimeout(t); fail(er); });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // WhatsApp, Instagram, etc. pasan directo
  if (esEnVivo(url)) return;                        // datos en vivo: sin caché

  e.respondWith((async function () {
    var cache = await caches.open(CACHE);
    try {
      var red = fetch(req);
      var resp = await (req.mode === 'navigate' ? conEspera(red, ESPERA_RED_MS) : red);
      if (resp && resp.ok) cache.put(req, resp.clone());
      return resp;
    } catch (err) {
      var guardado = await cache.match(req, { ignoreSearch: true });
      if (guardado) return guardado;
      if (req.mode === 'navigate') {
        var inicio = (await cache.match('index.html')) || (await cache.match('./'));
        if (inicio) return inicio;
      }
      return new Response('Sin conexión', { status: 503, statusText: 'Sin conexión' });
    }
  })());
});
