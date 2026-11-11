(() => {
  'use strict';
  const status = document.querySelector('#work-reminder-status');
  const enableButton = document.querySelector('#work-reminder-enable');
  const testButton = document.querySelector('#work-reminder-test');
  const device = window.DaymakerReminderDevice;
  let account = null;

  function supportsReminders() {
    return /iPhone|iPod/.test(navigator.userAgent)
      && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone)
      && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function render(message) {
    const enabled = !!account?.enabled;
    enableButton.textContent = enabled ? 'Turn off on this phone' : 'Enable on this phone';
    enableButton.disabled = !account || account.busy || !account.publicKey || !supportsReminders();
    testButton.hidden = !enabled;
    testButton.disabled = !!account?.busy;
    if (message) status.textContent = message;
  }
  async function call(current, body) {
    const { data, error } = await current.client.functions.invoke('daymaker-work-reminders', { body });
    if (error) {
      let message = 'Could not update work reminders. Try again when connected.';
      try { message = (await error.context.json()).error || message; } catch {}
      throw new Error(message);
    }
    if (data?.error) throw new Error(data.error);
    return data;
  }
  async function unsubscribe() {
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (subscription) await subscription.unsubscribe();
  }
  async function turnOff(current, local) {
    try {
      if (local) await device.write({ ...local, enabled: false });
    } finally {
      await unsubscribe();
    }
    if (account === current && current) current.enabled = false;
    if (local?.userId === current?.id) {
      await call(current, { action: 'disable', deviceId: local.deviceId });
    }
  }
  async function prepare(current) {
    current.busy = true;
    render('Checking work reminders…');
    try {
      const local = await device.read();
      if (account !== current) return;
      if (local?.userId && local.userId !== current.id) {
        await turnOff(null, local);
      }
      const { publicKey } = await call(current, { action: 'key' });
      if (account !== current) return;
      current.publicKey = publicKey;
      current.enabled = false;
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (account !== current) return;
      if (local?.userId === current.id && local.enabled && subscription && Notification.permission === 'granted') {
        const result = await call(current, {
          action: 'status', deviceId: local.deviceId, endpoint: subscription.endpoint
        });
        if (account !== current) return;
        current.enabled = !!result.enabled;
        if (!current.enabled) await device.write({ ...local, enabled: false });
      }
      render(current.enabled
        ? `On · 60 minutes before work · ${local.timezone}`
        : Notification.permission === 'denied'
          ? 'Notifications are blocked. Allow Daymaker in iPhone Settings → Notifications, then try again.'
          : 'Off · Remind me 60 minutes before work.');
    } catch (error) {
      if (account === current) render(error.message || 'Could not check work reminders.');
    } finally {
      if (account === current) { current.busy = false; render(); }
    }
  }
  function setAccount(client, id) {
    if ((!id && !account) || (account?.id === id && account.client === client)) return;
    const previous = account;
    account = client && id ? { client, id, enabled: false, busy: false, publicKey: null } : null;
    if (!account) {
      render('Log in to enable work reminders.');
      void device.read().then(local => turnOff(previous, local)).catch(() => unsubscribe().catch(() => {}));
      return;
    }
    if (!supportsReminders()) {
      render('Open Daymaker from your iPhone Home Screen to enable work reminders.');
      return;
    }
    void prepare(account);
  }
  function applicationKey(value) {
    const padded = value.replace(/-/g, '+').replace(/_/g, '/');
    return Uint8Array.from(atob(padded), character => character.charCodeAt(0));
  }
  enableButton.addEventListener('click', () => {
    const current = account;
    if (!current || current.busy || !current.publicKey) return;
    if (current.enabled) {
      current.busy = true;
      render('Turning off work reminders…');
      void device.read().then(local => turnOff(current, local)).then(() => {
        if (account !== current) return;
        current.enabled = false;
        render('Off · Remind me 60 minutes before work.');
      }).catch(error => {
        if (account === current) render(error.message);
      }).finally(() => {
        if (account === current) { current.busy = false; render(); }
      });
      return;
    }
    // Request permission directly from this tap, using the key fetched in prepare().
    const permission = Notification.requestPermission();
    current.busy = true;
    render('Allow notifications on this iPhone to continue.');
    void (async () => {
      let registered = false;
      try {
        if (await permission !== 'granted') {
          render('Notifications were not allowed. You can enable them in iPhone Settings.');
          return;
        }
        if (account !== current) return;
        const registration = await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true, applicationServerKey: applicationKey(current.publicKey)
        });
        if (account !== current) { await subscription.unsubscribe(); return; }
        const previous = await device.read();
        const local = {
          deviceId: previous?.userId === current.id ? previous.deviceId : crypto.randomUUID(),
          userId: current.id, enabled: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
        await device.write(local);
        await call(current, {
          action: 'register', deviceId: local.deviceId,
          subscription: subscription.toJSON(), timezone: local.timezone
        });
        if (account !== current) { await subscription.unsubscribe(); return; }
        await device.write({ ...local, enabled: true });
        registered = true;
        current.enabled = true;
        render(`On · 60 minutes before work · ${local.timezone}`);
      } catch (error) {
        if (!registered) await unsubscribe().catch(() => {});
        if (account === current) render(error.message || 'Could not enable reminders on this iPhone.');
      } finally {
        if (account === current) { current.busy = false; render(); }
      }
    })();
  });
  testButton.addEventListener('click', () => {
    const current = account;
    if (!current?.enabled || current.busy) return;
    current.busy = true;
    render('Sending a test notification…');
    void device.read().then(local => call(current, { action: 'test', deviceId: local.deviceId }))
      .then(() => { if (account === current) render('Test notification sent to this iPhone.'); })
      .catch(error => { if (account === current) render(error.message); })
      .finally(() => { if (account === current) { current.busy = false; render(); } });
  });
  const refresh = () => {
    if (account && supportsReminders() && !account.busy) return prepare(account);
  };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  async function disableForSignOut() {
    try {
      const local = await device.read();
      if (local?.enabled) await turnOff(account, local);
    } catch {
      await unsubscribe().catch(() => {});
    }
  }
  window.DaymakerReminders = { setAccount, refresh, disableForSignOut };
})();
