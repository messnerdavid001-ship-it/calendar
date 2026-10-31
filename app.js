(() => {
'use strict';

/* ================= Config ================= */
const KEY = 'calendar.v1';
const WEEK_MS = 7 * 864e5;
const SPLASH_MS = 6000;
// How an ambiguous note date like 3/4 is read: 'mdy' (March 4) or 'dmy' (3 April)
const DATE_ORDER = 'mdy';

const QUOTES = [
  { q: 'The impediment to action advances action. What stands in the way becomes the way.', a: 'Marcus Aurelius', c: 'Written in a campaign tent on the Danube frontier, in the middle of the Marcomannic Wars.' },
  { q: 'Waste no more time arguing about what a good man should be. Be one.', a: 'Marcus Aurelius', c: 'A private note to himself while commanding legions far from Rome. Orders first, speeches never.' },
  { q: 'At dawn, when you have trouble getting out of bed, tell yourself: I am rising to do the work of a human being.', a: 'Marcus Aurelius', c: 'The emperor’s reminder to himself before another day of war on the frontier.' },
  { q: 'Very little is needed to make a happy life; it is all within yourself, in your way of thinking.', a: 'Marcus Aurelius', c: 'The camp had little comfort. The mind needed none.' },
  { q: 'If it is not right, do not do it; if it is not true, do not say it.', a: 'Marcus Aurelius', c: 'Discipline for a commander whose every word moved armies.' },
  { q: 'We suffer more often in imagination than in reality.', a: 'Seneca', c: 'Advice to a friend facing dread of what might come. Most battles are won or lost in the mind first.' },
  { q: 'Fire tests gold, adversity tests brave men.', a: 'Seneca', c: 'On why hardship is the training ground of those who will not be broken.' },
  { q: 'Make the best use of what is in your power, and take the rest as it happens.', a: 'Epictetus', c: 'Taught by a former slave to soldiers and officers who could not choose their orders, only their response.' },
  { q: 'It’s not what happens to you, but how you react to it that matters.', a: 'Epictetus', c: 'The core of Stoic training for anyone marching into the unknown.' },
  { q: 'Never give in. Never, never, never, never — in nothing, great or small, large or petty — except to convictions of honour and good sense.', a: 'Winston Churchill', c: 'Spoken to the boys of Harrow School in October 1941, with Britain still standing alone in the war.' },
  { q: 'Plans are worthless, but planning is everything.', a: 'Dwight D. Eisenhower', c: 'The Supreme Allied Commander on why you prepare hard, then adapt when the battle begins.' },
  { q: 'The only thing we have to fear is fear itself.', a: 'Franklin D. Roosevelt', c: 'Said to a frightened nation in 1933. It became a rallying cry through the war that followed.' },
  { q: 'The soul becomes dyed with the colour of its thoughts.', a: 'Marcus Aurelius', c: 'Guard your mind the way a sentry guards the gate.' },
];

/* ================= Helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromYmd = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (s, n) => { const d = fromYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
const today = () => ymd(new Date());
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DOW_L = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const shortDate = s => { const d = fromYmd(s); return `${DOW[d.getDay()]}, ${MON[d.getMonth()].slice(0, 3)} ${d.getDate()}`; };
const REPEAT_LABEL = { none: '', daily: 'Daily habit', weekly: 'Weekly' };

/* ================= State ================= */
let state = { tasks: [], notes: [], streak: { count: 0, last: '' }, hideTasks: false };
try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* fresh start */ }
let saveTimer;
const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked */ } }, 150); };

let page = 'home';
let sel = today();                                  // day shown on the Week page
let viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let listLimit = 15;
let openNote = null;
let editingTask = null;

/* ================= Tasks ================= */
function occursOn(t, d) {
  if (t.repeat === 'none') return t.date === d;
  if (d < t.date) return false;
  return t.repeat === 'daily' || fromYmd(d).getDay() === fromYmd(t.date).getDay();
}
const isDone = (t, d) => t.repeat === 'none' ? t.done : !!(t.doneDates && t.doneDates[d]);
const byTime = (a, b) => (a.t.time || '99:99').localeCompare(b.t.time || '99:99') || a.t.title.localeCompare(b.t.title);

function onDay(d) {
  return state.tasks.filter(t => occursOn(t, d)).map(t => ({ t, d, done: isDone(t, d) })).sort(byTime);
}

