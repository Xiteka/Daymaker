const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'daymark-tracker-v1';
const dateKey = date => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fresh = () => ({ rate: 220, paydayDay: 25, shifts: [], expenses: [], monthlyExpenses: [], wishes: [] });
let state;
try {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  state = saved && typeof saved === 'object'
    ? { ...fresh(), ...saved, paydayDay: Number(saved.paydayDay) || 25, shifts: Array.isArray(saved.shifts) ? saved.shifts : [], expenses: Array.isArray(saved.expenses) ? saved.expenses : [], monthlyExpenses: Array.isArray(saved.monthlyExpenses) ? saved.monthlyExpenses : [], wishes: Array.isArray(saved.wishes) ? saved.wishes : [] }
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
const monthEntries = entries => entries.filter(item => item.date?.startsWith(dateKey().slice(0, 7)));
const earnedFor = shift => Number(shift.hours) * Number(shift.rate);
const shiftIsComplete = shift => shift.completed !== false;
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
  const shifts = monthEntries(state.shifts).filter(shiftIsComplete);
  const expenses = monthEntries(state.expenses);
  const today = dateKey();
  const hours = shifts.reduce((sum, item) => sum + Number(item.hours), 0);
  const earned = shifts.reduce((sum, item) => sum + earnedFor(item), 0);
  const estimate = monthEntries(state.shifts).filter(item => shiftIsComplete(item) || item.date >= today).reduce((sum, item) => sum + earnedFor(item), 0);
  const spent = expenses.reduce((sum, item) => sum + Number(item.amount), 0);
  $('#month-label').textContent = `YOUR MONEY THIS ${new Date().toLocaleDateString('en-GB', { month: 'long' }).toUpperCase()}`;
  $('#today-label').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
  $('#date-stamp').textContent = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
  const payday = nextPaydayDate();
  $('#next-payday').textContent = dateKey(payday) === dateKey() ? 'PAYDAY · TODAY' : `NEXT PAYDAY · ${payday.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }).toUpperCase()}`;
  renderDotValue($('#balance-value'), wholeNumber(earned - spent), money(earned - spent), 'kr', 'balance');
  $('#earned-value').textContent = money(earned);
  $('#spent-value').textContent = money(spent);
  $('#estimate-value').textContent = money(estimate);
  const hoursText = calendarHours(hours);
  renderDotValue($('#hours-value'), hoursText, `${hoursText} h`, 'h', 'stat');
  $('#shift-count').textContent = shifts.length ? `${shifts.length} ${shifts.length === 1 ? 'shift' : 'shifts'} this month` : 'No shifts completed yet';
  renderDotValue($('#expense-value'), wholeNumber(spent), money(spent), 'kr', 'stat');
  $('#expense-count').textContent = expenses.length ? `${expenses.length} ${expenses.length === 1 ? 'purchase' : 'purchases'} this month` : 'No spending logged yet';
  $('#balance-progress').style.width = `${earned ? Math.max(3, Math.min(100, ((earned - spent) / earned) * 100)) : 0}%`;
  $('#work-month-hours').textContent = `${calendarHours(hours)} h`;
  $('#work-month-pay').textContent = money(earned);
  $('#work-rate').innerHTML = `${money(state.rate)}<span class="small-unit">/h</span>`;
  $('#expenses-month-total').textContent = money(spent);
  $('#expenses-month-note').textContent = expenses.length ? `${expenses.length} purchases recorded this month` : 'Your spending, all in one place.';
  renderCalendar(); renderShifts(); renderTodayShifts(); renderExpenses(); renderMonthlyExpenses(); renderWishes(); renderActivity();
}

function nextPaydayDate(from = new Date()) {
  const payDay = Math.max(1, Math.min(31, Number(state.paydayDay) || 25));
  let year = from.getFullYear();
  let month = from.getMonth();
  let day = Math.min(payDay, new Date(year, month + 1, 0).getDate());
  let payday = new Date(year, month, day, 12);
  if (dateKey(payday) < dateKey(from)) {
    month++;
    year += Math.floor(month / 12);
    month %= 12;
    day = Math.min(payDay, new Date(year, month + 1, 0).getDate());
    payday = new Date(year, month, day, 12);
  }
  return payday;
}

