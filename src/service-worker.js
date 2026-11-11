importScripts('./reminder-device.js?v=1');
const CACHE_NAME = 'daymaker-shell-v71';
const SHELL = [
  './', './index.html', './style.css?v=59', './app.js?v=55', './cloud.js?v=9', './friends.js?v=4', './supabase-config.js?v=1', './reminder-device.js?v=1', './reminders.js?v=2', './vendor/supabase-2.119.0.js', './manifest.webmanifest?v=2',
  './icons/daymaker-bold.svg', './icons/daymaker-bold-180.png', './icons/daymaker-bold-192.png', './icons/daymaker-bold-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))));
  self.clients.claim();
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || new URL(request.url).origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).then(response => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then(cache => cache.put('./index.html', copy));
      return response;
    }).catch(() => caches.match('./index.html')));
    return;
  }
  event.respondWith(caches.match(request).then(cached => cached || fetch(request)));
});

self.addEventListener('push', event => {
  event.waitUntil((async () => {
    let message;
    try { message = event.data?.json(); } catch { return; }
    const device = await self.DaymakerReminderDevice.read();
    if (!device?.enabled || device.userId !== message?.userId || !Number.isFinite(message?.expiresAt) || message.expiresAt <= Date.now()) return;
    if (typeof message.title !== 'string' || typeof message.body !== 'string') return;
    await self.registration.showNotification(message.title, {
      body: message.body,
      icon: new URL('./icons/daymaker-bold-192.png', self.registration.scope).href,
      tag: message.tag,
      data: { date: message.date, userId: message.userId }
    });
  })());
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const device = await self.DaymakerReminderDevice.read();
    const message = event.notification.data || {};
    const allowed = device?.enabled && device.userId === message.userId;
    const date = allowed && /^\d{4}-\d{2}-\d{2}$/.test(message.date || '') ? message.date : null;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const app = windows.find(client => client.url.startsWith(self.registration.scope));
    if (app) {
      await app.focus();
      if (date) app.postMessage({ type: 'daymaker-work-reminder', date });
    } else {
      const url = new URL('./', self.registration.scope);
      if (date) url.hash = `work-reminder=${date}`;
      await self.clients.openWindow(url.href);
    }
  })());
});
