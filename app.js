'use strict';
const form = document.querySelector('#calculator');
const result = document.querySelector('#result');
const statusBox = document.querySelector('#status');
const submit = document.querySelector('#calculate');
const cancel = document.querySelector('#cancel');
const emptyState = document.querySelector('#empty-state');
const badge = document.querySelector('#result-badge');
const dayOnly = document.querySelector('#day-only');
const limit11 = document.querySelector('#limit-11');
const limit12 = document.querySelector('#limit-12');
const limit13 = document.querySelector('#limit-13');
const limit15 = document.querySelector('#limit-15');
const limit2Before = document.querySelector('#limit-2-before');
const limit2 = document.querySelector('#limit-2');
const defaultLimits = { rate11Days: 770, rate12Days: 390, rate13Days: 263, rate15Days: 162, doubleBeforeDays: 45, doubleEndDays: 88 };
const limitFields = [['rate11Days', limit11], ['rate12Days', limit12], ['rate13Days', limit13], ['rate15Days', limit15], ['doubleBeforeDays', limit2Before], ['doubleEndDays', limit2]];
const modeNames = { 'final-double': '仅最后一张2倍', 'daily-double': '每天2倍收尾', longest: '最长时长' };
const inventory = window.CardInventory;
const cardRows = document.querySelector('#card-rows');
const addCard = document.querySelector('#add-card');
let worker = null;
function getMode() { return document.querySelector('input[name="mode"]:checked').value; }
function setMode(value) { document.querySelector(`input[name="mode"][value="${Object.hasOwn(modeNames, value) ? value : 'final-double'}"]`).checked = true; }
function duration(minutes) {
  const total = Math.round(minutes * 60);
  const d = Math.floor(total / 86400), h = Math.floor(total % 86400 / 3600), m = Math.floor(total % 3600 / 60), s = total % 60;
  return `${d}天 ${h}小时 ${m}分钟${s ? ` ${s}秒` : ''}`;
}
function readLimits() {
  return Object.fromEntries(limitFields.map(([key, field]) => [key, field.value.trim() === '' ? null : Number(field.value)]));
}
function updateLimitSummary() {
  const value = field => field.value.trim() || String(defaultLimits[limitFields.find(([, input]) => input === field)[0]]);
  document.querySelector('#limit-summary').textContent = `接替前 1.1倍${value(limit11)} / 1.2倍${value(limit12)} / 1.3倍${value(limit13)} / 1.5倍${value(limit15)} / 2倍${value(limit2Before)}天 · 2倍终点${value(limit2)}天`;
  for (const [name, field] of [['11', limit11], ['12', limit12], ['13', limit13], ['15', limit15], ['2', limit2Before]]) {
    document.querySelector(`[data-before-limit="${name}"]`).textContent = value(field);
  }
  document.querySelector('[data-double-end]').textContent = value(limit2);
}
limitFields.forEach(([, field]) => field.addEventListener('input', updateLimitSummary));
function rateLabel(rate) { return `${1 + rate / 10}倍`; }
function line(tag, text, parent = result, cls = '') {
  const el = document.createElement(tag); el.textContent = text;
  if (cls) el.className = cls;
  parent.append(el); return el;
}
function setBadge(text, state = '') { badge.textContent = text; badge.className = `result-badge ${state}`; }
function stop() {
  if (worker) { worker.terminate(); worker = null; }
  submit.disabled = false; cancel.hidden = true;
}
function updateRowLabels() {
  const rows = [...cardRows.querySelectorAll('.card-entry')];
  rows.forEach((row, index) => {
    row.querySelector('[data-field="minutes"]').setAttribute('aria-label', `第${index + 1}行卡片时长`);
    row.querySelector('[data-field="rate"]').setAttribute('aria-label', `第${index + 1}行卡片属性`);
    row.querySelector('[data-field="count"]').setAttribute('aria-label', `第${index + 1}行卡片数量`);
    row.querySelector('button').setAttribute('aria-label', `移除第${index + 1}行卡片`);
  });
  cardRows.querySelector('.inventory-empty')?.remove();
  if (!rows.length) line('p', '暂无卡片，点击下方追加。', cardRows, 'inventory-empty');
}
function appendCardRow(card = { minutes: 20160, rate: 5, count: 0 }, focus = false) {
  const row = document.createElement('div'); row.className = 'card-entry';
  const time = document.createElement('select'); time.dataset.field = 'minutes';
  inventory.DURATIONS.forEach(minutes => {
    const option = document.createElement('option'); option.value = minutes;
    option.textContent = minutes === 5 ? '5分钟' : `${minutes / 1440}天`; time.append(option);
  });
  time.value = card.minutes;
  const rate = document.createElement('select'); rate.dataset.field = 'rate';
  inventory.RATES.forEach(value => {
    const option = document.createElement('option'); option.value = value; option.textContent = rateLabel(value); rate.append(option);
  });
  rate.value = card.rate;
  const count = document.createElement('input'); count.type = 'number'; count.min = '0'; count.max = '9999';
  count.step = '1'; count.inputMode = 'numeric'; count.placeholder = '0'; count.dataset.field = 'count'; count.value = card.count || '';
  const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'card-remove'; remove.textContent = '×'; remove.title = '移除卡片';
  remove.addEventListener('click', () => { row.remove(); updateRowLabels(); markDirty(); addCard.focus(); });
  time.addEventListener('change', updateDayOnly);
  rate.addEventListener('change', updateDayOnly);
  row.append(time, rate, count, remove); cardRows.append(row); updateRowLabels(); updateDayOnly();
  if (focus) time.focus();
}
function updateCardChoices(row) {
  const time = row.querySelector('[data-field="minutes"]');
  const rate = row.querySelector('[data-field="rate"]');
  [...time.options].forEach(option => option.disabled = Number(rate.value) === 10 && Number(option.value) > 10080);
  [...rate.options].forEach(option => option.disabled = Number(time.value) > 10080 && Number(option.value) === 10);
  const invalid = Number(time.value) > 10080 && Number(rate.value) === 10;
  rate.setCustomValidity(invalid ? '2倍卡时长最多7天，请调整此卡片' : '');
  row.classList.toggle('invalid-card', invalid);
}
function updateDayOnly() {
  cardRows.querySelectorAll('.card-entry').forEach(row => {
    updateCardChoices(row);
    const excluded = dayOnly.checked && Number(row.querySelector('[data-field="minutes"]').value) === 5;
    row.classList.toggle('is-excluded', excluded);
    row.querySelector('[data-field="count"]').disabled = excluded;
  });
  if (statusBox.dataset.cardReview === 'true' && !cardRows.querySelector('.invalid-card')) { statusBox.textContent = ''; delete statusBox.dataset.cardReview; }
}
function readInventory() {
  return inventory.normalize([...cardRows.querySelectorAll('.card-entry')].map(row => ({
    minutes: Number(row.querySelector('[data-field="minutes"]').value),
    rate: Number(row.querySelector('[data-field="rate"]').value),
    count: Number(row.querySelector('[data-field="count"]').value || 0)
  })));
}
function doubleStock(input) {
  return input.cards.reduce((sum, card, i) => sum + (card.rate === 10 && !(input.dayCardsOnly && card.minutes === 5) ? input.counts[i] : 0), 0);
}
addCard.addEventListener('click', () => { appendCardRow({ minutes: 10080, rate: 5, count: 0 }, true); markDirty(); });
function groupRoute(data, cards) {
  if (Array.isArray(data.days)) return data.days;
  const groups = [];
  data.route.forEach((step, index) => {
    const day = step.day || Math.floor(index / 10) + 1;
    let group = groups.find(g => g.day === day);
    if (!group) { group = { day, steps: [] }; groups.push(group); }
    group.steps.push(step);
  });
  return groups.map(group => ({ ...group, endsWithDouble: cards[group.steps.at(-1).card].rate === 10 }));
}
function metric(label, value, unit, parent) {
  const block = line('div', '', parent, 'metric');
  line('dt', label, block); const dd = line('dd', String(value), block); if (unit) line('small', unit, dd);
}
function render(data, input) {
  result.replaceChildren(); result.hidden = false; result.classList.remove('stale'); emptyState.hidden = true;
  const activeLimits = { ...defaultLimits, ...data.limits };
  if (!data.found) {
    setBadge(data.complete ? '暂无路线' : '尚未完成', 'warning');
    const reasons = {
      'replacement-limit': `初始${rateLabel(input.rate)}时长超过接替前${data.beforeLimits[input.rate]}天限制，不能再使用卡片，无法转换到目标倍率。`,
      'locked-above-limit': `当前2倍已超过接替前${activeLimits.doubleBeforeDays}天，无法继续替换；时长也超过${activeLimits.doubleEndDays}天上限，无法得到范围内的新路线。`,
      'day-limit': `未找到能在${data.maxRouteDays}天内完成且符合当前方案的路线，可调整天数或卡片后重试。`,
      'energy-limit': `初始时长折算后已超过目标${rateLabel(data.rate)}的${data.targetDays}天上限，无法通过继续加卡降低。`,
      'no-route': input.mode === 'daily-double' ? '现有卡片无法满足每日收尾条件，可核对库存或选择其他方案。' : input.mode === 'final-double' && data.hasDouble ? '仅在最后使用1张2倍卡的条件下未找到路线，可尝试其他方案。' : '现有卡片无法按规则转换到目标倍率。'
    };
    const box = line('div', '', result, 'result-error');
    line('h3', data.complete ? '未找到符合条件的路线' : '搜索尚未完成', box);
    line('p', data.complete ? reasons[data.reason] || reasons['no-route'] : '已达到本次搜索上限，暂未找到路线；这不代表无解，可减少参与计算的卡片后重试。', box);
    return;
  }
  const cards = data.cards || input.cards;
  const days = groupRoute(data, cards);
  const usedDouble = data.used.reduce((sum, n, i) => sum + (cards[i].rate === 10 ? n : 0), 0);
  setBadge(data.initialReplacementBlocked ? '当前已达替换限制' : data.complete ? '当前方案最优' : '可行路线', data.complete ? 'ready' : 'warning');
  const hero = line('div', '', result, 'result-hero');
  const heroTop = line('div', '', hero, 'hero-top');
  line('span', '最终倍卡时长', heroTop); line('span', rateLabel(data.rate), heroTop, 'hero-rate');
  const totalSeconds = Math.round(data.minutes * 60);
  const heroValue = line('div', '', hero, 'hero-value');
  line('strong', String(Math.floor(totalSeconds / 86400)), heroValue); line('span', '天', heroValue);
  line('p', `结果：${duration(data.minutes)} ${rateLabel(data.rate)}`, hero, 'hero-detail');
  const metrics = line('dl', '', result, 'result-metrics');
  metric('使用天数', days.length, '天', metrics); metric('替换次数', data.route.length, '次', metrics); metric('2倍卡消耗', usedDouble, '张', metrics);
  const modeDescription = data.initialReplacementBlocked ? '当前时长超过接替前限制，保留已有状态' : !data.hasDouble ? '无2倍卡，计算最长1.5倍时长' : modeNames[input.mode];
  line('p', `方案：${modeDescription}${input.dayCardsOnly ? ' · 仅使用天卡' : ''}`, result, 'result-meta');
  if (input.maxRouteDays) line('p', `操作天数上限：${input.maxRouteDays}天`, result, 'result-meta');
  line('p', `初始：${duration(input.minutes)} ${rateLabel(input.rate)}`, result, 'result-meta');
  if (Object.keys(defaultLimits).some(key => activeLimits[key] !== defaultLimits[key])) line('p', `自定义接替前限制：1.1倍${activeLimits.rate11Days}天，1.2倍${activeLimits.rate12Days}天，1.3倍${activeLimits.rate13Days}天，1.5倍${activeLimits.rate15Days}天，2倍${activeLimits.doubleBeforeDays}天；2倍终点${activeLimits.doubleEndDays}天。`, result, 'result-alert');
  if (!data.complete) line('p', '已达到本次搜索上限，这条路线可行，但尚未证明最优。', result, 'result-alert');
  if (input.mode === 'daily-double' && data.hasDouble && days.length > doubleStock(input)) line('p', '2倍卡不足以覆盖每天，已优先保留最后一天收尾。', result, 'result-alert');
  if (data.initialReplacementBlocked) line('p', `当前${rateLabel(input.rate)}已超过接替前${data.beforeLimits[input.rate]}天限制，不能再使用任何倍卡。`, result, 'result-alert');
  if (!data.route.length && !data.initialReplacementBlocked) line('p', '无需使用卡片，当前状态已是本方案可达到的最优结果。', result, 'result-alert success');
  let stepNumber = 0;
  days.forEach(day => {
    const section = line('section', '', result, 'day-block');
    const heading = line('div', '', section, 'day-heading');
    line('h3', `第${day.day}天`, heading);
    const closing = day.endsWithDouble ? '2倍收尾' : input.mode === 'daily-double' && data.hasDouble ? '未用2倍卡' : '';
    line('span', `${day.steps.length}次${closing ? ` · ${closing}` : ''}`, heading, `day-tag${day.endsWithDouble ? ' closed' : ''}`);
    const list = line('ol', '', section, 'route-list');
    day.steps.forEach(step => {
      const row = line('li', '', list, `route-step${cards[step.card].rate === 10 ? ' is-double' : ''}`);
      line('span', String(++stepNumber).padStart(2, '0'), row, 'step-index');
      const body = line('div', '', row, 'step-body');
      line('strong', inventory.label(cards[step.card]), body); line('small', duration(step.minutes), body);
      line('span', rateLabel(step.rate), row, `rate-pill${step.rate === 10 ? ' double' : ''}`);
    });
  });
  if (data.route.length && data.minutes > data.beforeLimits[data.rate] * 1440) line('p', `${rateLabel(data.rate)}已超过接替前${data.beforeLimits[data.rate]}天限制，路线到此结束。`, result, 'result-alert success');
  const remaining = input.counts.map((n, i) => n - data.used[i]);
  const footer = line('div', '', result, 'remaining'); line('h3', '剩余卡片', footer);
  const remainingList = line('div', '', footer, 'remaining-list');
  let remainingCount = 0;
  remaining.forEach((n, i) => {
    if (!n) return; remainingCount++;
    line('span', `${inventory.label(cards[i])} × ${n}${input.dayCardsOnly && cards[i].minutes === 5 ? ' · 未参与' : ''}`, remainingList, input.dayCardsOnly && cards[i].minutes === 5 ? 'excluded' : '');
  });
  if (!remainingCount) line('span', '已全部使用', remainingList);
}
form.addEventListener('invalid', event => {
  if (limitFields.some(([, field]) => field === event.target)) document.querySelector('#advanced-settings').open = true;
}, true);
form.addEventListener('submit', event => {
  event.preventDefault(); stop();
  if (limitFields.some(([, field]) => !field.checkValidity())) document.querySelector('#advanced-settings').open = true;
  if (!form.reportValidity()) return;
  const n = id => Number(document.getElementById(id).value || 0);
  let stock;
  try { stock = readInventory(); } catch (error) { statusBox.textContent = error.message; setBadge('请核对库存', 'warning'); return; }
  const input = { minutes: n('days') * 1440 + n('hours') * 60 + n('minutes'), rate: n('rate'), mode: getMode(), dayCardsOnly: dayOnly.checked, limits: readLimits(), maxRouteDays: document.querySelector('#max-route-days').value.trim() === '' ? null : n('max-route-days'), ...stock };
  try { localStorage.setItem('myslfbk-input', JSON.stringify(input)); } catch {}
  result.hidden = true; emptyState.hidden = false; statusBox.textContent = '正在计算最优路线…'; setBadge('计算中'); submit.disabled = true; cancel.hidden = false;
  try {
    worker = new Worker('solver.js?v=13');
    worker.onmessage = ({ data: message }) => {
      if (message.type === 'progress') { statusBox.textContent = message.data.bestDays === null ? '正在寻找符合条件的路线…' : `正在计算，已找到约 ${message.data.bestDays.toFixed(2)} 天的可行路线…`; return; }
      stop();
      if (message.type === 'error') { statusBox.textContent = message.message; setBadge('请核对输入', 'warning'); return; }
      statusBox.textContent = ''; render(message.data, input);
      document.querySelector('.output-panel').scrollIntoView({ block: 'start', behavior: 'auto' });
    };
    worker.onerror = () => { stop(); statusBox.textContent = '计算加载失败，请刷新页面重试。'; setBadge('加载失败', 'warning'); };
    worker.postMessage(input);
  } catch { stop(); statusBox.textContent = '当前浏览器无法启动计算，请使用新版浏览器重试。'; setBadge('暂不可用', 'warning'); }
});
function markDirty() {
  const wasComputing = !!worker;
  if (worker) stop();
  if (!result.hidden) { result.classList.add('stale'); statusBox.textContent = '条件已更改，请重新计算。'; setBadge('待重新计算', 'warning'); }
  else if (wasComputing) { statusBox.textContent = '条件已更改，请重新计算。'; setBadge('等待计算'); }
}
form.addEventListener('input', markDirty);
form.addEventListener('change', markDirty);
dayOnly.addEventListener('change', updateDayOnly);
form.addEventListener('reset', () => {
  stop(); statusBox.textContent = ''; result.hidden = true; result.replaceChildren(); result.classList.remove('stale'); emptyState.hidden = false; setBadge('等待计算');
  try { localStorage.removeItem('myslfbk-input'); } catch {}
  setTimeout(() => { cardRows.replaceChildren(); appendCardRow(); updateDayOnly(); updateLimitSummary(); document.querySelector('#advanced-settings').open = false; }, 0);
});
cancel.addEventListener('click', () => { stop(); statusBox.textContent = '已停止计算，可调整条件后重试。'; setBadge('已停止'); });
try {
  const saved = inventory.restore(JSON.parse(localStorage.getItem('myslfbk-input')));
  if (saved) {
    document.querySelector('#days').value = Math.floor(saved.minutes / 1440) || '';
    document.querySelector('#hours').value = Math.floor(saved.minutes % 1440 / 60) || '';
    document.querySelector('#minutes').value = saved.minutes % 60 || '';
    saved.cards.forEach((card, i) => appendCardRow({ ...card, count: saved.counts[i] }));
    setMode(saved.mode); dayOnly.checked = saved.dayCardsOnly === true;
    for (const [key, field] of limitFields) {
      const value = saved.limits?.[key];
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0.01 && value <= 99999 && Math.abs(value * 100 - Math.round(value * 100)) < 1e-7) field.value = value;
    }
    if (saved.needsCardReview) { statusBox.textContent = '已保留历史库存，其中14天2倍卡不符合规则，请调整后再计算。'; statusBox.dataset.cardReview = 'true'; }
    document.querySelector('#max-route-days').value = Number.isSafeInteger(saved.maxRouteDays) && saved.maxRouteDays >= 1 && saved.maxRouteDays <= 9999 ? saved.maxRouteDays : '';
    if (inventory.RATES.includes(saved.rate)) document.querySelector('#rate').value = saved.rate;
    else { document.querySelector('#rate').value = ''; statusBox.textContent = '其他输入已保留，请重新选择初始倍率。'; }
  }
} catch {}
if (!cardRows.querySelector('.card-entry')) appendCardRow();
updateDayOnly();

