const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'daymark-tracker-v1';
const dateKey = date => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fresh = () => ({ rate: 220, paydayDay: 25, profileName: '', shifts: [], expenses: [], monthlyExpenses: [], wishes: [], wishFolders: [] });
let state;
try {
  const saved = window.DaymakerCloud ? window.DaymakerCloud.loadLocal() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  state = saved && typeof saved === 'object'
    ? { ...fresh(), ...saved, paydayDay: Number(saved.paydayDay) || 25, shifts: Array.isArray(saved.shifts) ? saved.shifts : [], expenses: Array.isArray(saved.expenses) ? saved.expenses : [], monthlyExpenses: Array.isArray(saved.monthlyExpenses) ? saved.monthlyExpenses : [], wishes: Array.isArray(saved.wishes) ? saved.wishes : [], wishFolders: Array.isArray(saved.wishFolders) ? saved.wishFolders : [] }
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
const hasEarnedOverride = shift => shift.completed !== false && typeof shift.earnedOverride === 'number' && Number.isFinite(shift.earnedOverride) && shift.earnedOverride >= 0;
const earnedFor = shift => hasEarnedOverride(shift) ? shift.earnedOverride : Number(shift.hours) * Number(shift.rate);
const shiftIsComplete = shift => shift.completed !== false;
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const persist = () => {
  try {
    if (window.DaymakerCloud) window.DaymakerCloud.save(state);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    render();
    toast(error.message || 'Could not save on this device. Download a backup before closing the app.');
    return false;
  }
  render();
  return true;
};
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
  resetShiftRowGesture();
  closeShiftRow();
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
  $('#expense-count').textContent = expenses.length ? `${expenses.length} ${expenses.length === 1 ? 'purchase' : 'purchases'} this month` : 'No spending logged';
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
const calendarHoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
const calendarHours = hours => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2, useGrouping: false }).format(hours);
const calendarDateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function showCalendarDay(date, showPopover = false) {
  calendarDay = date;
  const total = calendarTotals.get(date) || { hours: 0, pay: 0, plannedCount: 0, times: [] };
  const detail = $('#calendar-detail');
  const times = (total.times || []).map(item => `<div class="calendar-detail-time"><strong>${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}</strong>${item.scheduled ? '<small>Scheduled</small>' : ''}</div>`).join('');
  const timeDetails = times ? `<div class="calendar-detail-times"><span class="calendar-detail-times-label">SHIFT TIMES</span>${times}</div>` : '';
  detail.innerHTML = `<div class="calendar-detail-date">${calendarDateLabel(date)}</div><div class="calendar-detail-stats"><div><span>WORKED</span><strong>${calendarHours(total.hours)} h</strong></div><div><span>ESTIMATED PAY</span><strong>${money(total.pay)}</strong></div></div>${timeDetails}`;
  $('#calendar-grid').querySelectorAll('.calendar-day').forEach(button => {
    const selected = button.dataset.date === date;
    button.classList.toggle('selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  const popover = $('#calendar-popover');
  popover.hidden = true;
  const button = $('#calendar-grid').querySelector(`[data-date="${date}"]`);
  if (button && showPopover && calendarHoverMedia.matches) {
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
      total.pay += earnedFor(shift);
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
    const label = `${today ? 'Today, ' : ''}${calendarDateLabel(date)}, ${calendarHours(total.hours)} hours worked, ${money(total.pay)} estimated pay${total.plannedCount ? `, ${total.plannedCount} ${total.plannedCount === 1 ? 'shift' : 'shifts'} scheduled` : ''}`;
    tiles.push(`<button type="button" class="calendar-day${worked ? ' worked' : ''}${total.plannedCount ? ' planned' : ''}${today ? ' today' : ''}" data-date="${date}" aria-label="${esc(label)}"${today ? ' aria-current="date"' : ''} aria-pressed="false">${day}</button>`);
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
calendarHoverMedia.addEventListener('change', () => { $('#calendar-popover').hidden = true; });
calendarGrid.addEventListener('pointerover', event => {
  const day = event.target.closest('.calendar-day');
  if (day && calendarHoverMedia.matches && (event.pointerType === 'mouse' || event.pointerType === 'pen')) showCalendarDay(day.dataset.date, true);
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

let shiftRowGesture = null;
let openShiftRow = null;
let suppressShiftRowClickUntil = 0;
const SHIFT_ACTION_WIDTH = 132;
const rowActionWidth = row => Number(row.dataset.actionWidth) || SHIFT_ACTION_WIDTH;

function shiftSwipeRow(item, content, kind = '') {
  return `<div class="shift-swipe-row${kind ? ` shift-swipe-${kind}` : ''}" data-row-shift="${esc(item.id)}" tabindex="0" role="group" aria-label="${esc(`${item.note || 'Work shift'}, ${longDate(item.date)}. Swipe right for Edit or Delete.`)}"><div class="shift-row-actions" aria-hidden="true" inert><button type="button" class="shift-row-edit" data-edit-details="${esc(item.id)}">Edit</button><button type="button" class="shift-row-delete" data-delete="shift" data-id="${esc(item.id)}">Delete</button></div><div class="shift-swipe-content">${content}</div></div>`;
}

function setShiftRowOpen(row, open) {
  if (!row) return;
  if (openShiftRow && openShiftRow !== row) closeShiftRow();
  row.classList.toggle('actions-open', open);
  row.style.setProperty('--shift-row-offset', `${open ? rowActionWidth(row) : 0}px`);
  const actions = row.querySelector('.shift-row-actions');
  actions.inert = !open;
  actions.setAttribute('aria-hidden', String(!open));
  if (open) openShiftRow = row;
  else if (openShiftRow === row) openShiftRow = null;
}
function closeShiftRow() {
  if (openShiftRow) setShiftRowOpen(openShiftRow, false);
}
function resetShiftRowGesture() {
  const gesture = shiftRowGesture;
  if (!gesture) return;
  shiftRowGesture = null;
  gesture.row.classList.remove('is-dragging');
  setShiftRowOpen(gesture.row, gesture.wasOpen);
  if (gesture.content.hasPointerCapture(gesture.pointerId)) gesture.content.releasePointerCapture(gesture.pointerId);
}
for (const shiftPage of [$('#work-page'), $('#home-page'), $('#expenses-page')]) {
shiftPage.addEventListener('pointerdown', event => {
  if (!event.isPrimary || (event.pointerType === 'mouse' && event.button !== 0)) return;
  if (event.target.closest('button, input, select, a, .swipe-track, .shift-row-actions')) return;
  const content = event.target.closest('.shift-swipe-content');
  if (!content) return;
  resetShiftRowGesture();
  const row = content.closest('.shift-swipe-row');
  if (openShiftRow && openShiftRow !== row) closeShiftRow();
  const wasOpen = row.classList.contains('actions-open');
  shiftRowGesture = { row, content, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, wasOpen, offset: wasOpen ? rowActionWidth(row) : 0, actionWidth: rowActionWidth(row), horizontal: false };
});
shiftPage.addEventListener('pointermove', event => {
  const gesture = shiftRowGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  const dx = event.clientX - gesture.startX;
  const dy = event.clientY - gesture.startY;
  if (!gesture.horizontal) {
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 8) return;
    if (Math.abs(dy) >= Math.abs(dx)) { resetShiftRowGesture(); return; }
    gesture.horizontal = true;
    gesture.row.classList.add('is-dragging');
    gesture.content.setPointerCapture(event.pointerId);
  }
  event.preventDefault();
  gesture.offset = Math.max(0, Math.min(gesture.actionWidth, (gesture.wasOpen ? gesture.actionWidth : 0) + dx));
  gesture.row.style.setProperty('--shift-row-offset', `${gesture.offset}px`);
}, { passive: false });
shiftPage.addEventListener('pointerup', event => {
  const gesture = shiftRowGesture;
  if (!gesture || gesture.pointerId !== event.pointerId) return;
  shiftRowGesture = null;
  gesture.row.classList.remove('is-dragging');
  if (gesture.horizontal) {
    suppressShiftRowClickUntil = Date.now() + 350;
    setShiftRowOpen(gesture.row, gesture.offset >= gesture.actionWidth / 2);
  }
  if (gesture.content.hasPointerCapture(event.pointerId)) gesture.content.releasePointerCapture(event.pointerId);
});
shiftPage.addEventListener('pointercancel', resetShiftRowGesture);
shiftPage.addEventListener('click', event => {
  if (Date.now() < suppressShiftRowClickUntil && event.target.closest('.shift-swipe-content')) {
    event.preventDefault();
    event.stopPropagation();
  }
}, true);
}
document.addEventListener('keydown', event => {
  const row = event.target.closest('.shift-swipe-row');
  if (event.key === 'ArrowRight' && row && event.target === row) {
    event.preventDefault();
    setShiftRowOpen(row, true);
    row.querySelector('.shift-row-actions button').focus();
  } else if ((event.key === 'Escape' || event.key === 'ArrowLeft') && openShiftRow && !event.target.closest('dialog')) {
    event.preventDefault();
    const activeRow = openShiftRow;
    closeShiftRow();
    activeRow.focus();
  }
});

function swipeControl(item) {
  const name = item.note || 'shift';
  const time = item.startTime && item.endTime ? `, ${item.startTime} to ${item.endTime}` : '';
  return `<div class="swipe-track" data-shift-id="${esc(item.id)}"><span class="swipe-fill" aria-hidden="true"></span><span class="swipe-prompt" aria-hidden="true">Slide or hold to finish</span><button type="button" class="swipe-handle" data-finish-shift="${esc(item.id)}" aria-label="${esc(`Slide, hold or tap to finish ${name} on ${longDate(item.date)}${time}`)}">›</button></div>`;
}
function renderTodayShifts() {
  const today = dateKey();
  const shifts = state.shifts.filter(item => !shiftIsComplete(item) && item.date === today)
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || ''));
  $('#work-today-shifts').hidden = shifts.length === 0;
  $('#work-shift-list').innerHTML = shifts.map(item => nextShiftCard(item, true)).join('');
}

function nextShiftCard(item, isToday = false) {
  const time = item.startTime && item.endTime ? `${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}` : '';
  const badge = isToday ? 'TODAY’S SHIFT' : 'NEXT SHIFT';
  return shiftSwipeRow(item, `<article class="upcoming-shift-card"><div class="upcoming-shift-header"><p class="upcoming-shift-badge">${badge}</p><strong class="upcoming-shift-pay" aria-label="${esc(`Estimated earnings ${money(earnedFor(item))}`)}">${money(earnedFor(item))}</strong></div><div class="upcoming-shift-top"><h3>${esc(item.note || 'Work shift')}</h3></div><div class="upcoming-shift-details"><span>${longDate(item.date)}</span>${time ? `<span>${time}</span>` : ''}<span>${calendarHours(Number(item.hours))} h</span></div>${isToday ? swipeControl(item) : ''}</article>`, 'next');
}

function showWorkShiftView(view) {
  if (view !== 'upcoming' && view !== 'history') return;
  resetShiftRowGesture();
  closeShiftRow();
  for (const tab of document.querySelectorAll('[data-shift-view]')) {
    const active = tab.dataset.shiftView === view;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  $('#work-upcoming-panel').hidden = view !== 'upcoming';
  $('#work-history-panel').hidden = view !== 'history';
}
const workShiftTabs = [...document.querySelectorAll('[data-shift-view]')];
workShiftTabs.forEach((tab, index) => {
  tab.addEventListener('click', () => showWorkShiftView(tab.dataset.shiftView));
  tab.addEventListener('keydown', event => {
    let next;
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') next = workShiftTabs[(index + 1) % workShiftTabs.length];
    else if (event.key === 'Home') next = workShiftTabs[0];
    else if (event.key === 'End') next = workShiftTabs[workShiftTabs.length - 1];
    if (!next) return;
    event.preventDefault();
    showWorkShiftView(next.dataset.shiftView);
    next.focus();
  });
});

function renderShifts() {
  const today = dateKey();
  const upcoming = state.shifts.filter(item => !shiftIsComplete(item) && item.date > today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  const homeShift = state.shifts.filter(item => !shiftIsComplete(item) && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))[0];
  const hasTodayShift = homeShift?.date === today;
  $('#home-upcoming-shift').hidden = !homeShift;
  $('#home-upcoming-shift').setAttribute('aria-label', hasTodayShift ? 'Today’s shift' : 'Next shift');
  $('#home-next-shift').innerHTML = homeShift ? nextShiftCard(homeShift, homeShift.date === today) : '';
  $('#work-next-shift').hidden = hasTodayShift || upcoming.length === 0;
  $('#work-next-shift').innerHTML = !hasTodayShift && upcoming.length ? nextShiftCard(upcoming[0]) : '';
  const remainingUpcoming = hasTodayShift ? upcoming : upcoming.slice(1);
  $('#upcoming-shift-list').innerHTML = remainingUpcoming.length ? remainingUpcoming.map(item => {
    const time = item.startTime && item.endTime ? `${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}` : '';
    return shiftSwipeRow(item, `<article class="shift-card"><div class="shift-card-top"><div class="record-main"><strong>${esc(item.note || 'Work shift')}</strong><span>${longDate(item.date)}${time ? ` · ${time}` : ''} · ${calendarHours(Number(item.hours))} hours at ${money(item.rate)}/h</span></div><div class="record-amount">${money(earnedFor(item))}<small class="shift-planned-amount">planned</small></div></div></article>`);
  }).join('') : `<p class="work-shift-empty">${upcoming.length ? 'No other upcoming shifts.' : 'No upcoming shifts. Log a shift to plan your next workday.'}</p>`;
  const todayMillis = Date.parse(`${today}T00:00:00Z`);
  const dayDistance = date => Math.abs((Date.parse(`${date}T00:00:00Z`) - todayMillis) / 86400000);
  const rows = state.shifts.filter(item => shiftIsComplete(item) || item.date < today).sort((a, b) => dayDistance(a.date) - dayDistance(b.date) || b.date.localeCompare(a.date));
  $('#shift-list').innerHTML = rows.length ? rows.map(item => {
    const completed = shiftIsComplete(item);
    const time = item.startTime && item.endTime ? ` · ${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}` : '';
    const status = completed
      ? ''
      : item.date === dateKey()
        ? swipeControl(item)
        : item.date < dateKey()
          ? `<div class="shift-locked-row"><span>Scheduled date has passed</span><button type="button" class="shift-late-finish" data-late-finish="${esc(item.id)}">Finish shift</button></div>`
          : ``;
    return shiftSwipeRow(item, `<article class="shift-card"><div class="shift-card-top"><div class="record-main"><div class="shift-title-row"><strong>${esc(item.note || 'Work shift')}</strong>${completed ? '<span class="shift-complete-label">✓ Completed</span>' : ''}</div><span>${longDate(item.date)}${time} · ${calendarHours(Number(item.hours))} hours at ${money(item.rate)}/h</span></div><div class="record-amount">${money(earnedFor(item))}${completed ? '' : '<small class="shift-planned-amount">planned</small>'}</div></div>${status}</article>`);
  }).join('') : empty('Your shift history starts here', 'Completed and past shifts will appear here.', '◷');
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
    return `<div class="shift-swipe-row monthly-swipe-row" data-action-width="64" tabindex="0" role="group" aria-label="${esc(`${bill.title}. Swipe right to reveal Delete.`)}"><div class="shift-row-actions" aria-hidden="true" inert><button type="button" class="shift-row-delete monthly-delete-button" data-delete="monthly-expense" data-id="${esc(bill.id)}" aria-label="${esc(`Delete ${bill.title}`)}">×</button></div><div class="shift-swipe-content"><article class="monthly-expense-row"><div class="monthly-expense-top"><span class="record-icon expense-icon">↻</span><div class="record-main"><strong>${esc(bill.title)}</strong><span>Due ${longDate(dueDate)}</span></div><div class="record-amount expense-amount">${money(bill.amount)}</div><button type="button" class="monthly-paid-button${paid ? ' is-paid' : ''}" data-toggle-monthly-paid="${esc(bill.id)}" aria-label="${esc(`${paid ? 'Mark unpaid' : 'Mark paid'}: ${bill.title}`)}">${paid ? 'Paid ✓' : 'Mark paid'}</button></div></article></div></div>`;
  }).join('') : empty('No monthly expenses yet', 'Add a membership or subscription to keep it on your radar.', '↻');
}

const GENERAL_WISH_FOLDER = 'general';
let activeWishFolder = null;
const wishFolderIcon = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z"/></svg>';
function getWishFolders() {
  return [{ id: GENERAL_WISH_FOLDER, name: 'General' }, ...state.wishFolders.filter(folder =>
    folder && typeof folder.id === 'string' && folder.id !== GENERAL_WISH_FOLDER && typeof folder.name === 'string' && folder.name.trim())];
}
function folderForWish(wish) {
  return getWishFolders().some(folder => folder.id === wish.folderId) ? wish.folderId : GENERAL_WISH_FOLDER;
}
function populateWishFolders(select, selected = GENERAL_WISH_FOLDER) {
  select.innerHTML = getWishFolders().map(folder => `<option value="${esc(folder.id)}">${esc(folder.name)}</option>`).join('');
  select.value = getWishFolders().some(folder => folder.id === selected) ? selected : GENERAL_WISH_FOLDER;
}
function setMoveFolderExpanded(expanded, focusChoice = false) {
  $('#wish-move-folder-trigger').setAttribute('aria-expanded', String(expanded));
  $('#wish-move-folder-options').hidden = !expanded;
  if (expanded && focusChoice) $('#wish-move-folder-options').querySelector('input:checked')?.focus();
}
function populateMoveWishFolders(selected) {
  const folders = getWishFolders();
  const folder = folders.find(item => item.id === selected) || folders[0];
  $('#wish-move-form').elements.folderId.value = folder.id;
  $('#wish-move-folder-name').textContent = folder.name;
  $('#wish-move-trigger-icon').innerHTML = wishFolderIcon;
  $('#wish-move-folder-options').innerHTML = `<legend class="visually-hidden">Choose a folder</legend>` + folders.map(item =>
    `<label class="wish-move-option"><input type="radio" name="moveFolderChoice" value="${esc(item.id)}"${item.id === folder.id ? ' checked' : ''}><span class="wish-move-option-content"><span class="wish-folder-icon">${wishFolderIcon}</span><span class="wish-move-option-name">${esc(item.name)}</span><span class="wish-move-option-check" aria-hidden="true"></span></span></label>`).join('');
  setMoveFolderExpanded(false);
}
$('#wish-move-folder-trigger').addEventListener('click', () => {
  setMoveFolderExpanded($('#wish-move-folder-options').hidden, true);
});
$('#wish-move-folder-options').addEventListener('change', event => {
  const choice = event.target.closest('input[name="moveFolderChoice"]');
  const folder = choice && getWishFolders().find(item => item.id === choice.value);
  if (!folder) return;
  $('#wish-move-form').elements.folderId.value = folder.id;
  $('#wish-move-folder-name').textContent = folder.name;
  setMoveFolderExpanded(false);
  $('#wish-move-folder-trigger').focus({ preventScroll: true });
});
$('#wish-move-dialog').addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#wish-move-folder-options').hidden) {
    event.preventDefault();
    event.stopPropagation();
    setMoveFolderExpanded(false);
    $('#wish-move-folder-trigger').focus({ preventScroll: true });
  }
});
$('#wish-move-dialog').addEventListener('click', event => {
  if (!event.target.closest('.wish-move-picker')) setMoveFolderExpanded(false);
});
function wishCard(item, index, allowMove = false) {
  const ratio = Math.max(0, Math.min(100, Number(item.saved) / Number(item.target) * 100));
  const colors = ['wish-peach', 'wish-mint', 'wish-lilac', 'wish-yellow'];
  const move = allowMove ? `<button type="button" class="wish-move-button" data-move-wish="${esc(item.id)}" aria-label="${esc(`Move ${item.title} to another folder`)}" title="Move to folder">${wishFolderIcon}</button>` : '';
  const favorite = allowMove ? Number(item.favoriteAt) > 0 : false;
  const favoriteButton = allowMove ? `<button type="button" class="wish-favorite-button${favorite ? ' is-favorite' : ''}" data-toggle-wish-favorite="${esc(item.id)}" aria-label="${esc(favorite ? `Remove ${item.title} from Home wishlist` : `Show ${item.title} on Home`)}" aria-pressed="${favorite}" title="${esc(favorite ? 'Remove from Home wishlist' : 'Show on Home')}">${favorite ? '♥' : '☆'}</button>` : '';
  return `<article class="wish-card ${colors[index % colors.length]}"><div class="wish-top"><span class="wish-glyph">${['✳', '♡', '✦', '✿'][index % 4]}</span><div class="wish-card-actions">${favoriteButton}${move}<button class="delete-button" data-delete="wish" data-id="${esc(item.id)}" aria-label="Delete wish">×</button></div></div><h3>${esc(item.title)}</h3><div class="wish-amounts"><strong>${money(item.saved)}</strong><span>of ${money(item.target)}</span></div><div class="wish-progress"><span style="width:${ratio}%"></span></div><div class="wish-card-foot"><p>${ratio >= 100 ? 'You made it! ✨' : `${Math.round(ratio)}% saved`}</p><button class="save-more" data-add-saving="${esc(item.id)}" type="button">＋ Add</button></div></article>`;
}
function wishFolderCard(folder, index) {
  const wishes = state.wishes.filter(wish => folderForWish(wish) === folder.id);
  const target = wishes.reduce((sum, wish) => sum + Number(wish.target), 0);
  const saved = wishes.reduce((sum, wish) => sum + Number(wish.saved), 0);
  const ratio = target ? Math.max(0, Math.min(100, saved / target * 100)) : 0;
  const colors = ['wish-peach', 'wish-mint', 'wish-lilac', 'wish-yellow'];
  return `<button type="button" class="wish-folder-card ${colors[index % colors.length]}" data-wish-folder="${esc(folder.id)}"><span class="wish-folder-top"><span class="wish-folder-icon">${wishFolderIcon}</span><span>${wishes.length} ${wishes.length === 1 ? 'wish' : 'wishes'}</span></span><strong class="wish-folder-title">${esc(folder.name)}</strong><span class="wish-folder-amount">${wishes.length ? `${money(saved)} <small>of ${money(target)}</small>` : 'Add your first wish'}</span><span class="wish-progress"><span style="width:${ratio}%"></span></span></button>`;
}
function renderWishes() {
  const wishes = state.wishes;
  const folders = getWishFolders();
  if (activeWishFolder && !folders.some(folder => folder.id === activeWishFolder)) activeWishFolder = null;
  const visibleWishes = activeWishFolder ? wishes.filter(wish => folderForWish(wish) === activeWishFolder) : wishes;
  const total = wishes.reduce((sum, item) => sum + Number(item.target), 0);
  $('#wish-total').textContent = `${visibleWishes.length} ${visibleWishes.length === 1 ? 'thing' : 'things'}`;
  $('#wish-folder-grid').hidden = !!activeWishFolder;
  $('#wish-folder-grid').innerHTML = folders.map(wishFolderCard).join('');
  $('#wish-folder-heading').hidden = !activeWishFolder;
  $('#wish-folder-name').textContent = folders.find(folder => folder.id === activeWishFolder)?.name || '';
  $('#wish-summary-note').hidden = !activeWishFolder;
  $('#wishlist-list').hidden = !activeWishFolder;
  $('#wishlist-list').innerHTML = activeWishFolder ? visibleWishes.length
    ? visibleWishes.map((wish, index) => wishCard(wish, index, true)).join('')
    : empty('Your next good thing goes here', 'Add a wish to this folder.', '♡') : '';
  const sorted = [...wishes].sort((a, b) => (b.saved / b.target) - (a.saved / a.target));
  const lastHearted = wishes.filter(wish => Number(wish.favoriteAt) > 0).sort((a, b) => Number(b.favoriteAt) - Number(a.favoriteAt))[0];
  const homeWish = lastHearted || sorted[0];
  $('#home-wishlist').innerHTML = homeWish ? `<div class="home-wish">${wishCard(homeWish, 0)}<div class="wish-total-note"><span class="eyebrow">AIMING FOR</span><strong>${money(total)}</strong><span>across ${wishes.length} ${wishes.length === 1 ? 'wish' : 'wishes'}</span></div></div>` : empty('Dream a little', 'Add your first wishlist item.', '♡');
}
$('#wish-folder-back').addEventListener('click', () => {
  const previous = activeWishFolder;
  activeWishFolder = null;
  renderWishes();
  [...$('#wish-folder-grid').querySelectorAll('[data-wish-folder]')].find(button => button.dataset.wishFolder === previous)?.focus();
});

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
  if (id === 'wish-dialog') populateWishFolders(form.elements.folderId, activeWishFolder || GENERAL_WISH_FOLDER);
  if (id === 'wish-folder-dialog') form.elements.name.setCustomValidity('');
  const dateInput = form.querySelector('[name="date"]');
  if (dateInput) dateInput.value = id === 'shift-dialog' && !$('#calendar-page').hidden && calendarDay ? calendarDay : dateKey();
  const rateInput = form.querySelector('[name="rate"]');
  if (rateInput) rateInput.value = state.rate;
  if (id === 'settings-dialog') { form.elements.rate.value = state.rate; form.elements.paydayDay.value = state.paydayDay; }
  if (id === 'monthly-expense-dialog') form.elements.dueDay.value = state.paydayDay;
  if (id === 'shift-dialog') {
    shiftEditExactHours = null;
    shiftGrossHours = null;
    shiftBreakManual = false;
    shiftEarnedManual = false;
    form.elements.earned.disabled = true;
    $('#shift-earned-field').hidden = true;
    $('#shift-earned-hint').hidden = true;
    form.elements.shiftId.value = '';
    form.elements.hours.readOnly = true;
    form.elements.startTime.required = true;
    form.elements.endTime.required = true;
    $('#shift-title').textContent = 'Log a shift';
    $('#shift-submit').innerHTML = 'Save shift <span>↗</span>';
    $('#shift-time-hint').textContent = 'An end time before the start means your shift ends the next day.';
    updateShiftDuration(); updateShiftDateLabel();
  }
  dialog.showModal();
}