function nextOccurrence(t) {
  const now = today();
  if (t.repeat === 'none') return t.done ? null : t.date;
  let d = t.date > now ? t.date : now;
  for (let i = 0; i < 8; i++, d = addDays(d, 1)) if (occursOn(t, d) && !isDone(t, d)) return d;
  return null;
}

function liveTasks() {
  return state.tasks.map(t => ({ t, d: nextOccurrence(t) })).filter(x => x.d).map(x => ({ ...x, done: false })).sort((a, b) => a.d.localeCompare(b.d) || byTime(a, b));
}

function completedTasks() {
  const out = [];
  state.tasks.forEach(t => {
    if (t.repeat === 'none') { if (t.done) out.push({ t, d: t.date, at: t.completedAt }); }
    else Object.entries(t.doneDates || {}).forEach(([d, at]) => out.push({ t, d, at }));
  });
  return out.sort((a, b) => b.at - a.at);
}

function purge() {
  const cut = Date.now() - WEEK_MS;
  let changed = false;
  state.tasks = state.tasks.filter(t => {
    if (t.repeat === 'none') { if (t.done && t.completedAt < cut) { changed = true; return false; } return true; }
    for (const k in t.doneDates) if (t.doneDates[k] < cut) { delete t.doneDates[k]; changed = true; }
    return true;
  });
  if (changed) save();
}

function toggle(id, d, fromEl) {
  const t = state.tasks.find(x => x.id === id);
  if (!t) return;
  const was = isDone(t, d);
  if (t.repeat === 'none') { t.done = !was; t.completedAt = t.done ? Date.now() : null; }
  else { t.doneDates = t.doneDates || {}; if (was) delete t.doneDates[d]; else t.doneDates[d] = Date.now(); }
  if (!was) { bumpStreak(); if (fromEl) burst(fromEl); }
  save(); render();
}

function bumpStreak() {
  const s = state.streak, now = today();
  if (s.last === now) return;
  s.count = s.last === addDays(now, -1) ? s.count + 1 : 1;
  s.last = now;
}
const streakNow = () => (state.streak.last === today() || state.streak.last === addDays(today(), -1)) ? state.streak.count : 0;

function burst(el) {
  const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
  const colors = ['#e9ab4a', '#ffd60a', '#5ac8fa', '#34c759', '#ff453a'];
  for (let i = 0; i < 18; i++) {
    const p = document.createElement('i');
    p.className = 'spark';
    const a = Math.random() * Math.PI * 2, dist = 40 + Math.random() * 60;
    p.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % 5]};--dx:${Math.cos(a) * dist}px;--dy:${Math.sin(a) * dist + 20}px;--rot:${Math.random() * 540}deg`;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 850);
  }
}

/* ================= Note dates ================= */
const MONTH_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const monthIdx = s => ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].indexOf(s.slice(0, 3).toLowerCase()) + 1;

function resolveDate(y, m, d, created) {
  if (y != null && y < 100) y += 2000;
  const c = new Date(created);
  let yr = y == null ? c.getFullYear() : y;
  let dt = new Date(yr, m - 1, d);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  if (y == null && dt < new Date(c.getTime() - 60 * 864e5)) dt = new Date(yr + 1, m - 1, d);
  return ymd(dt);
}

function extractDates(text, created) {
  const found = [], seen = new Set();
  const add = (date, line, raw) => {
    if (!date) return;
    const label = line.replace(raw, '').replace(/^[\s\-–—:,.]+|[\s\-–—:,.]+$/g, '') || '';
    const k = date + '|' + line;
    if (!seen.has(k)) { seen.add(k); found.push({ date, label }); }
  };
  text.split('\n').forEach(line => {
    for (const m of line.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) add(resolveDate(+m[1], +m[2], +m[3], created), line, m[0]);
    for (const m of line.matchAll(/(?<![\d/])(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?(?![\d/])/g)) {
      let a = +m[1], b = +m[2], mo, da;
      if (a > 12) { da = a; mo = b; } else if (b > 12) { mo = a; da = b; } else if (DATE_ORDER === 'dmy') { da = a; mo = b; } else { mo = a; da = b; }
      add(resolveDate(m[3] ? +m[3] : null, mo, da, created), line, m[0]);
    }
    for (const m of line.matchAll(new RegExp(`\\b${MONTH_RE}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s+(\\d{4}))?\\b`, 'gi')))
      add(resolveDate(m[3] ? +m[3] : null, monthIdx(m[1]), +m[2], created), line, m[0]);
    for (const m of line.matchAll(new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+(?:of\\s+)?${MONTH_RE}\\.?(?:,?\\s+(\\d{4}))?\\b`, 'gi')))
      add(resolveDate(m[3] ? +m[3] : null, monthIdx(m[2]), +m[1], created), line, m[0]);
  });
  return found;
}

