const $ = selector => document.querySelector(selector);
const STORAGE_KEY = 'daymark-tracker-v1';
const dateKey = date => {
  const d = date || new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const fresh = () => ({ rate: 220, paydayDay: 25, profileName: '', shifts: [], expenses: [], monthlyExpenses: [], wishes: [], wishFolders: [], gamblingEntries: [] });
let state;
try {
  const saved = window.DaymakerCloud ? window.DaymakerCloud.loadLocal() : JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  state = saved && typeof saved === 'object'
    ? { ...fresh(), ...saved, paydayDay: Number(saved.paydayDay) || 25, shifts: Array.isArray(saved.shifts) ? saved.shifts : [], expenses: Array.isArray(saved.expenses) ? saved.expenses : [], monthlyExpenses: Array.isArray(saved.monthlyExpenses) ? saved.monthlyExpenses : [], wishes: Array.isArray(saved.wishes) ? saved.wishes : [], wishFolders: Array.isArray(saved.wishFolders) ? saved.wishFolders : [], gamblingEntries: Array.isArray(saved.gamblingEntries) ? saved.gamblingEntries : [] }
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
  renderCalendar(); renderShifts(); renderTodayShifts(); renderExpenses(); renderMonthlyExpenses(); renderWishes(); renderActivity(); renderGambling();
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
let calendarFriendDays = new Map();
const friendCalendarColors = ['#80c7ff', '#c7a0ff', '#71ddbc', '#ffd078', '#ff9dcc', '#9fc96b'];
function friendCalendarColor(id) {
  let hash = 0;
  for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return friendCalendarColors[hash % friendCalendarColors.length];
}
function friendCalendarDetails(date) {
  const people = new Map();
  for (const shift of calendarFriendDays.get(date) || []) {
    if (!people.has(shift.friend_id)) people.set(shift.friend_id, { name: shift.nickname, shifts: [] });
    people.get(shift.friend_id).shifts.push(shift);
  }
  return [...people].map(([id, person]) => {
    const times = person.shifts.map(shift => {
      const label = shift.start_time && shift.end_time
        ? `${shift.start_time}–${shift.end_time}${shift.end_time < shift.start_time ? ' (+1 day)' : ''}`
        : 'Times not set';
      return `<div class="calendar-detail-time"><strong>${esc(label)}</strong></div>`;
    }).join('');
    return `<div class="calendar-detail-times calendar-friend-times"><div class="calendar-detail-person"><span class="calendar-detail-times-label">SHIFT TIMES</span><strong style="color:${friendCalendarColor(id)}">${esc(person.name)}</strong></div>${times}</div>`;
  }).join('');
}
let calendarHoldTimer;
const calendarHoverMedia = window.matchMedia('(hover: hover) and (pointer: fine)');
const calendarHours = hours => new Intl.NumberFormat('en-GB', { maximumFractionDigits: 2, useGrouping: false }).format(hours);
const calendarDateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

function showCalendarDay(date, showPopover = false) {
  calendarDay = date;
  const total = calendarTotals.get(date) || { hours: 0, pay: 0, plannedCount: 0, times: [] };
  const detail = $('#calendar-detail');
  const times = (total.times || []).map(item => `<div class="calendar-detail-time"><strong>${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}</strong>${item.scheduled ? '<small>Scheduled</small>' : ''}</div>`).join('');
  const friendDetails = friendCalendarDetails(date);
  const ownName = friendDetails ? `<strong>${esc(state.profileName || 'You')}</strong>` : '';
  const timeDetails = times ? `<div class="calendar-detail-times"><div class="calendar-detail-person"><span class="calendar-detail-times-label">SHIFT TIMES</span>${ownName}</div>${times}</div>` : '';
  detail.innerHTML = `<div class="calendar-detail-date">${calendarDateLabel(date)}</div><div class="calendar-detail-stats"><div><span>WORKED</span><strong>${calendarHours(total.hours)} h</strong></div><div><span>ESTIMATED PAY</span><strong>${money(total.pay)}</strong></div></div>${timeDetails}${friendDetails}`;
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
  const friendShifts = window.DaymakerFriends?.calendarForMonth(monthPrefix) || [];
  calendarFriendDays = new Map();
  const friends = new Map();
  for (const shift of friendShifts) {
    if (!shift.shift_date?.startsWith(monthPrefix + '-')) continue;
    if (!calendarFriendDays.has(shift.shift_date)) calendarFriendDays.set(shift.shift_date, []);
    calendarFriendDays.get(shift.shift_date).push(shift);
    friends.set(shift.friend_id, shift.nickname);
  }
  $('#calendar-friends-legend').innerHTML = [...friends].map(([id, name]) =>
    `<span><i style="background:${friendCalendarColor(id)}" aria-hidden="true"></i>${esc(name)}</span>`
  ).join('');
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
    const friendDays = calendarFriendDays.get(date) || [];
    const dayFriends = new Map(friendDays.map(shift => [shift.friend_id, shift.nickname]));
    const friendLabel = dayFriends.size ? `, friends working: ${[...dayFriends.values()].join(', ')}` : '';
    const dots = [...dayFriends.keys()].slice(0, 3).map(id =>
      `<i style="background:${friendCalendarColor(id)}"></i>`
    ).join('');
    const more = dayFriends.size > 3 ? `<small>+${dayFriends.size - 3}</small>` : '';
    const markers = today || dayFriends.size ? `<span class="calendar-day-dots" aria-hidden="true">${today ? '<i class="calendar-today-dot"></i>' : ''}${dots}${more}</span>` : '';
    tiles.push(`<button type="button" class="calendar-day${worked ? ' worked' : ''}${total.plannedCount ? ' planned' : ''}${today ? ' today' : ''}" data-date="${date}" aria-label="${esc(label + friendLabel)}"${today ? ' aria-current="date"' : ''} aria-pressed="false">${day}${markers}</button>`);
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
window.addEventListener('daymaker-friend-calendar', renderCalendar);
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
const rowSwipeDirection = row => row.dataset.swipeDirection === 'left' ? -1 : 1;

function shiftSwipeRow(item, content, kind = '') {
  return `<div class="shift-swipe-row${kind ? ` shift-swipe-${kind}` : ''}" data-row-shift="${esc(item.id)}" tabindex="0" role="group" aria-label="${esc(`${item.note || 'Work shift'}, ${longDate(item.date)}. Swipe right for Edit or Delete.`)}"><div class="shift-row-actions" aria-hidden="true" inert><button type="button" class="shift-row-edit" data-edit-details="${esc(item.id)}">Edit</button><button type="button" class="shift-row-delete" data-delete="shift" data-id="${esc(item.id)}">Delete</button></div><div class="shift-swipe-content">${content}</div></div>`;
}

function setShiftRowOpen(row, open) {
  if (!row) return;
  if (openShiftRow && openShiftRow !== row) closeShiftRow();
  row.classList.toggle('actions-open', open);
  row.style.setProperty('--shift-row-offset', `${open ? rowActionWidth(row) * rowSwipeDirection(row) : 0}px`);
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
for (const shiftPage of [$('#work-page'), $('#home-page'), $('#expenses-page'), $('#friends-page'), $('#gambling-page')]) {
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
  gesture.offset = Math.max(0, Math.min(gesture.actionWidth, (gesture.wasOpen ? gesture.actionWidth : 0) + dx * rowSwipeDirection(gesture.row)));
  gesture.row.style.setProperty('--shift-row-offset', `${gesture.offset * rowSwipeDirection(gesture.row)}px`);
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
  if (row && event.target === row && event.key === (rowSwipeDirection(row) === -1 ? 'ArrowLeft' : 'ArrowRight')) {
    event.preventDefault();
    setShiftRowOpen(row, true);
    row.querySelector('.shift-row-actions button').focus();
  } else if (openShiftRow && (event.key === 'Escape' || event.key === (rowSwipeDirection(openShiftRow) === -1 ? 'ArrowRight' : 'ArrowLeft')) && !event.target.closest('dialog')) {
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

const workShiftMonth = $('#work-shift-month');
const workShiftYear = $('#work-shift-year');
let selectedWorkPeriod = null;
let selectedGamblingPeriod = null;
const gamblingMonth = $('#xcoin-month');
const gamblingYear = $('#xcoin-year');
const workMonthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long' });

const workMonthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1).padStart(2, '0'),
  label: workMonthFormat.format(new Date(2000, index, 1)),
}));
const workPeriodPickers = [workShiftMonth, workShiftYear, gamblingMonth, gamblingYear];

function renderWorkPeriodPicker(picker, options, selected) {
  const value = picker.querySelector('.work-period-value');
  const list = picker.querySelector('.work-period-options');
  value.textContent = options.find(option => option.value === selected)?.label || selected;
  const buttons = options.map(({ value, label }) =>
    `<button type="button" data-period-value="${esc(value)}" aria-pressed="${value === selected}">${esc(label)}</button>`
  ).join('');
  if (list.innerHTML !== buttons) list.innerHTML = buttons;
}

for (const picker of workPeriodPickers) {
  const summary = picker.querySelector('summary');
  const list = picker.querySelector('.work-period-options');
  picker.addEventListener('toggle', () => {
    if (!picker.open) return;
    const selected = list.querySelector('[aria-pressed="true"]');
    if (selected) list.scrollTop = selected.offsetTop - (list.clientHeight - selected.offsetHeight) / 2;
  });
  list.addEventListener('click', event => {
    const choice = event.target.closest('[data-period-value]');
    if (!choice) return;
    const today = dateKey();
    const isWork = picker === workShiftMonth || picker === workShiftYear;
    const [year, month] = ((isWork ? selectedWorkPeriod : selectedGamblingPeriod) || today.slice(0, 7)).split('-');
    const value = choice.dataset.periodValue;
    const period = picker === workShiftMonth || picker === gamblingMonth ? `${year}-${value}` : `${value}-${month}`;
    if (isWork) selectedWorkPeriod = period;
    else selectedGamblingPeriod = period;
    picker.open = false;
    summary.focus({ preventScroll: true });
    resetShiftRowGesture();
    closeShiftRow();
    if (isWork) renderWorkShiftLists(today);
    else renderGambling();
  });
  picker.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !picker.open) return;
    event.preventDefault();
    event.stopPropagation();
    picker.open = false;
    summary.focus({ preventScroll: true });
  });
}
document.addEventListener('click', event => {
  for (const picker of workPeriodPickers) {
    if (!picker.contains(event.target)) picker.open = false;
  }
});

