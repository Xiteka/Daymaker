/* Daymaker friend requests are separate from the account's tracker data. */
(() => {
  'use strict';
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

  function setAccount(client, id) {
    if (!id && !account) return;
    if (account?.id === id && account.client === client) return;
    account = client && id ? { client, id, busy: false } : null;
    list.replaceChildren();
    status.textContent = '';
    email.value = '';
    setBusy(false);
  }

  function setBusy(busy) {
    if (account) account.busy = busy;
    refreshButton.disabled = busy;
    sendButton.disabled = busy;
    for (const button of list.querySelectorAll('button')) button.disabled = busy;
  }

  function render(rows) {
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

  async function run(action) {
    const current = account;
    if (!current || current.busy) return;
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
    const { data, error } = await current.client.rpc('daymaker_list_friends');
    if (account !== current) return;
    if (error) {
      status.textContent = message ? `${message} Tap Refresh to update the list.` : 'Friends could not load. Tap Refresh to try again.';
      return;
    }
    render(data || []);
    status.textContent = message;
  }

  async function updateFriend(row, action, label) {
    if (label === 'Remove' && !window.confirm(`Remove ${row.email} from your friends?`)) return;
    await run(async current => {
      const { data, error } = await current.client.rpc('daymaker_update_friend', { p_id: row.id, p_action: action });
      if (account !== current) return;
      if (error) throw error;
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
  window.DaymakerFriends = { setAccount, refresh };
})();