const noteTitle = n => (n.text.split('\n').find(l => l.trim()) || '').trim() || 'New Note';
const notePreview = n => { const ls = n.text.split('\n').filter(l => l.trim()); return ls[1] ? ls[1].trim() : 'No additional text'; };

function noteDateMap() {
  const map = {};
  state.notes.forEach(n => extractDates(n.text, n.created).forEach(x => {
    (map[x.date] = map[x.date] || []).push({ id: n.id, label: x.label || noteTitle(n), title: noteTitle(n) });
  }));
  return map;
}

/* ================= Rendering ================= */
const CHECK = '<svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';

function taskRow(x, { showDate = false, over = false, extra = '' } = {}) {
  const { t, d, done } = x;
  const meta = [t.time, REPEAT_LABEL[t.repeat]].filter(Boolean).join(' · ');
  return `<div class="task ${done ? 'done' : ''} ${over ? 'over' : ''}" data-edit="${t.id}">
    <button class="check" data-toggle="${t.id}" data-date="${d}" aria-label="Complete">${CHECK}</button>
    <div class="t-main"><div class="t-title">${esc(t.title)}</div>${meta ? `<div class="t-meta">${esc(meta)}</div>` : ''}</div>
    ${showDate ? `<span class="t-date">${d === today() ? 'Today' : esc(shortDate(d))}</span>` : ''}${extra}
  </div>`;
}

function renderHome() {
  const now = new Date(), td = today();
  $('#homeDate').textContent = `${DOW[now.getDay()]}, ${MON[now.getMonth()]} ${now.getDate()}`;

  // progress
  const todays = onDay(td), done = todays.filter(x => x.done).length, total = todays.length;
  const pct = total ? done / total : 0, C = 2 * Math.PI * 24;
  const msg = !total ? ['No orders today', 'Tap + to plant your flag.']
    : done === total ? ['All objectives secured', 'Stand down. You earned it.']
    : [`${done} of ${total} done today`, done ? 'Keep the momentum. Finish the job.' : 'Take the first step. The rest follows.'];
  const sk = streakNow();
  $('#homeProgress').innerHTML = `<div class="ring"><svg viewBox="0 0 58 58"><circle class="bg" cx="29" cy="29" r="24"/><circle class="fg" cx="29" cy="29" r="24" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}"/></svg><b>${Math.round(pct * 100)}%</b></div>
    <div class="pc-text"><strong>${msg[0]}</strong><span>${msg[1]}</span></div>
    ${sk ? `<div class="streak">🔥 ${sk} day${sk > 1 ? 's' : ''}</div>` : ''}`;

  // month grid
  $('#monthTitle').textContent = `${MON[viewMonth.getMonth()]} ${viewMonth.getFullYear()}`;
  const first = new Date(viewMonth), start = new Date(first);
  start.setDate(1 - first.getDay());
  const notes = noteDateMap();
  let html = '';
  for (let i = 0; i < 42; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    const s = ymd(d), items = onDay(s).filter(x => x.t.repeat !== 'daily'), pending = items.filter(x => !x.done);
    const show = pending[0] || items[0], extra = items.length - 1;
    html += `<button class="cell ${d.getMonth() !== first.getMonth() ? 'out' : ''} ${s === td ? 'today' : ''} ${s === sel ? 'sel' : ''}" data-day="${s}" aria-label="${esc(shortDate(s))}">
      ${notes[s] ? '<i class="nmark"></i>' : ''}<span>${d.getDate()}</span>
      ${show ? `<em class="chip ${show.done ? 'done' : ''}" style="font-style:normal">${esc(show.t.title)}</em>` : ''}
      ${extra > 0 ? `<span class="more">+${extra}</span>` : ''}</button>`;
  }
  $('#monthGrid').innerHTML = html;

  // task list
  const live = liveTasks();
  const bar = $('#tasksToggle');
  bar.innerHTML = `<span>Tasks<span class="cnt">${live.length}</span></span><small>${state.hideTasks ? 'Show' : 'Hide'}</small>`;
  const list = $('#taskList');
  list.classList.toggle('hide', state.hideTasks);
  if (state.hideTasks) return;

  let out = '', last = '';
  live.slice(0, listLimit).forEach(x => {
    const g = x.d < td ? 'Overdue' : x.d === td ? 'Today' : x.d === addDays(td, 1) ? 'Tomorrow' : shortDate(x.d);
    if (g !== last) { out += `<div class="group ${g === 'Overdue' ? 'over' : ''}">${esc(g)}</div>`; last = g; }
    out += taskRow(x, { over: x.d < td });
  });
  if (!live.length) out = '<div class="empty-tasks">No live tasks. Add one with the + button.</div>';
  else if (live.length > listLimit) out += '<div class="sentinel" id="sentinel"></div>';

  const comp = completedTasks();
  if (comp.length) {
    out += '<div class="group done-head">Completed <span class="erase">· erased a week after finishing</span></div>';
    comp.slice(0, 10).forEach(c => {
      const left = Math.max(1, Math.ceil((c.at + WEEK_MS - Date.now()) / 864e5));
      out += taskRow({ t: c.t, d: c.d, done: true }, { extra: `<span class="t-date">${left}d left</span>` });
    });
  }
  list.innerHTML = out;
  const s = $('#sentinel');
  if (s) new IntersectionObserver((e, o) => { if (e[0].isIntersecting) { o.disconnect(); listLimit += 15; renderHome(); } }, { rootMargin: '300px' }).observe(s);
}

