/* Closed X-Coin days store aggregate totals, not individual transaction details. */
(() => {
  'use strict';
  const dayKey = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && dayKey(new Date(`${value}T12:00:00`)) === value;
  const add = (a, b) => {
    const value = a + b;
    if (!Number.isSafeInteger(value)) throw new Error('An X-Coin total is too large to compact safely. Your entries have been kept.');
    return value;
  };
  function compactEntries(entries, today = dayKey(new Date())) {
    if (!Array.isArray(entries) || !validDate(today)) throw new Error('X-Coin storage could not be checked. Your entries have been kept.');
    const days = new Map();
    for (const entry of entries) {
      if (entry.kind === 'opening' || !validDate(entry.date) || !Number.isSafeInteger(entry.amountCents)) continue;
      if (!days.has(entry.date)) days.set(entry.date, []);
      days.get(entry.date).push(entry);
    }
    const compacted = new Map();
    for (const [date, items] of days) {
      const existing = items.filter(entry => entry.kind === 'daily');
      if (existing.length > 1) throw new Error('Two X-Coin daily results need review. Your entries have been kept.');
      const daily = existing[0];
      if (date >= today && !daily) continue;
      let amountCents = daily?.amountCents || 0;
      let inCents = daily?.inCents || 0;
      let outCents = daily?.outCents || 0;
      if (daily && (!Array.isArray(daily.sourceIds) || daily.sourceIds.some(id => typeof id !== 'string')
        || !Number.isSafeInteger(daily.inCents) || !Number.isSafeInteger(daily.outCents)
        || daily.inCents < 0 || daily.outCents < 0 || daily.inCents - daily.outCents !== daily.amountCents)) {
        throw new Error('An X-Coin daily result needs review. Your entries have been kept.');
      }
      // IDs prevent a stale device or guest import from adding already-compacted entries twice.
      // No individual amounts, notes or transaction objects are retained here.
      const sourceIds = new Set(daily?.sourceIds || []);
      const seen = new Set();
      for (const entry of items) {
        if (entry.kind === 'daily' || sourceIds.has(entry.id)) continue;
        if (typeof entry.id !== 'string' || seen.has(entry.id)) throw new Error('An X-Coin entry ID needs review. Your entries have been kept.');
        seen.add(entry.id);
        amountCents = add(amountCents, entry.amountCents);
        if (entry.amountCents > 0) inCents = add(inCents, entry.amountCents);
        else outCents = add(outCents, -entry.amountCents);
      }
      for (const id of seen) sourceIds.add(id);
      compacted.set(date, { id: `xcoin-day:${date}`, kind: 'daily', date, amountCents, inCents, outCents, sourceIds: [...sourceIds].sort() });
    }
    const result = [];
    const emitted = new Set();
    for (const entry of entries) {
      const daily = compacted.get(entry.date);
      if (daily && entry.kind !== 'opening' && validDate(entry.date) && Number.isSafeInteger(entry.amountCents)) {
        if (!emitted.has(entry.date)) { result.push(daily); emitted.add(entry.date); }
      } else result.push(entry);
    }
    return JSON.stringify(result) === JSON.stringify(entries) ? entries : result;
  }
  function compactDocument(document, today) {
    const entries = compactEntries(document.gamblingEntries || [], today);
    return entries === document.gamblingEntries ? document : { ...document, gamblingEntries: entries };
  }
  window.DaymakerXCoinStorage = Object.freeze({ compactEntries, compactDocument });
})();
