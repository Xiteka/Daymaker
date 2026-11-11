/* Daymaker friend requests are separate from the account's tracker data. */
(() => {
  'use strict';
  const accountButton = document.querySelector('#account-open');
  const requestAlert = document.querySelector('#friend-request-alert');
  const card = document.querySelector('#account-friends');
  const form = card.querySelector('form');
  const email = form.elements.email;
  const status = card.querySelector('[role="status"]');
  const list = card.querySelector('#friends-list');
  const refreshButton = card.querySelector('#friends-refresh');
  const sendButton = form.querySelector('button');
  const groups = [
    { kind: 'received', title: 'Received requests', actions: [['accept', 'Accept'], ['close', 'Decline']] },
    { kind: 'sent', title: 'Sent requests', actions: [['close', 'Cancel']] },
    { kind: 'friend', title: 'Your friends', actions: [['close', 'Remove']] },
  ];
  let account = null;
  let calendarMonth = null;
  let calendarRows = [];
  let calendarQuery = 0;
  let calendarLoading = false;
  const calendarStatus = document.querySelector('#calendar-friends-status');

  function announceCalendar() {
    window.dispatchEvent(new Event('daymaker-friend-calendar'));
  }

  function clearCalendar() {
    calendarQuery++;
    calendarLoading = false;
    calendarRows = [];
    calendarStatus.textContent = '';
    announceCalendar();
  }

  async function refreshCalendar() {
    const current = account;
    if (!current || !calendarMonth || calendarLoading || document.hidden) return;
    const month = calendarMonth;
    const query = ++calendarQuery;
    calendarLoading = true;
    try {
      const { data, error } = await current.client.rpc('daymaker_friend_calendar', { p_month: month });
      if (account !== current || query !== calendarQuery) return;
      calendarRows = error ? [] : data || [];
      calendarStatus.textContent = error ? 'Could not refresh friends’ calendars. Try Friends → Refresh.' : '';
    } catch {
      if (account !== current || query !== calendarQuery) return;
      calendarRows = [];
      calendarStatus.textContent = 'Could not refresh friends’ calendars. Try Friends → Refresh.';
    } finally {
      if (account === current && query === calendarQuery) {
        calendarLoading = false;
        announceCalendar();
      }
    }
  }

  function calendarForMonth(month) {
    if (month !== calendarMonth) {
      calendarMonth = month;
      calendarQuery++;
      calendarLoading = false;
      calendarRows = [];
      void refreshCalendar();
    }
    return calendarRows;
  }

  function setAccount(client, id) {
    if (!id && !account) return;
    if (account?.id === id && account.client === client) return;
    account = client && id ? { client, id, busy: false, checkingRequests: false, requestVersion: 0 } : null;
    clearCalendar();
    void refreshCalendar();
    setRequestAlert(false);
    list.replaceChildren();
    status.textContent = '';
    email.value = '';
    setBusy(false);
    refreshRequestAlert();
  }

  function setRequestAlert(hasRequests) {
    accountButton.classList.toggle('has-friend-requests', hasRequests);
    document.querySelector('#account-friends-indicator').hidden = !hasRequests;
    const message = hasRequests ? 'New friend requests' : '';
    if (requestAlert.textContent === message) return;
    requestAlert.textContent = message;
    if (hasRequests) accountButton.setAttribute('aria-describedby', requestAlert.id);
    else accountButton.removeAttribute('aria-describedby');
  }

  async function checkRequests() {
    const current = account;
    if (!current || current.busy || current.checkingRequests || document.hidden || !navigator.onLine) return;
    const version = current.requestVersion;
    current.checkingRequests = true;
    try {
      const { data, error } = await current.client.rpc('daymaker_list_friends')
        .eq('kind', 'received').limit(1);
      if (!error && account === current && version === current.requestVersion) {
        setRequestAlert(!!data?.length);
        if (!document.querySelector('#calendar-page').hidden) void refreshCalendar();
      }
    } finally {
      current.checkingRequests = false;
    }
  }

  function setBusy(busy) {
    if (account) account.busy = busy;
    refreshButton.disabled = busy;
    sendButton.disabled = busy;
    for (const button of list.querySelectorAll('button')) button.disabled = busy;
  }

  function render(rows, preferences) {
    const sections = [];
    for (const { kind, title, actions } of groups) {
      const matching = rows.filter(row => row.kind === kind);
      if (!matching.length && kind !== 'friend') continue;
      const section = document.createElement('section');
      const heading = document.createElement('h3');
      heading.textContent = title;
      section.append(heading);
      if (!matching.length) {
        const note = document.createElement('p');
        note.className = 'account-note';
        note.textContent = 'Add someone by email to start your friends list.';
        section.append(note);
      } else {
        const items = document.createElement('ul');
        for (const row of matching) {
          const item = document.createElement('li');
          if (kind === 'friend') {
            renderFriend(item, row, preferences.find(preference => preference.friendship_id === row.id));
            items.append(item);
            continue;
          }
          const name = document.createElement('span');
          name.textContent = row.email;
          const controls = document.createElement('div');
          controls.className = 'account-buttons';
          for (const [action, label] of actions) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = action === 'accept' ? 'primary-button' : 'primary-button account-secondary';
            button.textContent = label;
            button.setAttribute('aria-label', `${label}: ${row.email}`);
            button.addEventListener('click', () => void updateFriend(row, action, label));
            controls.append(button);
          }
          item.append(name, controls);
          items.append(item);
        }
        section.append(items);
      }
      sections.push(section);
    }
    list.replaceChildren(...sections);
  }

  function renderFriend(item, row, preference) {
    const enabled = !!preference?.enabled;
    const peerEnabled = !!preference?.peer_enabled;
    item.className = 'shift-swipe-row friend-swipe-row';
    item.dataset.actionWidth = '64';
    item.tabIndex = 0;
    item.setAttribute('role', 'group');
    item.setAttribute('aria-label', `${row.email}. Swipe right for Delete.`);

    const actions = document.createElement('div');
    actions.className = 'shift-row-actions';
    actions.inert = true;
    actions.setAttribute('aria-hidden', 'true');
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'shift-row-delete';
    remove.textContent = 'Delete';
    remove.setAttribute('aria-label', `Delete friend ${row.email}`);
    remove.addEventListener('click', () => void updateFriend(row, 'close', 'Remove'));
    actions.append(remove);

    const content = document.createElement('div');
    content.className = 'shift-swipe-content friend-row-content';
    const name = document.createElement('div');
    name.className = 'friend-row-name';
    const title = document.createElement('strong');
    title.textContent = row.email;
    const note = document.createElement('small');
    note.textContent = enabled ? peerEnabled ? 'Calendars shared' : 'Waiting for their calendar' : 'Calendar sharing off';
    name.append(title, note);
    const toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'friend-calendar-toggle';
    toggle.setAttribute('role', 'switch');
    toggle.setAttribute('aria-checked', String(enabled));
    toggle.setAttribute('aria-label', `Share calendars with ${row.email}`);
    const knob = document.createElement('span');
    knob.setAttribute('aria-hidden', 'true');
    toggle.append(knob);
    toggle.addEventListener('click', () => void run(async current => {
      const { data, error } = await current.client.rpc('daymaker_set_calendar_sharing', {
        p_id: row.id, p_enabled: !enabled
      });
      if (account !== current) return;
      if (error) throw error;
      clearCalendar();
      await load(current, data ? (!enabled ? 'Calendar sharing enabled.' : 'Calendar sharing turned off.') : 'This friendship has changed.');
    }));
    content.append(name, toggle);
    item.append(actions, content);
  }

  async function run(action) {
    const current = account;
    if (!current || current.busy) return;
    current.requestVersion++;
    setBusy(true);
    status.textContent = 'Checking friends…';
    try {
      await action(current);
    } catch {
      if (account === current) status.textContent = 'Friends could not be updated. Try again.';
    } finally {
      if (account === current) setBusy(false);
    }
  }

  async function load(current, message = '') {
    const [friends, sharing] = await Promise.all([
      current.client.rpc('daymaker_list_friends'),
      current.client.rpc('daymaker_calendar_preferences')
    ]);
    if (account !== current) return;
    const { data, error } = friends;
    if (error || sharing.error) {
      status.textContent = message ? `${message} Tap Refresh to update the list.` : 'Friends could not load. Tap Refresh to try again.';
      return;
    }
    const rows = data || [];
    setRequestAlert(rows.some(row => row.kind === 'received'));
    render(rows, sharing.data || []);
    status.textContent = message;
    void refreshCalendar();
  }

  async function updateFriend(row, action, label) {
    if (label === 'Remove' && !window.confirm(`Remove ${row.email} from your friends?`)) return;
    await run(async current => {
      const { data, error } = await current.client.rpc('daymaker_update_friend', { p_id: row.id, p_action: action });
      if (account !== current) return;
      if (error) throw error;
      clearCalendar();
      const messages = { Accept: 'Friend added.', Decline: 'Request declined.', Cancel: 'Request canceled.', Remove: 'Friend removed.' };
      await load(current, data ? messages[label] : 'That request or friendship has already changed.');
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const target = email.value.trim();
    void run(async current => {
      const { error } = await current.client.rpc('daymaker_request_friend', { p_email: target });
      if (account !== current) return;
      if (error) {
        status.textContent = ['Verify your email first.', 'Enter a valid email address.', 'Enter someone else’s email.', 'Daily friend request limit reached.'].includes(error.message)
          ? error.message : 'Could not send the request. Try again.';
        return;
      }
      email.value = '';
      await load(current, 'Request saved. They can respond in Daymaker.');
    });
  });

  const refresh = () => run(load);
  refreshButton.addEventListener('click', refresh);
  const refreshRequestAlert = () => { void checkRequests().catch(() => {}); };
  document.addEventListener('visibilitychange', refreshRequestAlert);
  window.addEventListener('online', refreshRequestAlert);
  setInterval(refreshRequestAlert, 30000);
  window.DaymakerFriends = { setAccount, refresh, calendarForMonth, refreshCalendar };
})();