function renderWeek() {
  const d = fromYmd(sel), td = today(), notes = noteDateMap();
  $('#weekMonth').textContent = MON[d.getMonth()];
  const start = addDays(sel, -d.getDay());
  let days = '';
  for (let i = 0; i < 7; i++) {
    const s = addDays(start, i), has = onDay(s).length, nn = notes[s];
    days += `<button class="wd ${s === sel ? 'sel' : ''} ${s === td ? 'today' : ''}" data-wday="${s}"><span>${DOW_L[i]}</span><span class="n">${fromYmd(s).getDate()}</span>
      <span class="dots">${has ? '<i></i>' : ''}${nn ? '<i class="n"></i>' : ''}</span></button>`;
  }
  $('#weekDays').innerHTML = days;

  const items = onDay(sel), nlist = notes[sel] || [];
  const total = items.length + nlist.length;
  let html = `<div class="day-title"><h2>${DOW[d.getDay()]} – ${d.getDate()} ${MON[d.getMonth()].slice(0, 3)}</h2><span>${total ? `${total} item${total > 1 ? 's' : ''}` : ''}</span></div>`;
  if (!total) {
    html += `<div class="none"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg><div>No tasks</div></div>`;
  } else {
    const untimed = items.filter(x => !x.t.time);
    if (untimed.length || nlist.length) {
      html += `<div class="slot"><div class="slot-time">any time</div><div class="slot-items">${untimed.map(x => taskRow(x)).join('')}${nlist.map(noteRow).join('')}</div></div>`;
    }
    const timed = items.filter(x => x.t.time), hours = [...new Set(timed.map(x => x.t.time))];
    hours.forEach(h => {
      html += `<div class="slot"><div class="slot-time">${h}</div><div class="slot-items">${timed.filter(x => x.t.time === h).map(x => taskRow(x)).join('')}</div></div>`;
    });
  }
  $('#dayView').innerHTML = html;
}
const noteRow = n => `<div class="task note-item" data-note="${n.id}"><span class="nic"><i></i></span><div class="t-main"><div class="t-title">${esc(n.label)}</div><div class="t-meta">From note · ${esc(n.title)}</div></div></div>`;

