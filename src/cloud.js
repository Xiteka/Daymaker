/* Daymaker account sync. The original daymark-tracker-v1 record is never renamed or removed. */
(() => {
  'use strict';
  const LEGACY = 'daymark-tracker-v1';
  const ACTIVE = 'daymaker-active-account-v1';
  const CLAIM = 'daymaker-device-data-owner-v1';
  const BACKUP = 'daymaker-original-device-backup-v1';
  const PREFIX = 'daymaker-account-v1:';
  const COLLECTIONS = ['shifts', 'expenses', 'monthlyExpenses', 'wishes', 'wishFolders'];
  const defaults = () => ({ rate: 220, paydayDay: 25, profileName: '', shifts: [], expenses: [], monthlyExpenses: [], wishes: [], wishFolders: [] });
  const copy = value => JSON.parse(JSON.stringify(value));
  const canonical = value => JSON.stringify(value, (_, v) => v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map(k => [k, v[k]])) : v);
  const same = (a, b) => canonical(a) === canonical(b);
  const readJSON = key => { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; };
  const normalize = input => {
    const value = { ...defaults(), ...input };
    value.profileName = typeof value.profileName === 'string' ? value.profileName : '';
    for (const name of COLLECTIONS) {
      if (!Array.isArray(value[name]) || value[name].some(item => !item || typeof item.id !== 'string')) throw new Error('A saved record needs attention. Download a backup before continuing.');
    }
    return value;
  };
  let owner = localStorage.getItem(ACTIVE);
  let client = null;
  let session = null;
  let hooks = null;
  let busy = false;
  let queued = false;
  let timer;
  let status = 'Saved on this device';
  let conflict = null;
  let authMode = 'login';
  let recovery = false;
  let nameDraft = false;
  let nameOwner = null;
  const $ = selector => document.querySelector(selector);
  const cacheFor = id => readJSON(PREFIX + id);
  const writeCache = (id, cache) => localStorage.setItem(PREFIX + id, JSON.stringify(cache));
  const backupEntry = (reason, document) => ({ id: crypto.randomUUID(), reason, document: copy(document) });
  const preserveOriginal = () => {
    const raw = localStorage.getItem(LEGACY);
    if (raw && !localStorage.getItem(BACKUP)) localStorage.setItem(BACKUP, raw);
  };
  // Compare individual records, not whole lists. Deletions only win if the other device did not edit the record.
  function merge(base, local, remote, preference) {
    base = normalize(base); local = normalize(local); remote = normalize(remote);
    const result = copy(remote);
    const conflicts = [];
    const choose = (before, here, there, label) => {
      if (same(here, before)) return there;
      if (same(there, before) || same(here, there)) return here;
      conflicts.push(label);
      return preference === 'local' ? here : there;
    };
    for (const key of ['rate', 'paydayDay', 'profileName']) result[key] = choose(base[key], local[key], remote[key], { rate: 'Hourly rate', paydayDay: 'Payday', profileName: 'Name or nickname' }[key]);
    for (const key of COLLECTIONS) {
      const maps = [base, local, remote].map(doc => new Map(doc[key].map(item => [item.id, item])));
      const ids = new Set([...maps[2].keys(), ...maps[1].keys(), ...maps[0].keys()]);
      result[key] = [];
      for (const id of ids) {
        const values = maps.map(map => map.get(id));
        const item = values[1] || values[2] || values[0];
        const chosen = choose(...values, item.title || item.note || item.name || (key === 'shifts' ? `Shift ${item.date}` : key));
        if (chosen !== undefined) result[key].push(copy(chosen));
      }
    }
    return { document: normalize(result), conflicts: [...new Set(conflicts)] };
  }
  const configured = () => {
    const config = window.DAYMAKER_SUPABASE;
    return config && /^https:\/\/[a-z0-9]+\.supabase\.co$/.test(config.url) && config.publishableKey.startsWith('sb_publishable_');
  };
  function updateUI(message) {
    if (message) status = message;
    if (!hooks) return;
    const signedIn = !!session?.user;
    const nickname = String(hooks.read().profileName || '').trim();
    const displayName = (nickname || session?.user.email?.split('@')[0] || 'Account').slice(0, 10);
    $('#account-open').textContent = signedIn ? displayName : 'Log in';
    $('#account-open').setAttribute('aria-label', signedIn ? `Open account for ${displayName}` : 'Log in');
    $('#account-open').title = signedIn ? displayName : 'Log in';
    if (nameOwner !== (session?.user.id || null)) { nameOwner = session?.user.id || null; nameDraft = false; }
    if (!nameDraft) $('#account-nickname').value = signedIn ? displayName.slice(0, 10) : '';
    $('#account-email').textContent = session?.user.email || '';
    $('#account-signed-in').hidden = !session?.user;
    $('#account-settings-guest').hidden = !!session?.user;
    $('#account-auth-section').hidden = !!session?.user && !recovery;
    $('#account-status').textContent = status;
    $('#account-status').classList.toggle('account-status-saved', status === 'Saved to your account');
    $('#account-conflict').hidden = !conflict;
    $('#account-conflict-items').textContent = conflict ? conflict.names.join(', ') : '';
    $('#account-sync').disabled = busy || !!conflict;
    $('#account-signout').disabled = busy;
    $('#auth-submit').disabled = !configured();
    $('#auth-password').autocomplete = authMode === 'signup' || recovery ? 'new-password' : 'current-password';
    $('#auth-password').minLength = authMode === 'signup' || recovery ? 8 : 1;
    $('#auth-title').textContent = recovery ? 'Choose a new password' : authMode === 'signup' ? 'Make yourself at home.' : 'Welcome back.';
    $('#auth-submit').textContent = recovery ? 'Save password' : authMode === 'signup' ? 'Create account' : 'Log in';
    $('#auth-mode-toggle').textContent = authMode === 'signup' ? 'Already have an account? Log in' : 'New here? Create an account';
    $('#auth-mode-toggle').hidden = recovery;
    $('#auth-forgot').hidden = recovery || authMode === 'signup';
    $('#auth-email-field').hidden = recovery;
    $('#auth-email').required = !recovery;
  }
  function showDocument(document) { hooks.replace(copy(document)); }
  function scheduleSync() {
    clearTimeout(timer);
    timer = setTimeout(() => { void sync(); }, 600);
  }
  function localDocument() {
    const cache = owner && cacheFor(owner);
    return cache ? cache.local : readJSON(LEGACY) || defaults();
  }
  function save(document) {
    // A sign-out in another tab must not direct a stale account edit into guest storage.
    if (localStorage.getItem(ACTIVE) !== owner) throw new Error('The account changed in another tab. Reopen Daymaker before editing.');
    if (owner) {
      const cache = cacheFor(owner);
      if (!cache) throw new Error('Account storage is unavailable. Download a backup before closing Daymaker.');
      cache.local = copy(document);
      writeCache(owner, cache);
      updateUI('Saved on this device · waiting to sync');
      scheduleSync();
    } else localStorage.setItem(LEGACY, JSON.stringify(document));
  }
  async function activate(nextSession) {
    session = nextSession;
    conflict = null;
    const id = session?.user.id || null;
    if (owner !== id) hooks.closeEditors();
    if (!id) {
      owner = null;
      localStorage.removeItem(ACTIVE);
      showDocument(readJSON(LEGACY) || defaults());
      updateUI('Saved on this device · log in to sync');
      return;
    }
    if (owner !== id || !cacheFor(id)) {
      preserveOriginal();
      const guest = normalize(readJSON(LEGACY) || defaults());
      const claimed = localStorage.getItem(CLAIM);
      const mayImport = !claimed || claimed === id;
      let cache = cacheFor(id);
      if (!cache) {
        cache = { local: mayImport ? copy(guest) : defaults(), base: defaults(), revision: 0, guestBase: mayImport ? copy(guest) : null, backups: mayImport ? [backupEntry('Original device data before first login', guest)] : [] };
      } else if (mayImport && cache.guestBase && !same(guest, cache.guestBase)) {
        const imported = merge(cache.guestBase, guest, cache.local);
        if (imported.conflicts.length) conflict = { kind: 'guest', names: imported.conflicts, guest, base: cache.guestBase, local: cache.local };
        else {
          cache.backups.push(backupEntry('Device data before importing new guest changes', guest));
          cache.local = imported.document;
          cache.guestBase = copy(guest);
        }
      }
      writeCache(id, cache);
      if (mayImport) localStorage.setItem(CLAIM, id);
      owner = id;
      localStorage.setItem(ACTIVE, id);
      showDocument(cache.local);
      if (!mayImport) hooks.notify('Existing device data belongs to another account and has been kept separate.');
    }
    updateUI('Signed in · syncing your data…');
    await sync();
  }
  async function uploadBackups(id) {
    const cache = cacheFor(id);
    const backups = cache.backups || [];
    if (!backups.length) return;
    const { error } = await client.from('daymaker_backups').upsert(backups.map(item => ({ ...item, user_id: id })), { onConflict: 'id', ignoreDuplicates: true });
    if (error) throw error;
    if (owner !== id) return;
    const latest = cacheFor(id);
    latest.backups = latest.backups.filter(item => !backups.some(saved => saved.id === item.id));
    writeCache(id, latest);
  }
  async function sync(resolution = null) {
    if (!client || !session?.user || owner !== session.user.id || conflict?.kind === 'guest') { updateUI(); return; }
    if (conflict && !resolution) return;
    if (busy) { queued = true; return; }
    if (!navigator.onLine) { updateUI('Offline · changes are saved on this device'); return; }
    busy = true;
    const id = owner;
    updateUI('Saving to your account…');
    try {
      for (let attempt = 0; attempt < 4; attempt++) {
        const { data: remoteRow, error: readError } = await client.from('daymaker_accounts').select('document,revision').eq('user_id', id).maybeSingle();
        if (readError) throw readError;
        if (owner !== id || session?.user.id !== id) return;
        const cache = cacheFor(id);
        const captured = copy(cache.local);
        const remote = normalize(remoteRow?.document || defaults());
        const revision = remoteRow?.revision || 0;
        const choiceValid = resolution && resolution.revision === revision && same(resolution.local, captured);
        const merged = merge(cache.base, captured, remote, choiceValid ? resolution.choice : undefined);
        if (merged.conflicts.length && !choiceValid) {
          conflict = { kind: 'cloud', names: merged.conflicts, local: captured, remote, revision };
          updateUI('Two versions need your choice · both are still saved');
          return;
        }
        if (choiceValid) {
          cache.backups.push(backupEntry('This device before resolving a sync conflict', captured), backupEntry('Account before resolving a sync conflict', remote));
          writeCache(id, cache);
        }
        await uploadBackups(id);
        if (owner !== id) return;
        let result = { saved: true, document: remote, revision };
        if (!remoteRow || !same(merged.document, remote)) {
          const { data, error } = await client.rpc('daymaker_save', { p_expected_revision: revision, p_document: merged.document });
          if (error) throw error;
          result = data;
        }
        if (owner !== id || session?.user.id !== id) return;
        if (!result?.saved) { resolution = null; continue; }
        const latest = cacheFor(id);
        // Keep edits made while the request was in flight, then send them on the next pass.
        const pending = merge(captured, latest.local, normalize(result.document), 'local').document;
        latest.base = normalize(result.document);
        latest.local = pending;
        latest.revision = result.revision;
        writeCache(id, latest);
        conflict = null;
        showDocument(pending);
        updateUI('Saved to your account');
        if (!same(latest.local, latest.base)) queued = true;
        return;
      }
      updateUI('Another device is saving · your changes are kept here. Try Sync now.');
    } catch (error) {
      const message = error?.code === '42P01' || error?.code === 'PGRST202' ? 'Account setup is unfinished · your device data is safe' : 'Could not sync · changes are saved on this device. Try again when connected.';
      updateUI(message);
    } finally {
      busy = false;
      updateUI();
      if (queued) { queued = false; scheduleSync(); }
    }
  }
  function download(value, filename) {
    const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url; link.download = filename; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  async function resolveConflict(choice) {
    const current = conflict;
    if (!current || !owner) return;
    if (current.kind === 'guest') {
      const cache = cacheFor(owner);
      cache.backups.push(backupEntry('Guest data before resolving an import conflict', current.guest), backupEntry('Account cache before resolving an import conflict', cache.local));
      cache.local = merge(current.base, current.guest, cache.local, choice).document;
      cache.guestBase = current.guest;
      writeCache(owner, cache);
      conflict = null;
      showDocument(cache.local);
      await sync();
    } else await sync({ choice, revision: current.revision, local: current.local });
  }
  async function start(callbacks) {
    hooks = callbacks;
    $('#account-open').addEventListener('click', () => { updateUI(); hooks.openAccount(); });
    $('#account-nickname').addEventListener('input', event => { nameDraft = true; event.target.setCustomValidity(''); });
    $('#account-profile-form').addEventListener('submit', event => {
      event.preventDefault();
      if (!session?.user || owner !== session.user.id) return;
      const field = $('#account-nickname');
      const name = field.value.trim().replace(/\s+/g, ' ');
      field.setCustomValidity(!name ? 'Enter a name or nickname.' : name.length > 10 ? 'Use 10 characters or fewer.' : '');
      if (!event.currentTarget.reportValidity()) return;
      if (!hooks.saveName(name)) return;
      nameDraft = false;
      updateUI();
      field.blur();
      hooks.notify('Name saved.');
    });
    document.querySelectorAll('[data-account-settings]').forEach(button => button.addEventListener('click', () => hooks.openSettings()));
    $('#account-sync').addEventListener('click', () => void sync());
    $('#account-backup').addEventListener('click', () => download({ exportedAt: new Date().toISOString(), current: hooks.read(), originalDevice: readJSON(BACKUP) || readJSON(LEGACY), accountCache: owner ? cacheFor(owner) : null }, 'daymaker-device-backup.json'));
    $('#account-cloud-backups').addEventListener('click', async () => {
      try {
        const { data, error } = await client.from('daymaker_backups').select('reason,document,created_at').eq('user_id', session.user.id).order('created_at', { ascending: false });
        if (error) throw error;
        download(data, 'daymaker-account-backups.json');
      } catch { hooks.notify('Backups could not download. Please try again when connected.'); }
    });
    for (const button of document.querySelectorAll('[data-resolve-sync]')) button.addEventListener('click', () => void resolveConflict(button.dataset.resolveSync));
    $('#auth-mode-toggle').addEventListener('click', () => { authMode = authMode === 'login' ? 'signup' : 'login'; $('#auth-message').textContent = ''; updateUI(); });
    $('#account-signout').addEventListener('click', async () => {
      const { error } = await client.auth.signOut({ scope: 'local' });
      if (error) { hooks.notify('Could not log out. Please try again.'); return; }
      recovery = false;
      await activate(null);
      hooks.notify('Logged out. Account data and device backups are kept.');
    });
    $('#auth-form').addEventListener('submit', async event => {
      event.preventDefault();
      if (!client) return;
      const button = $('#auth-submit');
      button.disabled = true;
      $('#auth-message').textContent = '';
      try {
        const email = $('#auth-email').value.trim();
        const password = $('#auth-password').value;
        const redirect = new URL('./', location.href).href;
        const result = recovery ? await client.auth.updateUser({ password })
          : authMode === 'signup' ? await client.auth.signUp({ email, password, options: { emailRedirectTo: redirect } })
            : await client.auth.signInWithPassword({ email, password });
        if (result.error) throw result.error;
        $('#auth-password').value = '';
        if (recovery) { recovery = false; updateUI(); hooks.notify('Password updated.'); }
        else if (result.data.session) { await activate(result.data.session); updateUI(); }
        else $('#auth-message').textContent = 'Check your email to confirm your account, then come back and log in.';
      } catch (error) { $('#auth-message').textContent = error.message || 'Could not log in. Please try again.'; }
      finally { button.disabled = false; }
    });
    $('#auth-forgot').addEventListener('click', async () => {
      if (!$('#auth-email').reportValidity() || !client) return;
      const { error } = await client.auth.resetPasswordForEmail($('#auth-email').value.trim(), { redirectTo: new URL('./', location.href).href });
      $('#auth-message').textContent = error ? error.message : 'If this email has an account, a reset link will arrive shortly.';
    });
    updateUI(configured() ? 'Saved on this device · log in to sync' : 'Cloud login is being set up. Your device data stays here.');
    if (!configured() || !window.supabase) return;
    client = window.supabase.createClient(window.DAYMAKER_SUPABASE.url, window.DAYMAKER_SUPABASE.publishableKey, { auth: { storageKey: 'daymaker-supabase-auth-v1', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }, global: { fetch: (url, options) => fetch(url, { ...options, signal: AbortSignal.timeout(20000) }) } });
    // Keep database calls outside Supabase's auth callback lock.
    client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'PASSWORD_RECOVERY') recovery = true;
      setTimeout(() => {
        if (event === 'PASSWORD_RECOVERY') { updateUI(); hooks.openAccount(); }
        if (owner !== (nextSession?.user.id || null)) void activate(nextSession).catch(() => updateUI('Could not switch accounts safely. Your saved data is kept here.'));
        else { session = nextSession; updateUI(); if (nextSession) scheduleSync(); }
      }, 0);
    });
    const { data, error } = await client.auth.getSession();
    if (!error) await activate(data.session);
    else updateUI('Could not check login · your data stays on this device');
    window.addEventListener('online', scheduleSync);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) scheduleSync(); });
    window.addEventListener('storage', event => {
      if (event.key === ACTIVE) { hooks.closeEditors(); owner = localStorage.getItem(ACTIVE); conflict = null; showDocument(localDocument()); updateUI(); }
      else if (owner && event.key === PREFIX + owner) { showDocument(localDocument()); scheduleSync(); }
    });
    setInterval(() => { if (!document.hidden) scheduleSync(); }, 30000);
  }
  window.DaymakerCloud = { loadLocal: localDocument, save, start };
})();
