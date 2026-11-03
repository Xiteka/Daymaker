const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'daymark-tracker-v1';
const dateKey = date => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fresh = () => ({ rate: 220, shifts: [], expenses: [], wishes: [] });
let state;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  state = saved && typeof saved === 'object'
    ? { ...fresh(), ...saved, shifts: Array.isArray(saved.shifts) ? saved.shifts : [], expenses: Array.isArray(saved.expenses) ? saved.expenses : [], wishes: Array.isArray(saved.wishes) ? saved.wishes : [] }
    : fresh();
} catch { state = fresh(); }

const money = value => new Intl.NumberFormat('nb-NO', { style: 'currency', currency: 'NOK', maximumFractionDigits: 0 }).format(value || 0).replace(/\s/g, ' ');
// Draw key numbers as a dot matrix while keeping their full text accessible.
const balanceDigits = {
  '0': ['01110','10001','10001','10001','10001','10001','01110'],
  '1': ['00100','01100','00100','00100','00100','00100','01110'],
  '2': ['01110','10001','00001','00010','00100','01000','11111'],
  '3': ['11110','00001','00001','01110','00001','00001','11110'],
  '4': ['00010','00110','01010','10010','11111','00010','00010'],
  '5': ['11111','10000','10000','11110','00001','00001','11110'],
  '6': ['01110','10000','10000','11110','10001','10001','01110'],
  '7': ['11111','00001','00010','00100','01000','01000','01000'],
  '8': ['01110','10001','10001','01110','10001','10001','01110'],
  '9': ['01110','10001','10001','01111','00001','00001','01110'],
  '-': ['00000','00000','00000','11111','00000','00000','00000'],
  '.': ['0','0','0','0','0','0','1']
};
const wholeNumber = value => new Intl.NumberFormat('nb-NO', { maximumFractionDigits: 0 }).format(value || 0).replace(/−/g, '-');
function renderDotValue(node, formatted, label, unit, kind) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', `${kind}-number`);
  svg.setAttribute('aria-hidden', 'true');
  let offset = 0;
  for (const character of formatted) {
    if (/\s/.test(character)) { offset += 2; continue; }
    const rows = balanceDigits[character];
    if (!rows) { node.removeAttribute('role'); node.removeAttribute('aria-label'); node.textContent = label; return; }
    rows.forEach((row, y) => [...row].forEach((dot, x) => {
      if (dot !== '1') return;
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', offset + x + 0.5);
      circle.setAttribute('cy', y + 0.5);
      circle.setAttribute('r', '0.43');
      svg.appendChild(circle);
    }));
    offset += rows[0].length + 1;
  }
  const width = Math.max(1, offset - 1);
  svg.setAttribute('viewBox', `0 0 ${width} 7`);
  svg.setAttribute('width', width);
  svg.setAttribute('height', '7');
  const currency = document.createElement('span');
  currency.className = `${kind}-currency`;
  currency.setAttribute('aria-hidden', 'true');
  currency.textContent = unit;
  node.setAttribute('role', 'img');
  node.setAttribute('aria-label', label);
  node.replaceChildren(svg, currency);
}
const longDate = value => new Date(`${value}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const monthKey = dateKey().slice(0, 7);
const monthEntries = entries => entries.filter(item => item.date?.startsWith(monthKey));
const earnedFor = shift => Number(shift.hours) * Number(shift.rate);
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const persist = () => { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); render(); };
const empty = (title, hint, symbol = '✳') => `<div class="empty-state"><span>${symbol}</span><strong>${title}</strong><p>${hint}</p></div>`;
let toastTimer;
function toast(message) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 2200);
}

function render() {
  const shifts = monthEntries(state.shifts);
  const expenses = monthEntries(state.expenses);
  const hours = shifts.reduce((sum, item) => sum + Number(item.hours), 0);
  const earned = shifts.reduce((sum, item) => sum + earnedFor(item), 0);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  $('#month-label').textContent = `YOUR MONEY THIS ${new Date().toLocaleDateString('en-GB', { month: 'long' }).toUpperCase()}`;
  $('#today-label').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  $('#date-stamp').textContent = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
  renderDotValue($('#balance-value'), wholeNumber(earned - spent), money(earned - spent), 'kr', 'balance');
  $('#earned-value').textContent = money(earned);
  $('#spent-value').textContent = money(spent);
  const hoursText = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  renderDotValue($('#hours-value'), hoursText, `${hoursText} h`, 'h', 'stat');
  $('#shift-count').textContent = shifts.length ? `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'} this month` : 'No shifts logged yet';
  renderDotValue($('#expense-value'), wholeNumber(spent), money(spent), 'kr', 'stat');
  $('#expense-count').textContent = expenses.length ? `${expenses.length} ${expenses.length === 1 ? 'purchase' : 'purchases'} this month` : 'No spending logged yet';
  $('#balance-progress').style.width = `${earned ? Math.max(3, Math.min(100, ((earned - spent) / earned) * 100)) : 0}%`;
  $('#work-month-hours').textContent = `${Number.isInteger(hours) ? hours : hours.toFixed(1)} h`;
  $('#work-month-pay').textContent = money(earned);
  $('#work-rate').innerHTML = `${money(state.rate)}<span class="small-unit">/h</span>`;
  $('#expenses-month-total').textContent = money(spent);
  $('#expenses-month-note').textContent = expenses.length ? `${expenses.length} purchases recorded this month` : 'Your spending, all in one place.';
  renderCalendar(); renderShifts(); renderExpenses(); renderWishes(); renderActivity();
}