document.querySelectorAll('[data-open]').forEach(button => button.addEventListener('click', () => openDialog(button.dataset.open)));
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => document.getElementById(button.dataset.close).close()));
function showPage(page, focusHeading = false) {
  if (!document.getElementById(`${page}-page`)) return;
  if (page === 'wishlist') { activeWishFolder = null; renderWishes(); }
  resetShiftRowGesture(); closeShiftRow();
  $('#calendar-popover').hidden = true;
  document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== `${page}-page`; section.classList.toggle('active', !section.hidden); });
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.page === page; tab.classList.toggle('active', active); if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); });
  if (page === 'account') $('#account-open').setAttribute('aria-current', 'page');
  else $('#account-open').removeAttribute('aria-current');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (focusHeading) document.querySelector(`#${page}-page h1`)?.focus({ preventScroll: true });
}
document.querySelectorAll('[data-page], [data-go]').forEach(button => button.addEventListener('click', event => {
  if (button.tagName === 'A') event.preventDefault();
  showPage(button.dataset.page || button.dataset.go);
}));

function hoursBetweenTimes(start, end) {
  if (!start || !end || start === end) return null;
  const minutes = time => { const [hour, minute] = time.split(':').map(Number); return hour * 60 + minute; };
  return ((minutes(end) - minutes(start) + 24 * 60) % (24 * 60)) / 60;
}
const breakMinutesFor = shift => Math.max(0, Number(shift.breakMinutes) || 0);
const unpaidBreakHours = (minutes, paid) => paid ? 0 : Math.max(0, Number(minutes) || 0) / 60;
function applyBreakToForm(form, grossHours) {
  const minutes = Number(form.elements.breakMinutes.value) || 0;
  const paid = form.elements.breakPaid.checked;
  const message = Number.isFinite(grossHours) && minutes > grossHours * 60
    ? 'Break cannot be longer than the shift.' : '';
  form.elements.breakMinutes.setCustomValidity(message);
  return Math.max(0, grossHours - unpaidBreakHours(minutes, paid));
}
const shiftForm = $('#shift-form');
let shiftEditExactHours = null;
let shiftGrossHours = null;
let shiftBreakManual = false;
let shiftEarnedManual = false;
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
function openEditShift(id) {
  const shift = state.shifts.find(item => item.id === id);
  const dialog = $('#shift-dialog');
  if (!shift || dialog.open) return;
  closeShiftRow();
  shiftForm.reset();
  shiftForm.elements.shiftId.value = shift.id;
  for (const name of ['date', 'startTime', 'endTime', 'note']) shiftForm.elements[name].value = shift[name] || '';
  shiftForm.elements.rate.value = shift.rate ?? state.rate;
  shiftBreakManual = true;
  shiftForm.elements.breakMinutes.value = breakMinutesFor(shift);
  shiftForm.elements.breakPaid.checked = shift.breakPaid === true;
  shiftForm.elements.breakMinutes.setCustomValidity('');
  const completed = shiftIsComplete(shift);
  shiftForm.elements.earned.disabled = !completed;
  $('#shift-earned-field').hidden = !completed;
  $('#shift-earned-hint').hidden = !completed;
  shiftEarnedManual = completed && hasEarnedOverride(shift);
  shiftForm.elements.earned.value = completed ? earnedFor(shift).toFixed(2) : '';
  shiftForm.elements.hours.readOnly = false;
  shiftEditExactHours = Number(shift.hours);
  shiftGrossHours = shiftEditExactHours + unpaidBreakHours(breakMinutesFor(shift), shift.breakPaid === true);
  shiftForm.elements.hours.value = calendarHours(shiftEditExactHours);
  shiftForm.elements.startTime.required = false;
  shiftForm.elements.endTime.required = false;
  validateShiftTimes();
  $('#shift-title').textContent = 'Edit shift';
  $('#shift-submit').innerHTML = 'Save changes <span>↗</span>';
  $('#shift-time-hint').textContent = 'Adjust the times or hours to match your shift. An earlier end time means the next day.';
  updateShiftDateLabel();
  dialog.showModal();
}
function updateShiftEarnedEstimate() {
  if (shiftForm.elements.earned.disabled || shiftEarnedManual) return;
  const hours = shiftEditExactHours ?? Number(shiftForm.elements.hours.value);
  const rate = shiftForm.elements.rate.value === '' ? Number(state.rate) : Number(shiftForm.elements.rate.value);
  const amount = hours * rate;
  shiftForm.elements.earned.value = shiftForm.elements.hours.value !== '' && Number.isFinite(amount) && amount >= 0 ? amount.toFixed(2) : '';
}
function validateShiftTimes() {
  const start = shiftForm.elements.startTime.value;
  const end = shiftForm.elements.endTime.value;
  const message = (start || end) && (!start || !end) ? 'Enter both a start and an end time.' : start && end && start === end ? 'Start and end times must be different.' : '';
  shiftForm.elements.endTime.setCustomValidity(message);
  return !message;
}
function updateShiftBreak() {
  if (shiftGrossHours === null) {
    shiftForm.elements.breakMinutes.setCustomValidity('');
    return null;
  }
  const hours = applyBreakToForm(shiftForm, shiftGrossHours);
  shiftEditExactHours = hours;
  shiftForm.elements.hours.value = calendarHours(hours);
  updateShiftEarnedEstimate();
  return hours;
}
function updateShiftDuration() {
  validateShiftTimes();
  shiftGrossHours = hoursBetweenTimes(shiftForm.elements.startTime.value, shiftForm.elements.endTime.value);
  if (!shiftForm.elements.shiftId.value && !shiftBreakManual) {
    shiftForm.elements.breakMinutes.value = shiftGrossHours !== null && shiftGrossHours >= 6 ? '30' : '';
  }
  if (shiftGrossHours === null) {
    if (!shiftForm.elements.shiftId.value) shiftForm.elements.hours.value = '';
    shiftForm.elements.breakMinutes.setCustomValidity('');
    updateShiftEarnedEstimate();
    return null;
  }
  return updateShiftBreak();
}
for (const name of ['startTime', 'endTime']) {
  shiftForm.elements[name].addEventListener('input', updateShiftDuration);
  shiftForm.elements[name].addEventListener('change', updateShiftDuration);
}
for (const eventName of ['input', 'change']) {
  shiftForm.elements.breakMinutes.addEventListener(eventName, () => {
    shiftBreakManual = true;
    updateShiftBreak();
  });
  shiftForm.elements.breakPaid.addEventListener(eventName, updateShiftBreak);
}
shiftForm.elements.hours.addEventListener('input', () => {
  shiftEditExactHours = null;
  shiftGrossHours = shiftForm.elements.hours.value === '' ? null : Number(shiftForm.elements.hours.value) + unpaidBreakHours(shiftForm.elements.breakMinutes.value, shiftForm.elements.breakPaid.checked);
  shiftForm.elements.breakMinutes.setCustomValidity('');
  updateShiftEarnedEstimate();
});
shiftForm.elements.rate.addEventListener('input', updateShiftEarnedEstimate);
shiftForm.elements.earned.addEventListener('input', () => { shiftEarnedManual = shiftForm.elements.earned.value !== ''; });
shiftForm.addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const editId = form.elements.shiftId.value;
  const existing = editId ? state.shifts.find(item => item.id === editId) : null;
  if (editId && !existing) { form.closest('dialog').close(); return; }
  validateShiftTimes();
  const hours = existing ? (shiftEditExactHours ?? Number(form.elements.hours.value)) : updateShiftDuration();
  if (!form.reportValidity() || hours === null || !Number.isFinite(hours) || hours <= 0 || hours > 24) return;
  const data = new FormData(form);
  const rate = data.get('rate') === '' ? Number(state.rate) : Number(data.get('rate'));
  const details = { date: data.get('date'), startTime: data.get('startTime'), endTime: data.get('endTime'), hours, rate, breakMinutes: Number(data.get('breakMinutes')) || 0, breakPaid: form.elements.breakPaid.checked, note: data.get('note').trim() };
  if (existing) {
    const manualEarned = shiftIsComplete(existing) && shiftEarnedManual && form.elements.earned.value !== '';
    const earned = manualEarned ? Number(data.get('earned')) : null;
    if (manualEarned && (!Number.isFinite(earned) || earned < 0)) return;
    Object.assign(existing, details);
    if (manualEarned) existing.earnedOverride = earned;
    else delete existing.earnedOverride;
  } else state.shifts.push({ id: crypto.randomUUID(), ...details, completed: false });
  if (!persist()) return; form.closest('dialog').close(); toast(existing ? 'Shift updated.' : 'Shift scheduled.');
});
const finishForm = $('#finish-form');
const finishDialog = $('#finish-dialog');
let finishExactHours = null;
let finishGrossHours = null;
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
  finishForm.elements.breakMinutes.value = breakMinutesFor(shift);
  finishForm.elements.breakPaid.checked = shift.breakPaid === true;
  finishForm.elements.breakMinutes.setCustomValidity('');
  finishGrossHours = Number(shift.hours) + unpaidBreakHours(breakMinutesFor(shift), shift.breakPaid === true);
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
  if (hours !== null) { finishGrossHours = hours; updateFinishBreak(); }
}
for (const name of ['startTime', 'endTime']) {
  finishForm.elements[name].addEventListener('input', updateFinishTimes);
  finishForm.elements[name].addEventListener('change', updateFinishTimes);
}
function updateFinishBreak() {
  if (finishGrossHours !== null) setFinishHours(applyBreakToForm(finishForm, finishGrossHours));
}
for (const name of ['breakMinutes', 'breakPaid']) {
  finishForm.elements[name].addEventListener('input', updateFinishBreak);
  finishForm.elements[name].addEventListener('change', updateFinishBreak);
}
finishForm.elements.hours.addEventListener('input', () => {
  finishExactHours = null;
  finishGrossHours = finishForm.elements.hours.value === '' ? null : Number(finishForm.elements.hours.value) + unpaidBreakHours(finishForm.elements.breakMinutes.value, finishForm.elements.breakPaid.checked);
  finishForm.elements.breakMinutes.setCustomValidity('');
});
finishForm.addEventListener('submit', event => {
  event.preventDefault();
  const shift = state.shifts.find(item => item.id === finishForm.elements.shiftId.value);
  if (!shift) { finishDialog.close(); return; }
  const hours = finishExactHours === null ? Number(finishForm.elements.hours.value) : finishExactHours;
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24) { finishForm.elements.hours.reportValidity(); return; }
  if (!finishForm.reportValidity()) return;
  const wasCompleted = shiftIsComplete(shift);
  shift.hours = hours;
  shift.breakMinutes = Number(finishForm.elements.breakMinutes.value) || 0;
  shift.breakPaid = finishForm.elements.breakPaid.checked;
  if (!$('#finish-times').hidden) {
    shift.startTime = finishForm.elements.startTime.value;
    shift.endTime = finishForm.elements.endTime.value;
  }
  shift.completed = true;
  if (!persist()) return;
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
for (const shiftList of [$('#shift-list'), $('#home-next-shift'), $('#work-shift-list')]) {
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
  if (!persist()) return; event.currentTarget.closest('dialog').close(); toast('Expense added.');
});
$('#monthly-expense-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.monthlyExpenses.push({ id: crypto.randomUUID(), title: data.get('title').trim(), amount: Number(data.get('amount')), dueDay: Number(data.get('dueDay')), paidMonth: '' });
  if (!persist()) return; event.currentTarget.closest('dialog').close(); toast('Monthly expense added.');
});
$('#wish-form').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  state.wishes.push({ id: crypto.randomUUID(), title: data.get('title').trim(), target: Number(data.get('target')), saved: Number(data.get('saved')) || 0, folderId: folderForWish({ folderId: data.get('folderId') }) });
  if (!persist()) return; event.currentTarget.closest('dialog').close(); toast('A new thing to look forward to.');
});
$('#wish-folder-form').elements.name.addEventListener('input', event => event.target.setCustomValidity(''));
$('#wish-folder-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const name = form.elements.name.value.trim();
  const duplicate = getWishFolders().some(folder => folder.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  form.elements.name.setCustomValidity(!name ? 'Enter a folder name.' : duplicate ? 'A folder with this name already exists.' : '');
  if (!form.reportValidity()) return;
  const folder = { id: crypto.randomUUID(), name };
  state.wishFolders.push(folder);
  activeWishFolder = folder.id;
  if (!persist()) return;
  form.closest('dialog').close();
  toast('Folder created.');
});
$('#wish-move-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  const wish = state.wishes.find(item => item.id === form.elements.wishId.value);
  if (wish) {
    wish.folderId = folderForWish({ folderId: form.elements.folderId.value });
    if (!persist()) return;
    toast('Wish moved.');
  }
  form.closest('dialog').close();
});
$('#settings-form').addEventListener('submit', event => { event.preventDefault(); const data = new FormData(event.currentTarget); state.rate = Number(data.get('rate')); state.paydayDay = Number(data.get('paydayDay')); if (!persist()) return; event.currentTarget.closest('dialog').close(); toast('Settings updated.'); });
document.addEventListener('click', event => {
  const folderButton = event.target.closest('[data-wish-folder]');
  if (folderButton) {
    const id = folderButton.dataset.wishFolder;
    if (getWishFolders().some(folder => folder.id === id)) {
      activeWishFolder = id;
      renderWishes();
      $('#wish-folder-name').focus({ preventScroll: true });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    return;
  }
  const favoriteButton = event.target.closest('[data-toggle-wish-favorite]');
  if (favoriteButton) {
    const wish = state.wishes.find(item => item.id === favoriteButton.dataset.toggleWishFavorite);
    if (wish) {
      const willFavorite = !(Number(wish.favoriteAt) > 0);
      wish.favoriteAt = willFavorite ? Date.now() : 0;
      if (!persist()) return;
      toast(willFavorite ? 'Wish shown on Home.' : 'Wish removed from Home.');
    }
    return;
  }
  const moveWish = event.target.closest('[data-move-wish]');
  if (moveWish) {
    const wish = state.wishes.find(item => item.id === moveWish.dataset.moveWish);
    if (wish) {
      const form = $('#wish-move-form');
      form.reset();
      form.elements.wishId.value = wish.id;
      populateMoveWishFolders(folderForWish(wish));
      $('#wish-move-name').textContent = wish.title;
      $('#wish-move-dialog').showModal();
    }
    return;
  }
  const editDetails = event.target.closest('[data-edit-details]');
  if (editDetails) { openEditShift(editDetails.dataset.editDetails); return; }
  if (openShiftRow && !openShiftRow.contains(event.target)) closeShiftRow();
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
        state.expenses.push({ id: crypto.randomUUID(), date: dateKey(), title: bill.title, amount: Number(bill.amount), category: bill.category || 'Everyday', monthlyExpenseId: bill.id, monthlyPeriod: month });
        toast('Monthly expense marked paid.');
      }
      if (!persist()) return;
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
  const button = event.target.closest('[data-delete]');
  if (button) requestDelete(button);
});
let pendingDelete = null;
function requestDelete(button) {
  const type = button.dataset.delete;
  const list = { shift: 'shifts', expense: 'expenses', 'monthly-expense': 'monthlyExpenses', wish: 'wishes' }[type];
  const item = list && state[list].find(item => item.id === button.dataset.id);
  if (!item) return;
  const label = { shift: 'shift', expense: 'expense', 'monthly-expense': 'monthly expense', wish: 'wish' }[type];
  pendingDelete = { type, list, id: item.id };
  $('#delete-confirm-title').textContent = `Delete this ${label}?`;
  $('#delete-confirm-name').textContent = type === 'shift' ? `${item.note || 'Work shift'} · ${longDate(item.date)}` : item.title;
  $('#delete-confirm-message').textContent = type === 'monthly-expense'
    ? 'This removes the recurring expense. Payments already logged will stay in your expenses. This cannot be undone.'
    : type === 'wish'
      ? 'This removes the wish and its saved progress. This cannot be undone.'
      : type === 'shift'
        ? 'This removes the shift and updates your hours and earnings. This cannot be undone.'
        : 'This removes the expense and updates your spending total. This cannot be undone.';
  $('#delete-confirm-dialog').showModal();
}
$('#delete-confirm-dialog').addEventListener('close', () => { pendingDelete = null; });
$('#delete-confirm-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!pendingDelete) return;
  const { type, list, id } = pendingDelete;
  const item = state[list].find(item => item.id === id);
  if (item) {
    if (type === 'expense') {
      const bill = item.monthlyExpenseId && state.monthlyExpenses.find(bill => bill.id === item.monthlyExpenseId);
      if (bill && bill.paidMonth === item.monthlyPeriod) bill.paidMonth = '';
    }
    state[list] = state[list].filter(item => item.id !== id);
  }
  $('#delete-confirm-dialog').close();
  if (item) { if (!persist()) return; toast('Removed.'); }
});
$('#saving-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const wish = state.wishes.find(item => item.id === data.get('wishId'));
  if (wish) wish.saved = Number(wish.saved) + Number(data.get('amount'));
  if (!persist()) return; event.currentTarget.closest('dialog').close(); toast('Savings updated. Keep going!');
});

$('#date-stamp').textContent = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
render();

function dismissAppLoader() {
  const loader = $('#app-loader');
  const app = $('.app-shell');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const remaining = Math.max(0, (reduceMotion ? 0 : 700) - performance.now());
  window.setTimeout(() => {
    document.body.classList.remove('app-loading');
    app.inert = false;
    app.removeAttribute('aria-busy');
    if (!loader) return;
    loader.classList.add('is-leaving');
    window.setTimeout(() => loader.remove(), reduceMotion ? 0 : 300);
  }, remaining);
}
dismissAppLoader();

if (window.DaymakerCloud) void window.DaymakerCloud.start({
  read: () => state,
  replace: document => { state = { ...fresh(), ...document }; render(); },
  closeEditors: () => { document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close()); },
  openAccount: () => showPage('account', true),
  saveName: name => { state.profileName = name; return persist(); },
  openSettings: () => openDialog('settings-dialog'),
  notify: toast
}).catch(() => toast('Cloud login could not start. Your device data is still kept here.'));

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