updateLimitSummary();
const usageDialog = document.querySelector('#usage-dialog');
function showUsageNotice() {
  if (!usageDialog.open) usageDialog.showModal();
}
document.querySelector('#usage-info').addEventListener('click', showUsageNotice);
showUsageNotice();

async function recordVisit() {
  const counter = document.querySelector('#visit-count');
  try {
    const response = await fetch('api/visits', { method: 'POST', cache: 'no-store', credentials: 'omit' });
    if (!response.ok) throw Error('Visit counter unavailable');
    const data = await response.json();
    if (!Number.isSafeInteger(data.visits) || data.visits < 0) throw Error('Invalid visit count');
    counter.textContent = data.visits.toLocaleString('zh-CN');
  } catch { counter.textContent = '—'; }
}
recordVisit();


function animateCommunityThanks() {
  const note = document.querySelector('#community-note');
  const area = note.parentElement;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let x = 4, y = 5, lastMove = 0;
  function bounds() {
    return { width: Math.max(4, area.clientWidth - note.offsetWidth - 4), height: Math.max(5, area.clientHeight - note.offsetHeight - 5) };
  }
  function place() {
    const box = bounds();
    x = Math.max(4, Math.min(x, box.width));
    y = Math.max(5, Math.min(y, box.height));
    note.style.transform = `translate(${x}px, ${y}px)`;
  }
  function dodge(event) {
    if (event.pointerType !== 'mouse') return;
    if (usageDialog.open || reducedMotion.matches) return;
    const now = performance.now();
    if (now - lastMove < 150) return;
    const rect = note.getBoundingClientRect();
    if (event.clientX < rect.left - 60 || event.clientX > rect.right + 60 || event.clientY < rect.top - 28 || event.clientY > rect.bottom + 28) return;
    const frame = area.getBoundingClientRect(), box = bounds();
    const px = event.clientX - frame.left, py = event.clientY - frame.top;
    const choices = [[4, 5], [box.width, 5], [4, box.height], [box.width, box.height]];
    function distance([cx, cy]) {
      const dx = Math.max(cx - px, 0, px - cx - note.offsetWidth);
      const dy = Math.max(cy - py, 0, py - cy - note.offsetHeight);
      return dx * dx + dy * dy;
    }
    choices.sort((a, b) => distance(b) - distance(a) || Math.hypot(b[0] - x, b[1] - y) - Math.hypot(a[0] - x, a[1] - y));
    [x, y] = choices[0];
    lastMove = now;
    place();
  }
  area.addEventListener('pointermove', dodge);
  document.addEventListener('pointerdown', dodge, { passive: true });
  new ResizeObserver(place).observe(area);
  // Keep reduced-motion users free of continuous and reactive movement.
  function updateMotion() {
    area.classList.toggle('motion-paused', reducedMotion.matches);
    if (reducedMotion.matches) { x = 4; y = 5; place(); }
  }
  reducedMotion.addEventListener('change', updateMotion);
  updateMotion();
  place();
}
animateCommunityThanks();