// Calendar totals are based on every shift logged for each local date.
const calendarStart = new Date();
let calendarMonth = new Date(calendarStart.getFullYear(), calendarStart.getMonth(), 1);
let calendarDay = null;
let calendarTotals = new Map();
let calendarHoldTimer;
const calendarHours = hours => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2 }).format(hours);
const calendarDateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function showCalendarDay(date) {
  calendarDay = date;
  const total = calendarTotals.get(date) || { hours: 0, pay: 0 };
  const detail = $('#calendar-detail');
  detail.innerHTML = `<div class="calendar-detail-date">${calendarDateLabel(date)}</div><div class="calendar-detail-stats"><div><span>WORKED</span><strong>${calendarHours(total.hours)} h</strong></div><div><span>ESTIMATED PAY</span><strong>${money(total.pay)}</strong></div></div>`;
  $('#calendar-grid').querySelectorAll('.calendar-day').forEach(button => {
    const selected = button.dataset.date === date;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const button = $('#calendar-grid').querySelector(`[data-date="${date}"]`);
  if (button) {
    const popover = $('#calendar-popover');
    popover.innerHTML = detail.innerHTML;
    popover.hidden = false;
    const tile = button.getBoundingClientRect();
    const popup = popover.getBoundingClientRect();
    const left = Math.max(12, Math.min(tile.left + (tile.width - popup.width) / 2, window.innerWidth - popup.width - 12));
    const above = tile.top - popup.height - 8;
    const top = above >= 12 ? above : Math.min(tile.bottom + 8, window.innerHeight - popup.height - 12);
    popover.style.left = `${left}px`;
    popover.style.top = `${Math.max(12, top)}px`;
  }
}

function renderCalendar() {
  calendarTotals = new Map();
  for (const shift of state.shifts) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(shift.date || '')) continue;
    const total = calendarTotals.get(shift.date) || { hours: 0, pay: 0 };
    total.hours += Number(shift.hours) || 0;
    total.pay += (Number(shift.hours) || 0) * (Number(shift.rate) || 0);
    calendarTotals.set(shift.date, total);
  }
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthLabel = calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const workedDays = [...calendarTotals.keys()].filter(date => date.startsWith(monthPrefix + '-')).length;
  $('#calendar-popover').hidden = true;
  $('#calendar-month').textContent = monthLabel;
  $('#calendar-count').textContent = `${workedDays} ${workedDays === 1 ? 'day' : 'days'} worked`;
  $('#calendar-grid').setAttribute('aria-label', `Work calendar for ${monthLabel}`);
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tiles = Array(leadingDays).fill('<span class="calendar-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const total = calendarTotals.get(date) || { hours: 0, pay: 0 };
    const worked = calendarTotals.has(date);
    const today = date === dateKey();
    const label = `${calendarDateLabel(date)}, ${calendarHours(total.hours)} hours worked, ${money(total.pay)} estimated pay`;
    tiles.push(`<button type="button" class="calendar-day${worked ? ' worked' : ''}${today ? ' today' : ''}" data-date="${date}" aria-label="${esc(label)}" aria-pressed="false">${day}</button>`);
  }
  $('#calendar-grid').innerHTML = tiles.join('');
  if (calendarDay && calendarDay.startsWith(monthPrefix + '-')) showCalendarDay(calendarDay);
  else {
    calendarDay = null;
    $('#calendar-detail').innerHTML = '<p class="calendar-hint">Tap or hold a day to see your hours and pay.</p>';
  }
}