// Calendar totals include completed shifts; scheduled shifts are shown separately.
const calendarStart = new Date();
let calendarMonth = new Date(calendarStart.getFullYear(), calendarStart.getMonth(), 1);
let calendarDay = null;
let calendarTotals = new Map();
let calendarHoldTimer;
const calendarHours = hours => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2, useGrouping: false }).format(hours);
const calendarDateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function showCalendarDay(date) {
  calendarDay = date;
  const total = calendarTotals.get(date) || { hours: 0, pay: 0, plannedCount: 0, times: [] };
  const detail = $('#calendar-detail');
  const scheduled = total.plannedCount ? `<p class="calendar-scheduled">${total.plannedCount} ${total.plannedCount === 1 ? 'shift' : 'shifts'} scheduled</p>` : '';
  const times = (total.times || []).map(item => `<div class="calendar-detail-time"><strong>${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}</strong>${item.scheduled ? '<small>Scheduled</small>' : ''}</div>`).join('');
  const timeDetails = times ? `<div class="calendar-detail-times"><span class="calendar-detail-times-label">SHIFT TIMES</span>${times}</div>` : '';
  detail.innerHTML = `<div class="calendar-detail-date">${calendarDateLabel(date)}</div><div class="calendar-detail-stats"><div><span>WORKED</span><strong>${calendarHours(total.hours)} h</strong></div><div><span>ESTIMATED PAY</span><strong>${money(total.pay)}</strong></div></div>${timeDetails}${scheduled}`;
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
    const total = calendarTotals.get(shift.date) || { hours: 0, pay: 0, completedCount: 0, plannedCount: 0, times: [] };
    if (shift.startTime && shift.endTime) total.times.push({ startTime: shift.startTime, endTime: shift.endTime, scheduled: !shiftIsComplete(shift) });
    if (shiftIsComplete(shift)) {
      total.hours += Number(shift.hours) || 0;
      total.pay += (Number(shift.hours) || 0) * (Number(shift.rate) || 0);
      total.completedCount++;
    } else {
      total.plannedCount++;
    }
    calendarTotals.set(shift.date, total);
  }
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  const monthLabel = calendarMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const monthPrefix = `${year}-${String(month + 1).padStart(2, '0')}`;
  const monthTotals = [...calendarTotals.entries()].filter(([date]) => date.startsWith(monthPrefix + '-'));
  const workedDays = monthTotals.filter(([, total]) => total.completedCount > 0).length;
  const plannedShifts = monthTotals.reduce((sum, [, total]) => sum + total.plannedCount, 0);
  $('#calendar-popover').hidden = true;
  $('#calendar-month').textContent = monthLabel;
  $('#calendar-count').textContent = `${workedDays} ${workedDays === 1 ? 'day' : 'days'} worked${plannedShifts ? ` · ${plannedShifts} scheduled` : ''}`;
  $('#calendar-grid').setAttribute('aria-label', `Work calendar for ${monthLabel}`);
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const tiles = Array(leadingDays).fill('<span class="calendar-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${monthPrefix}-${String(day).padStart(2, '0')}`;
    const total = calendarTotals.get(date) || { hours: 0, pay: 0, completedCount: 0, plannedCount: 0, times: [] };
    const worked = total.completedCount > 0;
    const today = date === dateKey();
    const label = `${calendarDateLabel(date)}, ${calendarHours(total.hours)} hours worked, ${money(total.pay)} estimated pay${total.plannedCount ? `, ${total.plannedCount} ${total.plannedCount === 1 ? 'shift' : 'shifts'} scheduled` : ''}`;
    tiles.push(`<button type="button" class="calendar-day${worked ? ' worked' : ''}${total.plannedCount ? ' planned' : ''}${today ? ' today' : ''}" data-date="${date}" aria-label="${esc(label)}" aria-pressed="false">${day}</button>`);
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

function swipeControl(item) {
  const name = item.note || 'shift';
  const time = item.startTime && item.endTime ? `, ${item.startTime} to ${item.endTime}` : '';
  return `<div class="swipe-track" data-shift-id="${esc(item.id)}"><span class="swipe-fill" aria-hidden="true"></span><span class="swipe-prompt" aria-hidden="true">Slide or hold to finish</span><button type="button" class="swipe-handle" data-finish-shift="${esc(item.id)}" aria-label="${esc(`Slide, hold or tap to finish ${name} on ${longDate(item.date)}${time}`)}">›</button></div>`;
}
function renderTodayShifts() {
  const today = dateKey();
  const shifts = state.shifts.filter(item => !shiftIsComplete(item) && item.date === today);
  const content = shifts.map(item => {
    const time = item.startTime && item.endTime ? `${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}` : 'Work shift';
    const note = item.note ? `<div class="today-shift-note">${esc(item.note)}</div>` : '';
    return `<article class="today-shift"><div class="today-shift-date">${longDate(item.date)}</div>${note}<div class="today-shift-details"><span>${time}</span><span>${calendarHours(Number(item.hours))} hours</span><strong>${money(earnedFor(item))}</strong></div>${swipeControl(item)}</article>`;
  }).join('');
  for (const [section, list] of [['#home-today-shifts', '#home-shift-list'], ['#work-today-shifts', '#work-shift-list']]) {
    $(section).hidden = shifts.length === 0;
    $(list).innerHTML = content;
  }
}

function renderShifts() {
  const today = dateKey();
  const todayPending = item => !shiftIsComplete(item) && item.date === today;
  const todayMillis = Date.parse(`${today}T00:00:00Z`);
  const dayDistance = date => Math.abs((Date.parse(`${date}T00:00:00Z`) - todayMillis) / 86400000);
  const rows = state.shifts.filter(item => !todayPending(item)).sort((a, b) => dayDistance(a.date) - dayDistance(b.date) || b.date.localeCompare(a.date));
  $('#shift-list').innerHTML = rows.length ? rows.map(item => {
    const completed = shiftIsComplete(item);
    const time = item.startTime && item.endTime ? ` · ${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}` : '';
    const status = completed
      ? `<div class="shift-complete-row"><span class="shift-complete-label">✓ Completed</span><button type="button" class="shift-edit" data-edit-shift="${esc(item.id)}">Edit hours</button></div>`
      : item.date === dateKey()
        ? swipeControl(item)
        : item.date < dateKey()
          ? `<div class="shift-locked-row"><span>Scheduled date has passed</span><button type="button" class="shift-late-finish" data-late-finish="${esc(item.id)}">Finish shift</button></div>`
          : `<p class="shift-locked">Available to finish on ${longDate(item.date)}</p>`;
    return `<article class="shift-card"><div class="shift-card-top"><div class="record-main"><strong>${esc(item.note || 'Work shift')}</strong><span>${longDate(item.date)}${time} · ${calendarHours(Number(item.hours))} hours at ${money(item.rate)}/h</span></div><div class="record-amount">${money(earnedFor(item))}${completed ? '' : '<small class="shift-planned-amount">planned</small>'}</div><button class="delete-button" data-delete="shift" data-id="${esc(item.id)}" aria-label="Delete shift">×</button></div>${status}</article>`;
  }).join('') : empty('Your hours will add up here', 'Log a shift to see your time and estimated pay.', '◷');
}

function renderExpenses() {
  const rows = [...state.expenses].sort((a, b) => b.date.localeCompare(a.date));
  $('#expense-list').innerHTML = rows.length ? rows.map(item => `<article class="record-row"><span class="record-icon expense-icon">${item.category === 'Food' ? '⌁' : item.category === 'Transport' ? '↗' : '↘'}</span><div class="record-main"><strong>${esc(item.title)}</strong><span>${longDate(item.date)} · ${esc(item.category)}</span></div><div class="record-amount expense-amount">−${money(item.amount)}</div><button class="delete-button" data-delete="expense" data-id="${esc(item.id)}" aria-label="Delete expense">×</button></article>`).join('') : empty('A clear picture starts here', 'Add an expense when you want to keep track.', '↘');
}

function renderMonthlyExpenses() {
  const month = dateKey().slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  const bills = [...state.monthlyExpenses].sort((a, b) => Number(a.dueDay) - Number(b.dueDay));
  $('#monthly-expense-list').innerHTML = bills.length ? bills.map(bill => {
    const dueDay = Math.min(Math.max(1, Number(bill.dueDay) || 1), lastDay);
    const dueDate = `${month}-${String(dueDay).padStart(2, '0')}`;
    const paid = bill.paidMonth === month;
    return `<article class="monthly-expense-row"><div class="monthly-expense-top"><span class="record-icon expense-icon">↻</span><div class="record-main"><strong>${esc(bill.title)}</strong><span>${esc(bill.category)}</span></div><div class="record-amount expense-amount">${money(bill.amount)}</div><button class="delete-button" data-delete="monthly-expense" data-id="${esc(bill.id)}" aria-label="Remove monthly expense">×</button></div><div class="monthly-expense-bottom"><span>${paid ? 'Paid this month' : `Due ${longDate(dueDate)}`}</span><button type="button" class="monthly-paid-button${paid ? ' is-paid' : ''}" data-toggle-monthly-paid="${esc(bill.id)}">${paid ? 'Paid ✓' : 'Mark paid'}</button></div></article>`;
  }).join('') : empty('No monthly expenses yet', 'Add a membership or subscription to keep it on your radar.', '↻');
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
    ...state.shifts.filter(shiftIsComplete).map(item => ({ ...item, kind: 'shift', title: item.note || 'Work shift', amount: earnedFor(item) })),
    ...state.expenses.map(item => ({ ...item, kind: 'expense', amount: -Number(item.amount) }))
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4);
  $('#home-activity').innerHTML = items.length ? items.map(item => `<article class="activity-row"><span class="activity-dot ${item.kind}">${item.kind === 'shift' ? '↗' : '↘'}</span><span class="activity-name"><strong>${esc(item.title)}</strong><small>${longDate(item.date)}</small></span><strong class="activity-value ${item.kind}">${item.amount > 0 ? '+' : '−'}${money(Math.abs(item.amount))}</strong></article>`).join('') : empty('Nothing here just yet', 'Your shifts and expenses will show up here.', '✳');
}

