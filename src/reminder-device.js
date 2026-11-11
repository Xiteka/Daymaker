/* Only opt-in state is stored here. Push credentials remain in the browser's PushManager. */
(() => {
  'use strict';
  function open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('daymaker-reminder-device', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('settings');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function read() {
    const database = await open();
    try {
      return await new Promise((resolve, reject) => {
        const transaction = database.transaction('settings', 'readonly');
        const request = transaction.objectStore('settings').get('device');
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
      });
    } finally {
      database.close();
    }
  }
  async function write(value) {
    const database = await open();
    try {
      await new Promise((resolve, reject) => {
        const transaction = database.transaction('settings', 'readwrite');
        transaction.objectStore('settings').put(value, 'device');
        transaction.oncomplete = resolve;
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    } finally {
      database.close();
    }
  }
  globalThis.DaymakerReminderDevice = { read, write };
})();