function renderShifts() {
  const today = dateKey();
  const nextShift = state.shifts.filter(item => !shiftIsComplete(item) && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''))[0];
  const hasTodayShift = nextShift?.date === today;
  $('#home-upcoming-shift').hidden = !nextShift;
  $('#home-upcoming-shift').setAttribute('aria-label', hasTodayShift ? 'Today’s shift' : 'Next shift');
  $('#home-next-shift').innerHTML = nextShift ? nextShiftCard(nextShift, hasTodayShift) : '';
  $('#work-next-shift').hidden = !nextShift || hasTodayShift;
  $('#work-next-shift').innerHTML = nextShift && !hasTodayShift ? nextShiftCard(nextShift) : '';
  renderWorkShiftLists(today);
}

function renderWorkShiftLists(today) {
  const period = selectedWorkPeriod || today.slice(0, 7);
  const [year, month] = period.split('-');
  const currentYear = Number(today.slice(0, 4));
  const years = new Set(Array.from({ length: 21 }, (_, index) => currentYear - 10 + index));
  years.add(Number(year));
  for (const shift of state.shifts) {
    if (/^\d{4}-/.test(shift.date)) years.add(Number(shift.date.slice(0, 4)));
  }
  const yearOptions = [...years].sort((a, b) => a - b)
    .map(value => ({ value: String(value), label: String(value) }));
  renderWorkPeriodPicker(workShiftMonth, workMonthOptions, month);
  renderWorkPeriodPicker(workShiftYear, yearOptions, year);

  const shifts = state.shifts.filter(item => item.date?.startsWith(`${period}-`));
  const upcoming = shifts.filter(item => !shiftIsComplete(item) && item.date >= today)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.startTime || '').localeCompare(b.startTime || ''));
  $('#upcoming-shift-list').innerHTML = upcoming.length ? upcoming.map(item => {
    const time = item.startTime && item.endTime ? `${esc(item.startTime)}–${esc(item.endTime)}${item.endTime < item.startTime ? ' (+1 day)' : ''}` : '';
    return shiftSwipeRow(item, `<article class="shift-card"><div class="shift-card-top"><div class="record-main"><strong>${esc(item.note || 'Work shift')}</strong><span>${longDate(item.date)}${time ? ` · ${time}` : ''} · ${calendarHours(Number(item.hours))} hours at ${money(item.rate)}/h</span></div><div class="record-amount">${money(earnedFor(item))}<small class="shift-planned-amount">planned</small></div></div></article>`);
  }).join('') : '<p class="work-shift-empty">No upcoming shifts for this month.</p>';
  const todayMillis = Date.parse(`${today}T00:00:00Z`);
  const dayDistance = date => Math.abs((Date.parse(`${date}T00:00:00Z`) - todayMillis) / 86400000);
  const rows = shifts.filter(item => shiftIsComplete(item) || item.date < today).sort((a, b) => dayDistance(a.date) - dayDistance(b.date) || b.date.localeCompare(a.date));
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
  }).join('') : empty('No shift history for this month', 'Completed and past shifts will appear here.', '◷');
}

