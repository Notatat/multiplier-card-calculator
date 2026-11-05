(function (root) {
  'use strict';
  const DURATIONS = [5, 1440, 10080, 20160];
  const RATES = [1, 2, 3, 5, 10];
  const LEGACY_CARDS = [
    { minutes: 20160, rate: 5 }, { minutes: 10080, rate: 5 },
    { minutes: 10080, rate: 10 }, { minutes: 10080, rate: 1 },
    { minutes: 5, rate: 1 }, { minutes: 5, rate: 5 }, { minutes: 5, rate: 3 }
  ];
  function label(card) { return `+${card.minutes === 5 ? '5分钟' : `${card.minutes / 1440}天`}${1 + card.rate / 10}倍`; }
  function normalizeRows(rows, allowReview = false) {
    if (!Array.isArray(rows)) throw Error('卡片列表无效');
    const cards = [], counts = [], indices = new Map();
    for (const row of rows) {
      if (!DURATIONS.includes(row.minutes) || !RATES.includes(row.rate)) throw Error('请选择有效的卡片时长和倍率');
      if (!allowReview && row.rate === 10 && row.minutes > 10080) throw Error('2倍卡时长最多7天，不能使用14天2倍卡');
      if (!Number.isSafeInteger(row.count) || row.count < 0 || row.count > 9999) throw Error('卡片数量须为0～9999的整数');
      if (!row.count) continue;
      const key = `${row.minutes}:${row.rate}`;
      if (indices.has(key)) {
        const index = indices.get(key); counts[index] += row.count;
        if (counts[index] > 9999) throw Error(`${label(row)}合计不能超过9999张`);
      } else {
        indices.set(key, cards.length); cards.push({ minutes: row.minutes, rate: row.rate }); counts.push(row.count);
      }
    }
    return { cards, counts };
  }
  function normalize(rows) { return normalizeRows(rows); }
  function restore(saved) {
    if (!saved || !Number.isSafeInteger(saved.minutes) || saved.minutes < 0 || !Array.isArray(saved.counts)) return null;
    const cards = saved.cards === undefined ? LEGACY_CARDS : saved.cards;
    if (!Array.isArray(cards) || cards.length !== saved.counts.length || cards.length > 20) return null;
    try {
      const inventory = normalizeRows(cards.map((card, i) => ({ minutes: card.minutes, rate: card.rate, count: saved.counts[i] })), true);
      return { ...saved, ...inventory, needsCardReview: inventory.cards.some(card => card.rate === 10 && card.minutes > 10080) };
    } catch { return null; }
  }
  const api = { DURATIONS, RATES, LEGACY_CARDS, label, normalize, restore };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CardInventory = api;
})(typeof self !== 'undefined' ? self : globalThis);