function changeCalendarMonth(amount) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + amount, 1);
  calendarDay = null;
  renderCalendar();
}
$('#calendar-prev').addEventListener('click', () => changeCalendarMonth(-1));
$('#calendar-next').addEventListener('click', () => changeCalendarMonth(1));
const calendarGrid = $('#calendar-grid');
calendarGrid.addEventListener('pointerover', event => {
  const day = event.target.closest('.calendar-day');
  if (day && (event.pointerType === 'mouse' || event.pointerType === 'pen')) showCalendarDay(day.dataset.date);
});
calendarGrid.addEventListener('pointerleave', event => {
  if (event.pointerType === 'mouse' || event.pointerType === 'pen') $('#calendar-popover').hidden = true;
});
window.addEventListener('scroll', () => { $('#calendar-popover').hidden = true; }, { passive: true });
window.addEventListener('resize', () => { $('#calendar-popover').hidden = true; });
calendarGrid.addEventListener('focusin', event => {
  const day = event.target.closest('.calendar-day');
  if (day) showCalendarDay(day.dataset.date);
});
calendarGrid.addEventListener('pointerdown', event => {
  const day = event.target.closest('.calendar-day');
  if (!day || event.pointerType !== 'touch') return;
  clearTimeout(calendarHoldTimer);
  calendarHoldTimer = setTimeout(() => showCalendarDay(day.dataset.date), 350);
});
for (const eventName of ['pointerup', 'pointercancel']) calendarGrid.addEventListener(eventName, () => clearTimeout(calendarHoldTimer));
calendarGrid.addEventListener('click', event => {
  const day = event.target.closest('.calendar-day');
  if (day) showCalendarDay(day.dataset.date);
});
calendarGrid.addEventListener('contextmenu', event => {
  if (event.target.closest('.calendar-day')) event.preventDefault();
});

function renderShifts() {
  const rows = [...state.shifts].sort((a, b) => b.date.localeCompare(a.date));
  $('#shift-list').innerHTML = rows.length ? rows.map(item => `<article class="record-row"><span class="record-icon work-icon">◷</span><div class="record-main"><strong>${esc(item.note || 'Work shift')}</strong><span>${longDate(item.date)} · ${Number(item.hours)} hours at ${money(item.rate)}/h</span></div><div class="record-amount">${money(earnedFor(item))}</div><button class="delete-button" data-delete="shift" data-id="${esc(item.id)}" aria-label="Delete shift">×</button></article>`).join('') : empty('Your hours will add up here', 'Log a shift to see your time and estimated pay.', '◷');
}

function renderExpenses() {
  const rows = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
  $('#expense-list').innerHTML = rows.length ? rows.map(item => `<article class="record-row"><span class="record-icon expense-icon">${item.category === 'Food' ? '⌁' : item.category === 'Transport' ? '↗' : '↘'}</span><div class="record-main"><strong>${esc(item.title)}</strong><span>${longDate(item.date)} · ${esc(item.category)}</span></div><div class="record-amount expense-amount">−${money(item.amount)}</div><button class="delete-button" data-delete="expense" data-id="${esc(item.id)}" aria-label="Delete expense">×</button></article>`).join('') : empty('A clear picture starts here', 'Add an expense when you want to keep track.', '↘');
}

function wishCard(item, index) {
  const ratio = Math.max(0, Math.min(100, Number(item.saved) / Number(item.target) * 100));
  const colors = ['wish-peach', 'wish-mint', 'wish-lilac', 'wish-yellow'];
  return `<article class="wish-card ${colors[index % colors.length]}"><div class="wish-top"><span class="wish-glyph">${['✳', '♡', '✦', '✿'][index % 4]}</span><button class="delete-button" data-delete="wish" data-id="${esc(item.id)}" aria-label="Delete wish">×</button></div><h3>${esc(item.title)}</h3><div class="wish-amounts"><strong>${money(item.saved)}</strong><span>of ${money(item.target)}</span></div><div class="wish-progress"><span style="width:${ratio}%"></span></div><div class="wish-card-foot"><p>${ratio >= 100 ? 'You made it! ✨' : `${Math.round(ratio)}% saved`}</p><button class="save-more" data-add-saving="${esc(item.id)}" type="button">＋ Add</button></div></article>`;
}