let shiftDatePickerMonth = new Date();

function renderShiftDatePicker() {
  const year = shiftDatePickerMonth.getFullYear();
  const month = shiftDatePickerMonth.getMonth();
  const monthLabel = shiftDatePickerMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  $('#shift-date-month-label').textContent = monthLabel;
  const leadingDays = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const selectedDate = shiftForm.elements.date.value;
  const today = dateKey();
  const tiles = Array(leadingDays).fill('<span class="shift-date-blank" aria-hidden="true"></span>');
  for (let day = 1; day <= daysInMonth; day++) {
    const date = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const selected = date === selectedDate;
    const isToday = date === today;
    tiles.push(`<button type="button" class="shift-date-day${selected ? ' selected' : ''}${isToday ? ' today' : ''}" data-shift-date="${date}" aria-pressed="${selected}" aria-label="${calendarDateLabel(date)}">${day}</button>`);
  }
  $('#shift-date-grid').innerHTML = tiles.join('');
}

function updateShiftDateLabel() {
  const date = shiftForm.elements.date.value;
  $('#shift-date-label').textContent = date ? calendarDateLabel(date) : 'Choose date';
}

function openDialog(id) {
  const dialog = document.getElementById(id);
  const form = dialog.querySelector('form');
  form.reset();
  const dateInput = form.querySelector('[name="date"]');
  if (dateInput) dateInput.value = id === 'shift-dialog' && !$('#calendar-page').hidden && calendarDay ? calendarDay : dateKey();
  const rateInput = form.querySelector('[name="rate"]');
  if (rateInput) rateInput.value = state.rate;
  if (id === 'settings-dialog') { form.elements.rate.value = state.rate; form.elements.paydayDay.value = state.paydayDay; }
  if (id === 'monthly-expense-dialog') form.elements.dueDay.value = state.paydayDay;
  if (id === 'shift-dialog') { updateShiftDuration(); updateShiftDateLabel(); }
  dialog.showModal();
}