function renderNotes() {
  const q = $('#noteSearch').value.trim().toLowerCase();
  const list = state.notes.filter(n => !q || n.text.toLowerCase().includes(q)).sort((a, b) => b.updated - a.updated);
  const now = Date.now(), startToday = new Date().setHours(0, 0, 0, 0);
  const groups = [['Today', n => n.updated >= startToday], ['Previous 7 Days', n => n.updated >= startToday - 7 * 864e5], ['Previous 30 Days', n => n.updated >= startToday - 30 * 864e5], ['Older', () => true]];
  const used = new Set();
  let html = '';
  groups.forEach(([name, test]) => {
    const items = list.filter(n => !used.has(n.id) && test(n));
    if (!items.length) return;
    items.forEach(n => used.add(n.id));
    html += `<div class="n-group">${name}</div><div class="n-card">${items.map(n => {
      const dd = new Date(n.updated), when = n.updated >= startToday ? `${pad(dd.getHours())}:${pad(dd.getMinutes())}` : `${dd.getDate()}/${dd.getMonth() + 1}/${String(dd.getFullYear()).slice(2)}`;
      const nd = extractDates(n.text, n.created).length;
      return `<div class="n-item" data-open="${n.id}"><div class="n-title">${esc(noteTitle(n))}${nd ? `<span class="n-badge">◆ ${nd}</span>` : ''}</div><div class="n-sub"><span class="when">${when}</span><span class="prev">${esc(notePreview(n))}</span></div></div>`;
    }).join('')}</div>`;
  });
  $('#noteGroups').innerHTML = html;
  $('#noteCount').textContent = `${list.length} Note${list.length === 1 ? '' : 's'}`;
}

function renderChips() {
  const n = state.notes.find(x => x.id === openNote);
  const ds = n ? [...new Set(extractDates(n.text, n.created).map(x => x.date))].sort() : [];
  $('#noteChips').innerHTML = ds.map(d => `<span>On calendar · ${esc(shortDate(d))}</span>`).join('');
}

function render() {
  if (page === 'home') renderHome();
  else if (page === 'week') renderWeek();
  else if (page === 'notes' && openNote === null) renderNotes();
}

/* ================= Navigation ================= */
function go(p) {
  closeNote();
  page = p;
  $$('.page').forEach(el => el.classList.toggle('active', el.id === 'page-' + p));
  $$('.tab').forEach(el => el.classList.toggle('active', el.dataset.page === p));
  window.scrollTo(0, 0);
  render();
}

function openNoteEditor(id) {
  openNote = id;
  const n = state.notes.find(x => x.id === id);
  $('#noteText').value = n.text;
  $('#notesList').hidden = true;
  $('#noteEditor').hidden = false;
  $('#page-notes').classList.add('editing');
  renderChips();
  window.scrollTo(0, 0);
  if (!n.text) $('#noteText').focus();
}

function closeNote() {
  if (openNote === null) return;
  const n = state.notes.find(x => x.id === openNote);
  if (n && !n.text.trim()) state.notes = state.notes.filter(x => x !== n);
  openNote = null;
  $('#noteEditor').hidden = true;
  $('#notesList').hidden = false;
  $('#page-notes').classList.remove('editing');
  save();
  if (page === 'notes') renderNotes();
}

/* ================= Task sheet ================= */
function openSheet(task, date) {
  editingTask = task || null;
  $('#sheetTitle').textContent = task ? 'Edit task' : 'New task';
  $('#fTitle').value = task ? task.title : '';
  $('#fDate').value = task ? task.date : (date || today());
  $('#fTime').value = task ? task.time : '';
  setRepeat(task ? task.repeat : 'none');
  $('#fDelete').hidden = !task;
  $('#sheet').hidden = false;
  setTimeout(() => $('#fTitle').focus(), 50);
}
const closeSheet = () => { $('#sheet').hidden = true; editingTask = null; };
const setRepeat = v => $$('#fRepeat button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
const getRepeat = () => $('#fRepeat .on').dataset.v;

/* ================= Events ================= */
document.addEventListener('click', e => {
  const t = e.target;
  let el;
  if ((el = t.closest('[data-toggle]'))) { toggle(el.dataset.toggle, el.dataset.date, el); return; }
  if ((el = t.closest('[data-note]'))) { go('notes'); openNoteEditor(el.dataset.note); return; }
  if ((el = t.closest('[data-edit]'))) { openSheet(state.tasks.find(x => x.id === el.dataset.edit)); return; }
  if ((el = t.closest('[data-day]'))) { sel = el.dataset.day; go('week'); return; }
  if ((el = t.closest('[data-wday]'))) { sel = el.dataset.wday; renderWeek(); return; }
  if ((el = t.closest('[data-page]'))) { go(el.dataset.page); return; }
  if ((el = t.closest('[data-open]'))) { openNoteEditor(el.dataset.open); return; }
  if ((el = t.closest('#fRepeat button'))) { setRepeat(el.dataset.v); return; }
  if (!(el = t.closest('[data-action]'))) return;
  switch (el.dataset.action) {
    case 'add': openSheet(null, page === 'week' ? sel : today()); break;
    case 'sheet-close': closeSheet(); break;
    case 'month-prev': viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1); renderHome(); break;
    case 'month-next': viewMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1); renderHome(); break;
    case 'month-today': viewMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1); renderHome(); break;
    case 'toggle-tasks': state.hideTasks = !state.hideTasks; save(); renderHome(); break;
    case 'week-prev': sel = addDays(sel, -7); renderWeek(); break;
    case 'week-next': sel = addDays(sel, 7); renderWeek(); break;
    case 'week-today': sel = today(); renderWeek(); break;
    case 'note-new': {
      const n = { id: uid(), text: '', created: Date.now(), updated: Date.now() };
      state.notes.push(n); openNoteEditor(n.id); break;
    }
    case 'note-back': closeNote(); break;
    case 'note-delete':
      if (confirm('Delete this note?')) { state.notes = state.notes.filter(x => x.id !== openNote); closeNote(); }
      break;
  }
});