const gamblingMoney = cents => new Intl.NumberFormat('nb-NO', {
  style: 'currency', currency: 'NOK', minimumFractionDigits: 2, maximumFractionDigits: 2
}).format(cents / 100).replace(/\s/g, ' ');
function gamblingTotals(entries) {
  return entries.reduce((totals, entry) => {
    if (!Number.isSafeInteger(entry.amountCents)) return totals;
    totals.balance += entry.amountCents;
    if (entry.amountCents > 0) totals.incoming += entry.amountCents;
    else totals.outgoing -= entry.amountCents;
    return totals;
  }, { balance: 0, incoming: 0, outgoing: 0 });
}
function gamblingMonthlyResults(entries, through = new Date()) {
  const months = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(through.getFullYear(), through.getMonth() - 5 + index, 1);
    return {
      key: dateKey(month).slice(0, 7),
      label: month.toLocaleDateString('en-GB', { month: 'short' }),
      fullLabel: month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
      year: month.getFullYear(), cents: 0
    };
  });
  const byMonth = new Map(months.map(month => [month.key, month]));
  for (const entry of entries) {
    const month = byMonth.get(String(entry.date || '').slice(0, 7));
    if (month && entry.kind !== 'opening' && Number.isSafeInteger(entry.amountCents)) month.cents += entry.amountCents;
  }
  return months;
}
const gamblingResultClass = cents => cents > 0 ? 'xcoin-gain' : cents < 0 ? 'xcoin-loss' : 'xcoin-even';
const gamblingSignedMoney = cents => `${cents > 0 ? '+' : cents < 0 ? '−' : ''}${gamblingMoney(Math.abs(cents))}`;
function renderGamblingChart() {
  const months = gamblingMonthlyResults(state.gamblingEntries);
  const current = months[months.length - 1];
  $('#xcoin-current-month').textContent = current.label;
  const net = $('#xcoin-month-net');
  net.textContent = gamblingSignedMoney(current.cents);
  net.className = gamblingResultClass(current.cents);
  const max = Math.max(1, ...months.map(month => Math.abs(month.cents)));
  const description = months.map(month => `${month.fullLabel}: ${gamblingSignedMoney(month.cents)}`).join('; ');
  const baseline = 88;
  const bars = months.map((month, index) => {
    const x = index * 50 + 25;
    const height = month.cents ? Math.max(3, Math.abs(month.cents) / max * 68) : 0;
    const y = baseline - height;
    const signY = y - 6;
    return `<g class="${gamblingResultClass(month.cents)}">
      <title>${esc(`${month.fullLabel}: ${gamblingSignedMoney(month.cents)}`)}</title>
      ${height ? `<rect x="${x - 13}" y="${y}" width="26" height="${height}" rx="6" fill="currentColor"/><text x="${x}" y="${signY}" text-anchor="middle" fill="currentColor" class="xcoin-chart-sign">${month.cents > 0 ? '+' : '−'}</text>` : `<line x1="${x - 8}" x2="${x + 8}" y1="${baseline}" y2="${baseline}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`}
    </g>`;
  }).join('');
  $('#xcoin-monthly-chart').innerHTML = `<svg viewBox="0 0 300 100" role="img" aria-label="${esc(`Monthly net results. ${description}`)}"><line x1="0" x2="300" y1="${baseline}" y2="${baseline}" stroke="#ffffff24"/>${bars}</svg>
    <div class="xcoin-chart-labels" aria-hidden="true">${months.map(month => `<div><span>${month.label}</span><small>${month.year}</small></div>`).join('')}</div>`;
}
function addGamblingEntry(direction, amount, note, opening = false) {
  const cents = Math.round(amount * 100);
  const previousOpening = opening ? state.gamblingEntries.find(entry => entry.kind === 'opening') : null;
  const entries = opening ? state.gamblingEntries.filter(entry => entry.kind !== 'opening') : state.gamblingEntries;
  const current = gamblingTotals(entries);
  if (![1, -1].includes(direction) || !Number.isFinite(amount) || amount < 0 || (!opening && amount === 0)
    || amount > 1000000000 || !Number.isSafeInteger(cents)
    || Math.abs(amount * 100 - cents) > 0.000001
    || !Number.isSafeInteger(current.balance + direction * cents)) return false;
  const previous = state;
  state = {
    ...state,
    gamblingEntries: [...entries, {
      ...(previousOpening || {}),
      id: opening ? previousOpening?.id || 'xcoin-opening-balance-v1' : crypto.randomUUID(),
      date: previousOpening?.date || dateKey(), amountCents: direction * cents,
      note: opening ? 'Previous total' : String(note || '').trim().slice(0, 60),
      ...(opening ? { kind: 'opening' } : {})
    }]
  };
  if (persist()) return true;
  state = previous;
  render();
  return false;
}
function gamblingSwipeRow(entry, content, label) {
  return `<div class="shift-swipe-row xcoin-swipe-row" data-swipe-direction="left" data-action-width="64" tabindex="0" role="group" aria-label="${esc(`${label}. Swipe left to reveal Delete.`)}"><div class="shift-row-actions" aria-hidden="true" inert><button type="button" class="shift-row-delete" data-delete="gambling" data-id="${esc(entry.id)}" aria-label="${esc(`Delete ${label}`)}">Delete</button></div><div class="shift-swipe-content">${content}</div></div>`;
}
function renderGambling() {
  const period = selectedGamblingPeriod || dateKey().slice(0, 7);
  const [year, month] = period.split('-');
  const currentYear = new Date().getFullYear();
  const years = new Set(Array.from({ length: 21 }, (_, index) => currentYear - 10 + index));
  years.add(Number(year));
  for (const entry of state.gamblingEntries) {
    if (/^\d{4}-/.test(entry.date)) years.add(Number(entry.date.slice(0, 4)));
  }
  renderWorkPeriodPicker(gamblingMonth, workMonthOptions, month);
  renderWorkPeriodPicker(gamblingYear, [...years].sort((a, b) => a - b).map(value => ({ value: String(value), label: String(value) })), year);
  const totals = gamblingTotals(state.gamblingEntries);
  const dots = new Intl.NumberFormat('en-GB', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
  }).format(totals.balance / 100).replace(/,/g, ' ');
  renderDotValue($('#gambling-balance'), dots, gamblingMoney(totals.balance), 'kr', 'balance');
  const monthly = gamblingMonthlyResults(state.gamblingEntries)[5];
  $('#gambling-month-direction').textContent = monthly.cents < 0 ? 'out' : 'in';
  $('#gambling-month-amount').textContent = gamblingMoney(Math.abs(monthly.cents));
  $('#gambling-balance-month').textContent = `${monthly.label.toUpperCase()} ${monthly.year}`;
  renderGamblingChart();
  const entries = [...state.gamblingEntries].filter(entry => entry.kind !== 'opening' && entry.date?.startsWith(`${period}-`)).reverse().sort((a, b) => b.date.localeCompare(a.date));
  const transactions = entries.length ? entries.map(entry => {
    const incoming = entry.amountCents > 0;
    const label = entry.note || (incoming ? 'In' : 'Out');
    return gamblingSwipeRow(entry, `<article class="record-row">
      <span class="record-icon${incoming ? '' : ' expense-icon'}" aria-hidden="true">${incoming ? '＋' : '−'}</span>
      <div class="record-main"><strong>${esc(label)}</strong><span>${longDate(entry.date)}</span></div>
      <div class="record-amount${incoming ? '' : ' expense-amount'}">${incoming ? '+' : '−'}${gamblingMoney(Math.abs(entry.amountCents))}</div>
    </article>`, label);
  }).join('') : empty('No entries for this month', 'Choose another month or use + or − to log an entry for today.', '↕');
  $('#gambling-transactions').innerHTML = transactions;
}
function openGamblingEntry(direction, opening = false) {
  const previousOpening = opening ? state.gamblingEntries.find(entry => entry.kind === 'opening') : null;
  const form = $('#gambling-entry-form');
  form.reset();
  form.elements.amount.setCustomValidity('');
  form.elements.amount.min = opening ? '0' : '0.01';
  form.elements.direction.value = direction;
  form.elements.kind.value = opening ? 'opening' : 'entry';
  if (opening) {
    form.elements.openingDirection.value = previousOpening?.amountCents < 0 ? '-1' : '1';
    form.elements.amount.value = previousOpening ? (Math.abs(previousOpening.amountCents) / 100).toFixed(2) : '';
  }
  $('#xcoin-opening-direction').hidden = !opening;
  $('#gambling-entry-note').hidden = opening;
  $('#gambling-entry-title').textContent = opening ? previousOpening ? 'Edit previous total' : 'Previous total' : direction > 0 ? 'Add money' : 'Subtract money';
  $('#gambling-entry-submit').innerHTML = `${opening ? 'Save previous total' : 'Save entry'} <span>↗</span>`;
  $('#gambling-entry-dialog').showModal();
}
document.querySelectorAll('[data-gambling-direction]').forEach(button => {
  button.addEventListener('click', () => openGamblingEntry(Number(button.dataset.gamblingDirection)));
});
document.addEventListener('click', event => {
  if (event.target.closest('[data-gambling-edit-opening]')) {
    resetShiftRowGesture();
    closeShiftRow();
    openGamblingEntry(1, true);
  }
});
$('#gambling-entry-form').elements.amount.addEventListener('input', event => event.target.setCustomValidity(''));
$('#gambling-entry-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!form.reportValidity()) return;
  const opening = form.elements.kind.value === 'opening';
  const direction = Number(opening ? form.elements.openingDirection.value : form.elements.direction.value);
  if (!addGamblingEntry(direction, Number(form.elements.amount.value), form.elements.note.value, opening)) {
    toast('Could not save the entry. Check the amount and try again.');
    return;
  }
  form.closest('dialog').close();
  toast('Balance updated.');
});

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

const wishIsPurchased = wish => Boolean(wish.purchasedAt);
const wishIsFunded = wish => Number.isFinite(Number(wish.target)) && Number(wish.target) > 0
  && Number(wish.saved) >= Number(wish.target);

function purchaseWish(id, expectedAmount) {
  const wish = state.wishes.find(item => item.id === id);
  if (!wish || wishIsPurchased(wish) || !wishIsFunded(wish)) {
    toast('This wish changed. Close this window and check your wishlist.');
    return false;
  }
  if (Number(wish.target) !== expectedAmount) {
    toast('The wish price changed. Please check it and try again.');
    return false;
  }
  // A stable expense ID prevents two devices from recording the same purchase twice.
  const expenseId = `wish-purchase-${wish.id}`;
  const existing = state.expenses.find(item => item.id === expenseId || item.wishId === wish.id);
  const expense = existing || {
    id: expenseId,
    wishId: wish.id,
    date: dateKey(),
    title: wish.title,
    amount: Number(wish.target),
    category: 'Wishlist'
  };
  const previous = state;
  state = {
    ...state,
    wishes: state.wishes.map(item => item.id === id ? {
      ...item,
      purchasedAt: new Date().toISOString(),
      purchasedDate: expense.date,
      purchaseAmount: Number(expense.amount),
      purchaseExpenseId: expense.id
    } : item),
    expenses: existing ? state.expenses : [...state.expenses, expense]
  };
  if (persist()) return true;
  state = previous;
  render();
  return false;
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
  const purchaseButton = wishIsFunded(item)
    ? `<button class="save-more wish-purchase-button" data-purchase-wish="${esc(item.id)}" type="button" aria-label="${esc(`Mark ${item.title} as purchased`)}">✓ Got it</button>`
    : `<button class="save-more" data-add-saving="${esc(item.id)}" type="button">＋ Add</button>`;
  const favoriteButton = allowMove ? `<button type="button" class="wish-favorite-button${favorite ? ' is-favorite' : ''}" data-toggle-wish-favorite="${esc(item.id)}" aria-label="${esc(favorite ? `Remove ${item.title} from Home wishlist` : `Show ${item.title} on Home`)}" aria-pressed="${favorite}" title="${esc(favorite ? 'Remove from Home wishlist' : 'Show on Home')}">${favorite ? '♥' : '☆'}</button>` : '';
  return `<article class="wish-card ${colors[index % colors.length]}"><div class="wish-top">${favoriteButton}<div class="wish-card-actions">${move}<button class="delete-button" data-delete="wish" data-id="${esc(item.id)}" aria-label="Delete wish">×</button></div></div><h3>${esc(item.title)}</h3><div class="wish-amounts"><strong>${money(item.saved)}</strong><span>of ${money(item.target)}</span></div><div class="wish-progress"><span style="width:${ratio}%"></span></div><div class="wish-card-foot"><p>${ratio >= 100 ? 'You made it! ✨' : `${Math.round(ratio)}% saved`}</p>${purchaseButton}</div></article>`;
}
function wishFolderCard(folder, index) {
  const folderWishes = state.wishes.filter(wish => folderForWish(wish) === folder.id);
  const wishes = folderWishes.filter(wish => !wishIsPurchased(wish));
  const target = wishes.reduce((sum, wish) => sum + Number(wish.target), 0);
  const saved = wishes.reduce((sum, wish) => sum + Number(wish.saved), 0);
  const ratio = target ? Math.max(0, Math.min(100, saved / target * 100)) : 0;
  const colors = ['wish-peach', 'wish-mint', 'wish-lilac', 'wish-yellow'];
  const emptyLabel = folderWishes.length ? '' : 'Add your first wish';
  const remove = folder.id === GENERAL_WISH_FOLDER ? '' : `<button type="button" class="wish-folder-delete" data-delete="wish-folder" data-id="${esc(folder.id)}" aria-label="Delete ${esc(folder.name)} folder" title="Delete folder">×</button>`;
  return `<article class="wish-folder-card ${colors[index % colors.length]}"><button type="button" class="wish-folder-open" data-wish-folder="${esc(folder.id)}"><span class="wish-folder-top"><span class="wish-folder-icon">${wishFolderIcon}</span></span><strong class="wish-folder-title">${esc(folder.name)}</strong><span class="wish-folder-amount">${wishes.length ? `${money(saved)} <small>of ${money(target)}</small>` : emptyLabel}</span><span class="wish-progress"><span style="width:${ratio}%"></span></span></button>${remove}</article>`;
}
function renderWishes() {
  const wishes = state.wishes.filter(wish => !wishIsPurchased(wish));
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
  const purchased = activeWishFolder ? state.wishes.filter(wish =>
    wishIsPurchased(wish) && folderForWish(wish) === activeWishFolder
  ).sort((a, b) => b.purchasedAt.localeCompare(a.purchasedAt)) : [];
  $('#wishlist-purchased').hidden = purchased.length === 0;
  $('#wishlist-purchased-list').innerHTML = purchased.map(wish => `
    <article class="record-row">
      <span class="record-icon expense-icon" aria-hidden="true">✓</span>
      <div class="record-main"><strong>${esc(wish.title)}</strong><span>${longDate(wish.purchasedDate)} · Purchased</span></div>
      <div class="record-amount expense-amount">−${money(wish.purchaseAmount)}</div>
      <button class="delete-button" data-delete="wish" data-id="${esc(wish.id)}" aria-label="${esc(`Remove ${wish.title} from Purchased`)}">×</button>
    </article>`
  ).join('');
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
function setAccountMenuOpen(open) {
  if (open && $('#account-signed-in').hidden) {
    showPage('account', true);
    return;
  }
  $('#account-dropdown').hidden = !open;
  $('#account-open').setAttribute('aria-expanded', String(open));
}
const accountMenu = $('#account-menu');
document.addEventListener('click', event => {
  if (!accountMenu.contains(event.target)) setAccountMenuOpen(false);
});
accountMenu.addEventListener('focusout', event => {
  if (!accountMenu.contains(event.relatedTarget)) setAccountMenuOpen(false);
});
accountMenu.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('#account-dropdown').hidden) {
    event.preventDefault();
    setAccountMenuOpen(false);
    $('#account-open').focus();
  } else if (event.target === $('#account-open') && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
    event.preventDefault();
    setAccountMenuOpen(true);
    const buttons = $('#account-dropdown').querySelectorAll('button');
    if (!$('#account-dropdown').hidden) buttons[event.key === 'ArrowUp' ? buttons.length - 1 : 0].focus();
  }
});

function showPage(page, focusHeading = false) {
  if (!document.getElementById(`${page}-page`)) return;
  setAccountMenuOpen(false);
  if (page === 'wishlist') { activeWishFolder = null; renderWishes(); }
  resetShiftRowGesture(); closeShiftRow();
  $('#calendar-popover').hidden = true;
  document.querySelectorAll('.page').forEach(section => { section.hidden = section.id !== `${page}-page`; section.classList.toggle('active', !section.hidden); });
  if (page === 'calendar') {
    renderCalendar();
    void window.DaymakerFriends?.refreshCalendar();
  }
  document.querySelectorAll('.tab').forEach(tab => { const active = tab.dataset.page === page || (page === 'gambling' && tab.dataset.page === 'expenses'); tab.classList.toggle('active', active); if (active) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current'); });
  if (page === 'friends') void window.DaymakerFriends?.refresh();
  if (page === 'account') void window.DaymakerReminders?.refresh();
  if (page === 'account' || page === 'friends') $('#account-open').setAttribute('aria-current', 'page');
  else $('#account-open').removeAttribute('aria-current');
  window.scrollTo({ top: 0, behavior: 'smooth' });
  if (focusHeading) document.querySelector(`#${page}-page h1`)?.focus({ preventScroll: true });
}
document.querySelectorAll('[data-page], [data-go]').forEach(button => button.addEventListener('click', event => {
  if (button.tagName === 'A') event.preventDefault();
  showPage(button.dataset.page || button.dataset.go, !!button.closest('#account-dropdown') || button.id === 'gambling-open');
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
  const purchaseButton = event.target.closest('[data-purchase-wish]');
  if (purchaseButton) {
    const wish = state.wishes.find(item => item.id === purchaseButton.dataset.purchaseWish);
    if (wish && !wishIsPurchased(wish) && wishIsFunded(wish)) {
      const form = $('#wish-purchase-form');
      form.elements.wishId.value = wish.id;
      form.elements.amount.value = wish.target;
      $('#wish-purchase-description').textContent = `Add ${wish.title} to Expenses for ${money(wish.target)} today and move it to Purchased in its folder?`;
      $('#wish-purchase-dialog').showModal();
    }
    return;
  }
  const favoriteButton = event.target.closest('[data-toggle-wish-favorite]');
  if (favoriteButton) {
    const wish = state.wishes.find(item => item.id === favoriteButton.dataset.toggleWishFavorite);
    if (wish && !wishIsPurchased(wish)) {
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
    if (wish && !wishIsPurchased(wish)) {
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
  const list = { shift: 'shifts', expense: 'expenses', 'monthly-expense': 'monthlyExpenses', wish: 'wishes', gambling: 'gamblingEntries' }[type];
  const item = type === 'wish-folder'
    ? state.wishFolders.find(folder => folder.id === button.dataset.id)
    : list && state[list].find(item => item.id === button.dataset.id);
  if (!item || (type === 'wish-folder' && item.id === GENERAL_WISH_FOLDER)) return;
  const label = { shift: 'shift', expense: 'expense', 'monthly-expense': 'monthly expense', wish: 'wish', 'wish-folder': 'wishlist folder', gambling: 'entry' }[type];
  pendingDelete = { type, list, id: item.id };
  $('#delete-confirm-title').textContent = `Delete this ${label}?`;
  $('#delete-confirm-name').textContent = type === 'shift' ? `${item.note || 'Work shift'} · ${longDate(item.date)}` : type === 'wish-folder' ? item.name : type === 'gambling' ? (item.note || (item.amountCents > 0 ? 'In' : 'Out')) : item.title;
  $('#delete-confirm-message').textContent = type === 'gambling'
    ? 'This removes the entry and updates your X-Coin balance. This cannot be undone.'
    : type === 'monthly-expense'
    ? 'This removes the recurring expense. Payments already logged will stay in your expenses. This cannot be undone.'
    : type === 'wish'
      ? wishIsPurchased(item)
        ? 'This removes the item from Purchased. Its expense will stay in Expenses. This cannot be undone.'
        : 'This removes the wish and its saved progress. This cannot be undone.'
      : type === 'wish-folder'
        ? 'Wishes in this folder will be moved to General. This cannot be undone.'
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
  if (type === 'gambling') {
    const previous = state;
    state = { ...state, gamblingEntries: state.gamblingEntries.filter(entry => entry.id !== id) };
    if (!persist()) {
      state = previous;
      render();
      return;
    }
    $('#delete-confirm-dialog').close();
    toast('Removed.');
    return;
  }
  const item = type === 'wish-folder'
    ? state.wishFolders.find(folder => folder.id === id)
    : state[list].find(item => item.id === id);
  if (item) {
    if (type === 'wish-folder') {
      state.wishes.forEach(wish => { if (folderForWish(wish) === id) wish.folderId = GENERAL_WISH_FOLDER; });
      state.wishFolders = state.wishFolders.filter(folder => folder.id !== id);
      if (activeWishFolder === id) activeWishFolder = null;
    } else {
      if (type === 'expense') {
        const bill = item.monthlyExpenseId && state.monthlyExpenses.find(bill => bill.id === item.monthlyExpenseId);
        if (bill && bill.paidMonth === item.monthlyPeriod) bill.paidMonth = '';
      }
      state[list] = state[list].filter(item => item.id !== id);
    }
  }
  $('#delete-confirm-dialog').close();
  if (item) { if (!persist()) return; toast('Removed.'); }
});
$('#wish-purchase-form').addEventListener('submit', event => {
  event.preventDefault();
  const form = event.currentTarget;
  if (!purchaseWish(form.elements.wishId.value, Number(form.elements.amount.value))) return;
  form.closest('dialog').close();
  toast('Added to Expenses and Purchased.');
});
$('#saving-form').addEventListener('submit', event => {
  event.preventDefault();
  const data = new FormData(event.currentTarget);
  const wish = state.wishes.find(item => item.id === data.get('wishId'));
  if (!wish || wishIsPurchased(wish)) {
    event.currentTarget.closest('dialog').close();
    return;
  }
  wish.saved = Number(wish.saved) + Number(data.get('amount'));
  if (!persist()) return; event.currentTarget.closest('dialog').close(); toast('Savings updated. Keep going!');
});

$('#date-stamp').textContent = new Date().toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }).toUpperCase();
render();
function openWorkReminder(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime()) || dateKey(parsed) !== date) return;
  calendarMonth = new Date(parsed.getFullYear(), parsed.getMonth(), 1);
  calendarDay = date;
  showPage('calendar', true);
  renderCalendar();
  showCalendarDay(date);
}
const reminderDate = location.hash.match(/^#work-reminder=(\d{4}-\d{2}-\d{2})$/)?.[1];
if (reminderDate) openWorkReminder(reminderDate);
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', event => {
    if (event.data?.type === 'daymaker-work-reminder') openWorkReminder(event.data.date);
  });
}


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
  openAccountMenu: () => setAccountMenuOpen($('#account-dropdown').hidden),
  closeAccountMenu: () => setAccountMenuOpen(false),
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