document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openDialog(button.dataset.open)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
document.querySelectorAll('[data-page], [data-go]').forEach(button => button.addEventListener('click', () => {
  const page = button.dataset.page || button.dataset.go;
  $('#calendar-popover').hidden = true;
  document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== `${page}-page`; section.classList.toggle('active', !section.hidden); });
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.page === page; tab.classList.toggle('active', active); if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}));

function hoursBetweenTimes(start, end) {
  if (!start || !end || start === end) return null;
  const minutes = time => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
  return ((minutes(end) - minutes(start) + 24 * 60) % (24 * 60)) / 60;
}
const shiftForm = $('#shift-form');
$('#shift-date-open').addEventListener('click', () => {
  const selected = shiftForm.elements.date.value || dateKey();
  shiftDatePickerMonth = new Date(`${selected}T12:00:00`);
  renderShiftDatePicker();
  $('#shift-date-dialog').showModal();
});
$('#shift-date-prev').addEventListener('click', () => {
  shiftDatePickerMonth = new Date(shiftDatePickerMonth.getFullYear(), shiftDatePickerMonth.getMonth() - 1, 1);
  renderShiftDatePicker();
});
$('#shift-date-next').addEventListener('click', () => {
  shiftDatePickerMonth = new Date(shiftDatePickerMonth.getFullYear(), shiftDatePickerMonth.getMonth() + 1, 1);
  renderShiftDatePicker();
});
$('#shift-date-grid').addEventListener('click', event => {
  const button = event.target.closest('[data-shift-date]');
  if (!button) return;
  shiftForm.elements.date.value = button.dataset.shiftDate;
  updateShiftDateLabel();
  $('#shift-date-dialog').close();
});
$('#shift-date-today').addEventListener('click', () => {
  shiftForm.elements.date.value = dateKey();
  updateShiftDateLabel();
  $('#shift-date-dialog').close();
});
function updateShiftDuration() {
  const start = shiftForm.elements.startTime.value;
  const end = shiftForm.elements.endTime.value;
  const endInput = shiftForm.elements.endTime;
  endInput.setCustomValidity(start && end && start === end ? 'Start and end times must be different.' : '');
  if (!start || !end || start === end) {
    shiftForm.elements.hours.value = '';
    return null;
  }
  const hours = hoursBetweenTimes(start, end);
  shiftForm.elements.hours.value = `${calendarHours(hours)} h`;
  return hours;
}
for (const name of ['startTime', 'endTime']) {
  shiftForm.elements[name].addEventListener('input', updateShiftDuration);
  shiftForm.elements[name].addEventListener('change', updateShiftDuration);
}
shiftForm.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const hours = updateShiftDuration();
  if (hours === null) { form.reportValidity(); return; }
  const data = new FormData(form);
  const rate = data.get('rate') === '' ? Number(state.rate) : Number(data.get('rate'));
  state.shifts.push({ id: crypto.randomUUID(), date: data.get('date'), startTime: data.get('startTime'), endTime: data.get('endTime'), hours, rate, note: data.get('note').trim(), completed: false });
  persist(); form.closest('dialog').close(); toast('Shift scheduled.');
});
const finishForm = $('#finish-form');
const finishDialog = $('#finish-dialog');
let finishExactHours = null;
let swipeGesture = null;
let suppressSwipeClickUntil = 0;