$('#sheetForm').addEventListener('submit', e => {
  e.preventDefault();
  const title = $('#fTitle').value.trim();
  if (!title) return;
  const data = { title, date: $('#fDate').value || today(), time: $('#fTime').value, repeat: getRepeat() };
  if (editingTask) {
    const changedKind = (editingTask.repeat === 'none') !== (data.repeat === 'none');
    Object.assign(editingTask, data);
    if (changedKind) { editingTask.done = false; editingTask.completedAt = null; editingTask.doneDates = {}; }
  } else {
    state.tasks.push({ id: uid(), done: false, completedAt: null, doneDates: {}, ...data });
    viewMonth = new Date(fromYmd(data.date).getFullYear(), fromYmd(data.date).getMonth(), 1);
  }
  save(); closeSheet(); render();
});
$('#fDelete').addEventListener('click', () => {
  if (editingTask) { state.tasks = state.tasks.filter(x => x !== editingTask); save(); closeSheet(); render(); }
});

$('#noteText').addEventListener('input', e => {
  const n = state.notes.find(x => x.id === openNote);
  if (!n) return;
  n.text = e.target.value; n.updated = Date.now();
  save(); renderChips();
});
$('#noteSearch').addEventListener('input', renderNotes);

// swipe the day view to change day
let sx = null;
$('#dayView').addEventListener('touchstart', e => { sx = e.touches[0].clientX; }, { passive: true });
$('#dayView').addEventListener('touchend', e => {
  if (sx == null) return;
  const dx = e.changedTouches[0].clientX - sx; sx = null;
  if (Math.abs(dx) > 70) { sel = addDays(sel, dx < 0 ? 1 : -1); renderWeek(); }
});

/* ================= Splash ================= */
function initSplash() {
  const splash = $('#splash'), bar = $('#splashBar');
  const q = QUOTES[Math.floor(Math.random() * QUOTES.length)];
  $('#splashQuote').textContent = `“${q.q}”`;
  $('#splashAuthor').textContent = q.a;
  $('#splashCtx').textContent = q.c;

  let holding = false, remain = SPLASH_MS, last = performance.now(), gone = false;
  const leave = () => {
    if (gone) return; gone = true;
    splash.classList.add('out');
    $('#app').removeAttribute('aria-hidden');
    setTimeout(() => splash.remove(), 600);
  };
  const tick = now => {
    if (gone) return;
    if (!holding) remain -= now - last;
    last = now;
    bar.style.transform = `scaleX(${Math.max(0, remain / SPLASH_MS)})`;
    if (remain <= 0) return leave();
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);

  // Holding pauses the countdown and keeps the quote; releasing (or a quick tap) moves on to Home.
  splash.addEventListener('pointerdown', e => { holding = true; splash.classList.add('holding'); try { splash.setPointerCapture(e.pointerId); } catch (_) { /* ok */ } });
  const release = () => { if (!holding) return; holding = false; splash.classList.remove('holding'); leave(); };
  splash.addEventListener('pointerup', release);
  splash.addEventListener('pointercancel', release);
  splash.addEventListener('contextmenu', e => e.preventDefault());
  splash.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') leave(); });
  splash.focus();
}

/* ================= Boot ================= */
purge();
render();
initSplash();
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
setInterval(() => { purge(); if ($('#sheet').hidden && openNote === null) render(); }, 60000);
})();