function renderWishes() {
  const wishes = state.wishes;
  const total = wishes.reduce((sum, item) => sum + Number(item.target), 0);
  $('#wish-total').textContent = `${wishes.length} ${wishes.length === 1 ? 'thing' : 'things'}`;
  $('#wishlist-list').innerHTML = wishes.length ? wishes.map(wishCard).join('') : empty('Your next good thing goes here', 'Add something you are looking forward to.', '♡');
  const sorted = [...wishes].sort((a, b) => (b.saved / b.target) - (a.saved / a.target));
  $('#home-wishlist').innerHTML = sorted.length ? `<div class="home-wish">${wishCard(sorted[0], 0)}<div class="wish-total-note"><span class="eyebrow">AIMING FOR</span><strong>${money(total)}</strong><span>across ${wishes.length} ${wishes.length === 1 ? 'wish' : 'wishes'}</span></div></div>` : empty('Dream a little', 'Add your first wishlist item.', '♡');
}

function renderActivity() {
  const items = [
    ...state.shifts.map(item => ({ ...item, kind: 'shift', title: item.note || 'Work shift', amount: earnedFor(item) })),
    ...state.expenses.map(item => ({ ...item, kind: 'expense', amount: -Number(item.amount) }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  $('#home-activity').innerHTML = items.length ? items.map(item => `<article class="activity-row"><span class="activity-dot ${item.kind}">${item.kind === 'shift' ? '↗' : '↘'}</span><span class="activity-name"><strong>${esc(item.title)}</strong><small>${longDate(item.date)}</small></span><strong class="activity-value ${item.kind}">${item.amount > 0 ? '+' : '−'}${money(Math.abs(item.amount))}</strong></article>`).join('') : empty('Nothing here just yet', 'Your shifts and expenses will show up here.', '✳');
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  const form = dialog.querySelector('form');
  form.reset();
  const dateInput = form.querySelector('[name="date"]');
  if (dateInput) dateInput.value = dateKey();
  const rateInput = form.querySelector('[name="rate"]');
  if (rateInput) rateInput.value = state.rate;
  if (id === 'settings-dialog') form.elements.rate.value = state.rate;
  dialog.showModal();
}

document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openDialog(button.dataset.open)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
document.querySelectorAll('[data-page], [data-go]').forEach(button => button.addEventListener('click', () => {
  const page = button.dataset.page || button.dataset.go;
  document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== `${page}-page`; section.classList.toggle('active', !section.hidden); });
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.page === page; tab.classList.toggle('active', active); if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

$('#shift-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget); const rate = Number(data.get('rate')) || Number(state.rate);
  state.shifts.push({ id: crypto.randomUUID(), date: data.get('date'), hours: Number(data.get('hours')), rate, note: data.get('note').trim() });
  persist(); event.currentTarget.closest('dialog').close(); toast('Shift saved. Nice work.');
});
$('#expense-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.expenses.push({ id: crypto.randomUUID(), date: data.get('date'), title: data.get('title').trim(), amount: Number(data.get('amount')), category: data.get('category') });
  persist(); event.currentTarget.closest('dialog').close(); toast('Expense added.');
});
$('#wish-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.wishes.push({ id: crypto.randomUUID(), title: data.get('title').trim(), target: Number(data.get('target')), saved: Number(data.get('saved')) || 0 });
  persist(); event.currentTarget.closest('dialog').close(); toast('A new thing to look forward to.');
});
$('#settings-open').addEventListener('click', () => openDialog('settings-dialog'));
$('#settings-form').addEventListener('submit', event => { event.preventDefault(); state.rate = Number(new FormData(event.currentTarget).get('rate')); persist(); event.currentTarget.closest('dialog').close(); toast('Hourly rate updated.'); });
document.addEventListener('click', event => {
  const saveButton = event.target.closest('[data-add-saving]');
  if (saveButton) {
    const wish = state.wishes.find(item => item.id === saveButton.dataset.addSaving);
    if (wish) {
      const form = $('#saving-form');
      form.elements.wishId.value = wish.id;
      $('#saving-title').textContent = `Add to ${wish.title}`;
      form.elements.amount.value = '';
      $('#saving-dialog').showModal();
    }
    return;
  }
  const button = event.target.closest('[data-delete]'); if (!button) return;
  const list = button.dataset.delete === 'shift' ? 'shifts' : button.dataset.delete === 'expense' ? 'expenses' : 'wishes';
  state[list] = state[list].filter(item => item.id !== button.dataset.id); persist(); toast('Removed.');
});
$('#saving-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const wish = state.wishes.find(item => item.id === data.get('wishId'));
  if (wish) wish.saved = Number(wish.saved) + Number(data.get('amount'));
  persist(); event.currentTarget.closest('dialog').close(); toast('Savings updated. Keep going!');
});

$('#date-stamp').textContent = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
render();


if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js').catch(error => {
      console.error('Daymaker could not enable offline support:', error);
    });
  });
}