function setFinishHours(hours) {
  finishExactHours = hours;
  finishForm.elements.hours.value = calendarHours(hours);
}
function openFinishShift(id, allowLate = false) {
  const shift = state.shifts.find(item => item.id === id);
  if (!shift || finishDialog.open) return;
  if (!shiftIsComplete(shift) && shift.date !== dateKey() && !(allowLate && shift.date < dateKey())) { toast('This shift can be finished on its date.'); return; }
  const completed = shiftIsComplete(shift);
  finishForm.reset();
  finishForm.elements.shiftId.value = shift.id;
  $('#finish-title').textContent = completed ? 'Edit shift hours' : 'Finish shift';
  $('#finish-date').textContent = longDate(shift.date);
  $('#finish-submit').innerHTML = completed ? 'Save changes <span>↗</span>' : 'Finish shift <span>↗</span>';
  const hasTimes = !!(shift.startTime && shift.endTime);
  $('#finish-times').hidden = !hasTimes;
  for (const name of ['startTime', 'endTime']) {
    const field = finishForm.elements[name];
    field.required = hasTimes;
    field.value = hasTimes ? shift[name] : '';
    field.setCustomValidity('');
  }
  setFinishHours(Number(shift.hours));
  finishDialog.showModal();
}
function updateFinishTimes() {
  const start = finishForm.elements.startTime.value;
  const end = finishForm.elements.endTime.value;
  finishForm.elements.endTime.setCustomValidity(start && end && start === end ? 'Start and end times must be different.' : '');
  const hours = hoursBetweenTimes(start, end);
  if (hours !== null) setFinishHours(hours);
}
for (const name of ['startTime', 'endTime']) {
  finishForm.elements[name].addEventListener('input', updateFinishTimes);
  finishForm.elements[name].addEventListener('change', updateFinishTimes);
}
finishForm.elements.hours.addEventListener('input', () => { finishExactHours = null; });
finishForm.addEventListener('submit', event => {
  event.preventDefault();
  const shift = state.shifts.find(item => item.id === finishForm.elements.shiftId.value);
  if (!shift) { finishDialog.close(); return; }
  const hours = finishExactHours === null ? Number(finishForm.elements.hours.value) : finishExactHours;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) { finishForm.elements.hours.reportValidity(); return; }
  const wasCompleted = shiftIsComplete(shift);
  shift.hours = hours;
  if (!$('#finish-times').hidden) {
    shift.startTime = finishForm.elements.startTime.value;
    shift.endTime = finishForm.elements.endTime.value;
  }
  shift.completed = true;
  persist();
  finishDialog.close();
  toast(wasCompleted ? 'Shift updated.' : 'Shift completed.');
});

