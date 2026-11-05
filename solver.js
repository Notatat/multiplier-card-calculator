/* Integer energy = duration in minutes × 10 × (multiplier − 1).
 * Switching multiplier preserves existing energy; a card adds minutes × rate.
 * All card lookups use the normalized per-input table. Double-card limits are
 * aggregate limits across every duration of a card whose rate is 10 (= 2x).
 */
(function (root) {
  'use strict';
  const DAY = 1440;
  const ALLOWED_RATES = [1, 2, 3, 5, 10];
  const ALLOWED_MINUTES = [5, DAY, 7 * DAY, 14 * DAY];
  const CARDS = [
    { label: '+14天1.5倍', minutes: 14 * DAY, rate: 5 },
    { label: '+7天1.5倍', minutes: 7 * DAY, rate: 5 },
    { label: '+7天2倍', minutes: 7 * DAY, rate: 10 },
    { label: '+7天1.1倍', minutes: 7 * DAY, rate: 1 },
    { label: '+5分钟1.1倍', minutes: 5, rate: 1 },
    { label: '+5分钟1.5倍', minutes: 5, rate: 5 },
    { label: '+5分钟1.3倍', minutes: 5, rate: 3 }
  ];
  const RATE_LIMIT = { 1: 770 * DAY, 5: 154 * DAY };
  const DOUBLE_LIMIT = 84 * DAY;

  function laterDoubleDays(a, b) {
    for (let i = Math.max(a.length, b.length) - 1; i >= 0; i--) {
      const left = a[i] === undefined ? -1 : a[i];
      const right = b[i] === undefined ? -1 : b[i];
      if (left !== right) return left > right;
    }
    return false;
  }

  function normalizeCards(input) {
    if (input.cards === undefined) return CARDS.map(card => ({ ...card }));
    if (!Array.isArray(input.cards) || input.cards.length > 19) throw Error('卡片类型须为最多19种不同组合');
    const seen = new Set();
    return input.cards.map(card => {
      if (!card || !ALLOWED_MINUTES.includes(card.minutes) || !ALLOWED_RATES.includes(card.rate)) {
        throw Error('卡片时长或倍率无效');
      }
      if (card.rate === 10 && card.minutes > 7 * DAY) {
        throw Error('2倍卡时长最多7天，不支持14天2倍卡');
      }
      const key = card.minutes + ':' + card.rate;
      if (seen.has(key)) throw Error('卡片组合重复，请先合并数量');
      seen.add(key);
      const duration = card.minutes === 5 ? '5分钟' : (card.minutes / DAY) + '天';
      const multiplier = card.rate === 10 ? '2' : '1.' + card.rate;
      return { minutes: card.minutes, rate: card.rate, label: '+' + duration + multiplier + '倍' };
    });
  }

  function solve(input, progress) {
    if (!input || typeof input !== 'object') throw Error('输入无效');
    const cards = normalizeCards(input);
    if (!Array.isArray(input.counts) || input.counts.length !== cards.length ||
        input.counts.some(n => !Number.isSafeInteger(n) || n < 0 || n > 9999)) {
      throw Error('卡片数量须与卡片类型对应，且为0～9999的整数');
    }
    if (!Number.isSafeInteger(input.minutes) || input.minutes < 0 || input.minutes > 100000000 ||
        !ALLOWED_RATES.includes(input.rate)) throw Error('初始时间或倍率无效');
    const mode = input.mode === undefined ? 'longest' : input.mode;
    if (!['longest', 'final-double', 'daily-double'].includes(mode)) throw Error('计算方式无效');
    const rawMaxRouteDays = input.maxRouteDays;
    const maxRouteDays = rawMaxRouteDays === null || rawMaxRouteDays === undefined ||
      (typeof rawMaxRouteDays === 'string' && rawMaxRouteDays.trim() === '') ? null : rawMaxRouteDays;
    if (maxRouteDays !== null && (!Number.isInteger(maxRouteDays) || maxRouteDays < 1 || maxRouteDays > 9999)) {
      throw Error('路线最大天数须为1～9999的整数，或留空不限');
    }
    const dayCardsOnly = input.dayCardsOnly === true;
    const daily = mode === 'daily-double';
    const counts = input.counts.map((n, i) => dayCardsOnly && cards[i].minutes === 5 ? 0 : n);
    const totalDoubleStock = counts.reduce((sum, n, i) => sum + (cards[i].rate === 10 ? n : 0), 0);
    const hasDouble = totalDoubleStock > 0;
    const initialLocked = input.rate === 10 && input.minutes > 45 * DAY;
    const targetRate = hasDouble || initialLocked ? 10 : 5;
    const cap = targetRate === 10 ? DOUBLE_LIMIT * 10 : RATE_LIMIT[5] * 5;
    const initialEnergy = input.minutes * input.rate;

    // final-double may choose any ONE of the available double-card durations.
    // Taking the largest available contribution gives an optimistic upper bound
    // without incorrectly allowing one double card of each duration.
    function remainingBounds(state) {
      let remainingEnergy = 0, remaining15Energy = 0, bestDoubleEnergy = 0;
      for (let i = 0; i < cards.length; i++) {
        const n = counts[i] - state.used[i], card = cards[i];
        if (n <= 0) continue;
        const unitEnergy = card.minutes * card.rate;
        if (mode === 'final-double' && card.rate === 10) {
          if (state.usedDoubleCount === 0) bestDoubleEnergy = Math.max(bestDoubleEnergy, unitEnergy);
        } else remainingEnergy += n * unitEnergy;
        if (card.rate === 5) remaining15Energy += n * unitEnergy;
      }
      return { remainingEnergy: remainingEnergy + bestDoubleEnergy, remaining15Energy };
    }
    const blankUsed = cards.map(() => 0);
    const totalEnergy = initialEnergy + remainingBounds({ used: blankUsed, usedDoubleCount: 0 }).remainingEnergy;
    const base = {
      complete: true, visited: 0, found: false, hasDouble, initialLocked, mode, dayCardsOnly, maxRouteDays, cards,
      targetDays: targetRate === 10 ? 84 : 154,
      upperBoundMinutes: Math.min(totalEnergy, cap) / targetRate,
      route: [], days: [], doubleEndingDays: 0,
      minutes: null, rate: targetRate, used: blankUsed
    };
    if (RATE_LIMIT[input.rate] && input.minutes > RATE_LIMIT[input.rate]) return { ...base, reason: 'initial-limit' };
    if (initialEnergy > cap) return { ...base, reason: initialLocked ? 'locked-above-limit' : 'energy-limit' };

    const initial = {
      used: cards.map(() => 0), rate: input.rate, energy: initialEnergy,
      used15Energy: 0, usedDoubleCount: 0, parent: null, card: -1, depth: 0,
      day: 0, daySteps: 0, waste: 0, doubleDays: []
    };
    const stack = [initial], seen = daily ? new Map() : new Set();
    let best = null, visited = 0, complete = true;
    const start = Date.now();
    // Legacy search order is retained for reproducible routes. Custom order is
    // only a priority: every legal transition is still searched.
    const order = input.cards === undefined ? [0, 1, 5, 3, 6, 4, 2] : cards.map((_, i) => i).sort((a, b) => {
      const group = card => card.rate === 5 ? 0 : card.rate === 10 ? 4 : card.minutes !== 5 ? 1 : card.rate === 1 ? 3 : 2;
      return group(cards[a]) - group(cards[b]) || cards[b].minutes * cards[b].rate - cards[a].minutes * cards[a].rate || a - b;
    });
    function better(state) {
      return !best || state.energy > best.energy ||
        (state.energy === best.energy && (state.used15Energy > best.used15Energy ||
          (state.used15Energy === best.used15Energy && (state.depth < best.depth ||
            (daily && state.depth === best.depth && laterDoubleDays(state.doubleDays, best.doubleDays))))));
    }
    function eligible(state) {
      if (state.rate !== targetRate || (maxRouteDays !== null && state.day > maxRouteDays)) return false;
      if (!daily || !hasDouble || initialLocked) return true;
      return state.card >= 0 && cards[state.card].rate === 10 &&
        state.day === Math.ceil(state.depth / 10) && state.usedDoubleCount === Math.min(totalDoubleStock, state.day);
    }
    while (stack.length) {
      const state = stack.pop();
      const key = state.used.join(',') + ':' + state.rate + (daily ? ':' + state.waste : '');
      if (daily) {
        const prior = seen.get(key);
        if (prior && !laterDoubleDays(state.doubleDays, prior)) continue;
        seen.set(key, state.doubleDays);
      } else {
        if (seen.has(key)) continue;
        seen.add(key);
      }
      visited++;
      if (eligible(state) && better(state)) best = state;
      if (visited % 10000 === 0) {
        if (progress) progress({ visited, bestDays: best ? best.energy / targetRate / DAY : null });
        if (visited >= 1000000 || Date.now() - start > 25000) { complete = false; break; }
      }

      if (mode === 'final-double' && state.usedDoubleCount > 0) continue;
      // Above 45 days, 2x is terminal across all modes and calendar days.
      if (state.rate === 10 && state.energy > 45 * DAY * 10) continue;
      if (targetRate === 10 && state.rate !== 10 && state.usedDoubleCount === totalDoubleStock) continue;

      const { remainingEnergy, remaining15Energy } = remainingBounds(state);
      if (best) {
        const upper = Math.min(cap, state.energy + remainingEnergy);
        if (upper < best.energy) continue;
        if (upper === best.energy) {
          const max15 = state.used15Energy + remaining15Energy;
          if (max15 < best.used15Energy || (max15 === best.used15Energy && state.depth >= best.depth)) continue;
        }
      }

      let nextDay = Math.floor(state.depth / 10) + 1;
      let nextDaySteps = state.depth % 10 + 1;
      let nextWaste = 0;
      const justUsedDouble = state.card >= 0 && cards[state.card].rate === 10;
      if (daily) {
        nextWaste = state.waste;
        if (state.depth === 0) {
          nextDay = 1; nextDaySteps = 1;
        } else if (justUsedDouble || state.daySteps === 10) {
          if (justUsedDouble) nextWaste += 10 - state.daySteps;
          nextDay = state.day + 1; nextDaySteps = 1;
        } else {
          nextDay = state.day; nextDaySteps = state.daySteps + 1;
        }
        // Closed-day empty slots never disappear; ten require an avoidable day.
        if (nextWaste >= 10) continue;
      }
      // The budget limits operation dates, not final multiplier duration.
      // Do not enqueue even a temporary state on a disallowed calendar day.
      if (maxRouteDays !== null && nextDay > maxRouteDays) continue;
      for (let oi = order.length - 1; oi >= 0; oi--) {
        const i = order[oi], card = cards[i];
        if (state.used[i] >= counts[i]) continue;
        if (mode === 'final-double' && card.rate === 10 && state.usedDoubleCount >= 1) continue;
        if (state.rate === card.rate && state.energy > 45 * DAY * state.rate) continue;
        const energy = state.energy + card.minutes * card.rate;
        if (energy > cap) continue;
        if (RATE_LIMIT[card.rate] && energy > RATE_LIMIT[card.rate] * card.rate) continue;
        const used = state.used.slice(); used[i]++;
        stack.push({
          used, rate: card.rate, energy,
          used15Energy: state.used15Energy + (card.rate === 5 ? card.minutes * card.rate : 0),
          usedDoubleCount: state.usedDoubleCount + Number(card.rate === 10),
          parent: state, card: i, depth: state.depth + 1,
          day: nextDay, daySteps: nextDaySteps, waste: nextWaste,
          doubleDays: daily && card.rate === 10 ? [...state.doubleDays, nextDay] : state.doubleDays
        });
      }
    }
    const route = [];
    for (let state = best; state && state.parent; state = state.parent) {
      route.push({ card: state.card, minutes: state.energy / state.rate, rate: state.rate, day: state.day });
    }
    route.reverse();
    const days = [];
    for (const step of route) {
      let group = days[days.length - 1];
      if (!group || group.day !== step.day) {
        group = { day: step.day, steps: [], endsWithDouble: false };
        days.push(group);
      }
      group.steps.push(step);
      group.endsWithDouble = cards[step.card].rate === 10;
    }
    return {
      ...base, complete, visited, found: !!best, route, days,
      doubleEndingDays: days.reduce((sum, day) => sum + Number(day.endsWithDouble), 0),
      minutes: best ? best.energy / targetRate : null,
      used: best ? best.used : base.used,
      reason: best ? null : maxRouteDays !== null ? 'day-limit' : 'no-route'
    };
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { solve, CARDS };
  else {
    root.CardSolver = { solve, CARDS };
    if (typeof WorkerGlobalScope !== 'undefined' && root instanceof WorkerGlobalScope) {
      root.onmessage = event => {
        try {
          const data = solve(event.data, p => root.postMessage({ type: 'progress', data: p }));
          root.postMessage({ type: 'result', data });
        } catch (error) { root.postMessage({ type: 'error', message: error.message }); }
      };
    }
  }
})(typeof self !== 'undefined' ? self : globalThis);