function resetSwipe() {
  if (!swipeGesture) return;
  clearTimeout(swipeGesture.timer);
  swipeGesture.handle.style.transform = '';
  swipeGesture.track.querySelector('.swipe-fill').style.width = '';
  swipeGesture = null;
}
for (const shiftList of [$('#shift-list'), $('#home-shift-list'), $('#work-shift-list')]) {
shiftList.addEventListener('pointerdown', event => {
  const handle = event.target.closest('.swipe-handle');
  if (!handle || (event.pointerType === 'mouse' && event.button !== 0)) return;
  resetSwipe();
  const track = handle.closest('.swipe-track');
  const distance = Math.max(1, track.clientWidth - handle.offsetWidth - 8);
  swipeGesture = { handle, track, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, distance, progress: 0, moved: false, triggered: false };
  if (handle.setPointerCapture) handle.setPointerCapture(event.pointerId);
  const current = swipeGesture;
  current.timer = setTimeout(() => {
    if (swipeGesture !== current || current.progress > 0.04) return;
    current.triggered = true;
    openFinishShift(handle.dataset.finishShift);
  }, 700);
});
shiftList.addEventListener('pointermove', event => {
  const gesture = swipeGesture;
  if (!gesture || gesture.pointerId !== event.pointerId || gesture.triggered) return;
  const distanceMoved = Math.max(0, event.clientX - gesture.startX);
  if (Math.abs(event.clientX - gesture.startX) > 6 || Math.abs(event.clientY - gesture.startY) > 6) { gesture.moved = true; clearTimeout(gesture.timer); }
  gesture.progress = Math.min(1, distanceMoved / gesture.distance);
  gesture.handle.style.transform = `translateX(${gesture.progress * gesture.distance}px)`;
  gesture.track.querySelector('.swipe-fill').style.width = `${gesture.progress * 100}%`;
});
shiftList.addEventListener('pointerup', event => {
  const gesture = swipeGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const shouldFinish = !gesture.triggered && gesture.progress >= 0.75;
  const id = gesture.handle.dataset.finishShift;
  if (gesture.moved || gesture.triggered) suppressSwipeClickUntil = Date.now() + 500;
  resetSwipe();
  if (shouldFinish) openFinishShift(id);
});
shiftList.addEventListener('pointercancel', resetSwipe);
shiftList.addEventListener('click', event => {
  const late = event.target.closest('[data-late-finish]');
  if (late) { openFinishShift(late.dataset.lateFinish, true); return; }
  const edit = event.target.closest('[data-edit-shift]');
  if (edit) { openFinishShift(edit.dataset.editShift); return; }
  const handle = event.target.closest('[data-finish-shift]');
  if (handle && (event.detail === 0 || Date.now() >= suppressSwipeClickUntil)) openFinishShift(handle.dataset.finishShift);
});
shiftList.addEventListener('contextmenu', event => {
  if (event.target.closest('.swipe-handle')) event.preventDefault();
});
}

$('#expense-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.expenses.push({ id: crypto.randomUUID(), date: data.get('date'), title: data.get('title').trim(), amount: Number(data.get('amount')), category: data.get('category') });
  persist(); event.currentTarget.closest('dialog').close(); toast('Expense added.');
});
$('#monthly-expense-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.monthlyExpenses.push({ id: crypto.randomUUID(), title: data.get('title').trim(), amount: Number(data.get('amount')), category: data.get('category'), dueDay: Number(data.get('dueDay')), paidMonth: '' });
  persist(); event.currentTarget.closest('dialog').close(); toast('Monthly expense added.');
});
$('#wish-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.wishes.push({ id: crypto.randomUUID(), title: data.get('title').trim(), target: Number(data.get('target')), saved: Number(data.get('saved')) || 0 });
  persist(); event.currentTarget.closest('dialog').close(); toast('A new thing to look forward to.');
});
$('#settings-open').addEventListener('click', () => openDialog('settings-dialog'));
$('#settings-form').addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); state.rate = Number(data.get('rate')); state.paydayDay = Number(data.get('paydayDay')); persist(); event.currentTarget.closest('dialog').close(); toast('Settings updated.'); });
document.addEventListener('click', event => {
  const paidButton = event.target.closest('[data-toggle-monthly-paid]');
  if (paidButton) {
    const bill = state.monthlyExpenses.find(item => item.id === paidButton.dataset.toggleMonthlyPaid);
    if (bill) {
      const month = dateKey().slice(0, 7);
      if (bill.paidMonth === month) {
        state.expenses = state.expenses.filter(item => !(item.monthlyExpenseId === bill.id && item.monthlyPeriod === month));
        bill.paidMonth = '';
        toast('Monthly expense marked unpaid.');
      } else {
        bill.paidMonth = month;
        state.expenses.push({ id: crypto.randomUUID(), date: dateKey(), title: bill.title, amount: Number(bill.amount), category: bill.category, monthlyExpenseId: bill.id, monthlyPeriod: month });
        toast('Monthly expense marked paid.');
      }
      persist();
    }
    return;
  }
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
  if (button.dataset.delete === 'expense') {
    const expense = state.expenses.find(item => item.id === button.dataset.id);
    const bill = expense?.monthlyExpenseId && state.monthlyExpenses.find(item => item.id === expense.monthlyExpenseId);
    if (bill && bill.paidMonth === expense.monthlyPeriod) bill.paidMonth = '';
  }
  const list = button.dataset.delete === 'shift' ? 'shifts' : button.dataset.delete === 'expense' ? 'expenses' : button.dataset.delete === 'monthly-expense' ? 'monthlyExpenses' : 'wishes';
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

let currentAppDay = dateKey();
let midnightTimer;
function refreshForNewDay() {
  const today = dateKey();
  if (today === currentAppDay) return;
  const previousMonth = currentAppDay.slice(0, 7);
  currentAppDay = today;
  if (dateKey(calendarMonth).slice(0, 7) === previousMonth && today.slice(0, 7) !== previousMonth) {
    const now = new Date();
    calendarMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    calendarDay = null;
  }
  resetSwipe();
  render();
}
function scheduleDayRefresh() {
  clearTimeout(midnightTimer);
  const now = new Date();
  const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  midnightTimer = setTimeout(() => { refreshForNewDay(); scheduleDayRefresh(); }, nextDay - now + 100);
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { refreshForNewDay(); scheduleDayRefresh(); }
});
scheduleDayRefresh();

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    const alreadyControlled = !!navigator.serviceWorker.controller;
    let reloadedForUpdate = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!alreadyControlled || reloadedForUpdate) return;
      reloadedForUpdate = true;
      window.location.reload();
    });
    navigator.serviceWorker.register('./service-worker.js', { updateViaCache: 'none' })
      .then(registration => registration.update())
      .catch(error => console.error('Daymaker could not check for an update:', error));
  });
}
