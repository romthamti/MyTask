import { createStore } from './store.js?v=6';
import * as U from './utils.js?v=6';
import { t, getLang, setLang, applyI18n } from './i18n.js?v=6';
import { readSlip } from './slip.js?v=6';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = U.escapeHtml;
// ใช้ในฟังก์ชันที่ตัวแปร t เป็นงานอยู่แล้ว
const tr = t;

const ICONS = {
  check: '<path d="M6 12.5l4 4L18 8.5"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  calendar: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 10h16M8 3v4M16 3v4"/>',
  clock: '<path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2"/>',
  note: '<path d="M5 6h14M5 11h14M5 16h9"/>',
  left: '<path d="M15 6l-6 6 6 6"/>',
  right: '<path d="M9 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  inbox: '<path d="M4 13l2.5-7h11l2.5 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1zM4 13h5l1 2h4l1-2h5"/>',
  wallet: '<path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2zM4 9h16M16 14h1"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6M9 16h3"/>',
  down: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"/>',
};
const icon = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- ค่าที่จำไว้ในเครื่อง (มุมมอง ตัวกรอง ธีม) ----------
const PREFS_KEY = 'mytodo.prefs';
const prefs = (() => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
})();
function savePrefs(patch) {
  Object.assign(prefs, patch);
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
  } catch {}
}

const VIEWS = ['dashboard', 'events', 'list', 'calendar', 'money'];
// แท็บออกกำลังกายเดิมถูกแทนด้วยแท็บการเงิน
const savedView = prefs.view === 'fitness' ? 'money' : prefs.view;
// [ค่า, ข้อความ] · ข้อความเป็นฟังก์ชันเพื่อให้ได้ภาษาที่เลือกอยู่ตอนวาด
const STATUSES = ['pending', 'overdue', 'done', 'all'].map((v) => [v, () => t(`status.${v}`)]);
const KINDS = [
  ['all', () => t('kind.all')],
  ['task', () => t('kind.task')],
  ['event', () => t('kind.event')],
  ...Object.entries(U.EVENT_CATEGORIES).map(([k, c]) => [`event:${k}`, () => t('kind.cat', { label: c.label })]),
];
const SORTS = ['due', 'priority', 'created'].map((v) => [v, () => t(`sort.${v}`)]);
const savedFilter = prefs.filter || {};

const state = {
  tasks: [],
  // รายรับรายจ่าย แยกจากงาน เพื่อไม่ให้ไปปนในรายการงาน/ปฏิทิน
  money: [],
  moneyMonth: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  moneyCat: '',
  quickMoneyType: 'expense',
  view: VIEWS.includes(savedView) ? savedView : 'dashboard',
  filter: {
    status: STATUSES.some(([v]) => v === savedFilter.status) ? savedFilter.status : 'pending',
    sort: SORTS.some(([v]) => v === savedFilter.sort) ? savedFilter.sort : 'due',
    tag: typeof savedFilter.tag === 'string' ? savedFilter.tag : '',
    kind: KINDS.some(([v]) => v === savedFilter.kind) ? savedFilter.kind : 'all',
    q: '',
  },
  quickWhen: '',
  cal: { mode: prefs.calMode === 'week' ? 'week' : 'month', cursor: new Date(), selected: U.todayISO() },
  editingId: null,
};
const saveFilter = () =>
  savePrefs({ filter: { status: state.filter.status, sort: state.filter.sort, tag: state.filter.tag, kind: state.filter.kind } });

let store = null;
const dialog = $('#task-dialog');
const form = $('#task-form');
const moneyDialog = $('#money-dialog');
const moneyForm = $('#money-form');
const slipsDialog = $('#slips-dialog');
const anyDialogOpen = () => dialog.open || moneyDialog.open || slipsDialog.open;

// ---------- เริ่มต้น ----------
async function init() {
  applyTheme(prefs.theme || 'auto');
  applyI18n();
  bindEvents();
  $('#view').innerHTML = loadingHTML();
  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = `
      <div class="empty">
        ${icon('close')}
        <h2>${t('err.connect')}</h2>
        <p>${t('err.connectHint')}</p>
        <button class="btn btn-primary" type="button" onclick="location.reload()">${t('retry')}</button>
      </div>`;
    return;
  }
  store.onError = (err) => {
    console.error(err);
    toast(errorMessage(err));
  };
  store.onAuth(() => render());
  store.subscribe((items) => {
    state.tasks = items.filter((t) => !U.isMoney(t) && !U.isLegacy(t));
    state.money = items.filter(U.isMoney);
    render();
  });
  // อัปเดตสถานะ "เลยกำหนด" ตามเวลาที่ผ่านไป
  setInterval(() => {
    if (!anyDialogOpen() && document.visibilityState === 'visible' && !isTyping()) render();
  }, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && !anyDialogOpen()) render();
  });
}

// ---------- วาดหน้าจอ ----------
function render() {
  if (!store) return;
  renderAccount();
  renderBanner();
  const needLogin = store.mode === 'firebase' && !store.user;
  document.body.classList.toggle('logged-out', needLogin);
  $$('.tab').forEach((b) => b.setAttribute('aria-current', b.dataset.view === state.view ? 'page' : 'false'));

  const el = $('#view');
  if (needLogin) {
    el.innerHTML = loginHTML();
    return;
  }
  if (!store.ready) {
    el.innerHTML = loadingHTML();
    return;
  }

  // คงโฟกัสช่องพิมพ์ไว้หลังวาดใหม่
  const active = document.activeElement;
  const focusId = el.contains(active) ? active.id : '';
  const caret = focusId && 'selectionStart' in active ? active.selectionStart : null;

  el.innerHTML = { dashboard: dashboardView, events: eventsView, list: listView, calendar: calendarView, money: moneyView }[state.view]();

  if (focusId) {
    const f = document.getElementById(focusId);
    if (f) {
      f.focus();
      if (caret != null) {
        try {
          f.setSelectionRange(caret, caret);
        } catch {}
      }
    }
  }
}

function renderAccount() {
  const el = $('#account');
  if (store.mode === 'firebase') {
    const u = store.user;
    el.innerHTML = u
      ? `<div class="account">
           ${u.photoURL ? `<img class="avatar" src="${esc(u.photoURL)}" alt="" referrerpolicy="no-referrer" />` : ''}
           <div class="account-text">
             <div class="account-name">${esc(u.displayName || t('user'))}</div>
             <div class="account-sub">${esc(u.email || '')}</div>
           </div>
         </div>
         <div class="sync-note"><i class="dot-online"></i>${t('synced')}</div>
         <button class="menu-item" type="button" data-action="sign-out">${t('signOut')}</button>`
      : `<div class="menu-label">${t('account')}</div><p class="account-sub">${t('notSignedIn')}</p>`;
  } else {
    el.innerHTML = `<div class="menu-label">${t('localMode')}</div>
      <p class="account-sub">${t('localNote')}</p>`;
  }
  $$('[data-theme-value]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.themeValue === (prefs.theme || 'auto'))),
  );
  $$('[data-lang-value]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.langValue === getLang())));
}

function renderBanner() {
  const show = store.mode === 'local' && !prefs.hideLocalBanner;
  $('#banner').innerHTML = show
    ? `<div class="banner">
         <span><b>${t('localMode')}</b> — ${t('localBanner')}</span>
         <button class="icon-btn" type="button" data-action="dismiss-banner" aria-label="${t('dismiss')}">${icon('close')}</button>
       </div>`
    : '';
}

const loadingHTML = () => `<div class="loading"><span class="spinner"></span>${t('loading')}</div>`;

function loginHTML() {
  return `
    <div class="login-card">
      <span class="brand-mark big" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS.check}</svg></span>
      <h1>MildTask</h1>
      <p>${t('login.tagline')}</p>
      <button class="btn btn-google" type="button" data-action="sign-in">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        ${t('login.google')}
      </button>
    </div>`;
}

function emptyHTML(title, text, withAdd = true) {
  return `
    <div class="empty">
      ${icon('inbox')}
      <h2>${title}</h2>
      <p>${text}</p>
      ${withAdd ? `<button class="btn btn-primary" type="button" data-action="add">${icon('plus')}${t('addFirst')}</button>` : ''}
    </div>`;
}

// ---------- ส่วนประกอบรายการงาน ----------
function taskItemHTML(t, { showDate = true } = {}) {
  const event = U.isEvent(t);
  const overdue = U.isOverdue(t);
  const meta = [];
  if (event) meta.push(`<span class="kind-badge">${U.EVENT_CATEGORIES[t.category].label}</span>`);
  if (U.isOngoingEvent(t)) meta.push(`<span class="now-badge">${tr('ongoing')}</span>`);
  const time = event ? U.timeRange(t) || (showDate ? '' : tr('allDay')) : t.dueTime;
  if (t.dueDate && (showDate || time)) {
    const label = [showDate ? U.relativeDateLabel(t.dueDate) : '', time].filter(Boolean).join(' · ');
    meta.push(`<span class="meta${overdue ? ' is-overdue' : ''}">${icon(showDate ? 'calendar' : 'clock')}${label}</span>`);
  }
  if (t.location) meta.push(`<span class="meta">${icon('pin')}${esc(t.location)}</span>`);
  if (!event && t.priority !== 'medium') {
    meta.push(`<span class="prio-badge prio-${t.priority}">${U.PRIORITIES[t.priority].label}</span>`);
  }
  if (t.description) meta.push(`<span class="meta" title="${tr('hasNotes')}">${icon('note')}</span>`);
  for (const tag of t.tags) meta.push(`<span class="tag">#${esc(tag)}</span>`);

  const lead = event
    ? `<span class="event-mark" aria-hidden="true">${icon('calendar')}</span>`
    : `<button class="check" type="button" data-action="toggle" aria-pressed="${t.done}"
        aria-label="${tr(t.done ? 'markUndone' : 'markDone')}">${icon('check')}</button>`;
  const cls = event ? `is-event cat-${t.category}${U.isPastEvent(t) ? ' is-past' : ''}` : `prio-${t.priority}${t.done ? ' is-done' : ''}`;
  return `
    <li class="task ${cls}" data-id="${esc(t.id)}">
      ${lead}
      <button class="task-main" type="button" data-action="edit">
        <span class="task-title">${esc(t.title)}</span>
        ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
      </button>
      <button class="icon-btn task-del" type="button" data-action="delete" aria-label="${tr('delete')}">${icon('trash')}</button>
    </li>`;
}
const taskListHTML = (list, opts) => `<ul class="task-list">${list.map((t) => taskItemHTML(t, opts)).join('')}</ul>`;

const allTags = () =>
  [...new Set(state.tasks.flatMap((t) => t.tags))].sort((a, b) => a.localeCompare(b, 'th'));

// ---------- มุมมอง: ภาพรวม ----------
// กล่องรายการบนแดชบอร์ด · more = { status, kind } สำหรับปุ่ม "ดูทั้งหมด" เมื่อเกิน limit
function panelHTML(title, list, { empty, showDate = true, tone = '', limit = 0, more = {} } = {}) {
  const shown = limit ? list.slice(0, limit) : list;
  return `
    <section class="panel${tone ? ` panel-${tone}` : ''}">
      <header class="panel-head"><h2>${title}</h2><span class="count">${list.length}</span></header>
      ${shown.length ? taskListHTML(shown, { showDate }) : `<p class="panel-empty">${empty}</p>`}
      ${limit && list.length > limit ? `<button class="link-btn" type="button" data-action="goto-list" data-status="${more.status || 'pending'}" data-kind="${more.kind || 'all'}">${t('viewAll', { n: list.length })}</button>` : ''}
    </section>`;
}

function dashboardView() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = t(hour < 12 ? 'greet.morning' : hour < 17 ? 'greet.afternoon' : 'greet.evening');
  const head = `
    <div class="page-head">
      <p class="eyebrow">${U.F.full.format(now)}</p>
      <h1>${greeting}</h1>
    </div>`;

  const items = state.tasks;
  const money = dashMoneyHTML();
  if (!items.length) return head + emptyHTML(t('empty.noTasks'), t('empty.dash')) + (money ? `<div class="dash-grid">${money}</div>` : '');

  // สถิติ/ความคืบหน้านับเฉพาะงาน ส่วนรายการวันนี้/7 วันแสดงกิจกรรมด้วย
  const tasks = items.filter((t) => !U.isEvent(t));
  const today = U.todayISO();
  const in7 = U.toISODate(U.addDays(now, 7));
  const pending = tasks.filter((t) => !t.done);
  const overdue = pending.filter((t) => U.isOverdue(t)).sort(U.compareByDue);
  const todayList = items.filter((t) => t.dueDate === today && !U.isOverdue(t)).sort(U.compareByDue);
  const todayTasks = todayList.filter((t) => !U.isEvent(t));
  const todayDone = todayTasks.filter((t) => t.done).length;
  const todayEvents = todayList.length - todayTasks.length;
  const upcoming = items
    .filter((t) => !U.isFinished(t) && t.dueDate && t.dueDate > today && t.dueDate <= in7)
    .sort(U.compareByDue);
  const upcomingTasks = upcoming.filter((t) => !U.isEvent(t)).length;
  const noDate = pending.filter((t) => !t.dueDate).sort(U.compareByPriority);
  const doneCount = tasks.length - pending.length;
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0;

  const panel = panelHTML;

  return `
    ${head}
    <section class="stats">
      <button class="stat" type="button" data-action="goto-calendar">
        <span class="stat-label">${t('stat.todayTasks')}</span>
        <span class="stat-value">${todayTasks.length - todayDone}</span>
        <span class="stat-sub">${t('stat.doneOf', { done: todayDone, total: todayTasks.length })}${todayEvents ? t('stat.eventsN', { n: todayEvents }) : ''}</span>
      </button>
      <button class="stat${overdue.length ? ' stat-danger' : ''}" type="button" data-action="goto-list" data-status="overdue" data-kind="task">
        <span class="stat-label">${t('status.overdue')}</span>
        <span class="stat-value">${overdue.length}</span>
        <span class="stat-sub">${t(overdue.length ? 'stat.overdueSub' : 'stat.noOverdue')}</span>
      </button>
      <button class="stat" type="button" data-action="goto-list" data-status="pending" data-kind="task">
        <span class="stat-label">${t('stat.pendingAll')}</span>
        <span class="stat-value">${pending.length}</span>
        <span class="stat-sub">${t('stat.next7Tasks', { n: upcomingTasks })}</span>
      </button>
      <button class="stat" type="button" data-action="goto-list" data-status="done" data-kind="task">
        <span class="stat-label">${t('stat.progress')}</span>
        <span class="stat-value">${pct}%</span>
        <span class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></span>
        <span class="stat-sub">${t('stat.doneOfTasks', { done: doneCount, total: tasks.length })}</span>
      </button>
    </section>
    <div class="dash-grid">
      ${overdue.length ? panel(t('status.overdue'), overdue, { tone: 'danger' }) : ''}
      ${panel(t('today'), todayList, { empty: t('empty.today'), showDate: false })}
      ${money}
      ${panel(t('next7'), upcoming, { empty: t('empty.week') })}
      ${noDate.length ? panel(t('noDate'), noDate, { limit: 5, more: { kind: 'task' } }) : ''}
    </div>`;
}

// กล่องสรุปการเงินเดือนนี้ในหน้าภาพรวม
function dashMoneyHTML() {
  if (!state.money.length) return '';
  const now = new Date();
  const today = U.todayISO();
  const month = state.money.filter((m) => m.dueDate.startsWith(today.slice(0, 7)));
  const expenses = month.filter((m) => m.type === 'expense');
  const income = sumOf(month.filter((m) => m.type === 'income'));
  const expense = sumOf(expenses);
  const balance = income - expense;
  const todaySpent = sumOf(expenses.filter((m) => m.dueDate === today));

  // เทียบรายจ่ายกับเดือนก่อน ในช่วงวันที่เดียวกัน (วันที่ 1 ถึงวันนี้)
  const prevKey = U.toISODate(new Date(now.getFullYear(), now.getMonth() - 1, 1)).slice(0, 7);
  const prevSpent = sumOf(
    state.money.filter((m) => m.type === 'expense' && m.dueDate.startsWith(prevKey) && Number(m.dueDate.slice(8)) <= now.getDate()),
  );
  let compare = '';
  if (prevSpent) {
    const pct = Math.round(((expense - prevSpent) / prevSpent) * 100);
    compare = pct
      ? `<span class="${pct > 0 ? 'is-up' : 'is-down'}">${t(pct > 0 ? 'dash.moreThanPrev' : 'dash.lessThanPrev', { pct: Math.abs(pct) })}</span>`
      : `<span>${t('dash.sameAsPrev')}</span>`;
  }

  const recent = [...month].sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.createdAt - a.createdAt).slice(0, 4);
  return `
    <section class="panel dash-money">
      <header class="panel-head">
        <h2>${icon('wallet')}${t('dash.money', { month: U.F.monthYear.format(now) })}</h2>
        <button class="link-btn" type="button" data-action="goto-money" data-cat="">${t('dash.moneyAll')}</button>
      </header>
      <div class="mini-stats">
        <div><span>${t('type.income')}</span><b class="money-in">${U.formatMoney(income)}</b></div>
        <div><span>${t('type.expense')}</span><b>${U.formatMoney(expense)}</b></div>
        <div><span>${t('money.balance')}</span><b class="${balance < 0 ? 'is-neg' : ''}">${balance < 0 ? '−' : ''}${U.formatMoney(Math.abs(balance))}</b></div>
      </div>
      <p class="dash-money-sub"><span>${t('dash.todaySpent', { amount: U.formatMoney(todaySpent) })}</span>${compare}</p>
      ${expenses.length ? moneyCatRowsHTML('expense', expenses, { limit: 4, action: 'goto-money' }) : ''}
      ${
        recent.length
          ? `<h3 class="group-title">${t('dash.recent')}</h3><ul class="task-list">${recent.map((m) => moneyItemHTML(m, { showDate: true })).join('')}</ul>`
          : `<p class="panel-empty">${t('money.emptyMonth')}</p>`
      }
    </section>`;
}

// ---------- มุมมอง: กิจกรรม ----------
function eventsView() {
  return `
    <div class="page-head">
      <p class="eyebrow">${U.F.full.format(new Date())}</p>
      <h1>${t('view.events')}</h1>
    </div>
    ${eventDashboardHTML()}`;
}

// แดชบอร์ดกิจกรรม: กิจกรรมถัดไป ประชุมที่ต้องเข้า วันนี้ 7 วันข้างหน้า และสรุปตามประเภท
function eventDashboardHTML() {
  const events = state.tasks.filter(U.isEvent);
  if (!events.length) {
    return `
      <div class="empty">
        ${icon('calendar')}
        <h2>${t('empty.noEvents')}</h2>
        <p>${t('empty.eventsText')}</p>
        <button class="btn btn-primary" type="button" data-action="add-event-on" data-date="${U.todayISO()}">${icon('plus')}${t('addEvent')}</button>
      </div>`;
  }
  const today = U.todayISO();
  const in7 = U.toISODate(U.addDays(new Date(), 7));
  const upcoming = events.filter((t) => !U.isPastEvent(t)).sort(U.compareByDue);
  const todayList = events.filter((t) => t.dueDate === today).sort(U.compareByDue);
  const todayLeft = todayList.filter((t) => !U.isPastEvent(t)).length;
  const meetings = upcoming.filter((t) => t.category === 'meeting');
  const meetings7 = meetings.filter((t) => t.dueDate <= in7);
  const meetingsToday = meetings.filter((t) => t.dueDate === today).length;
  const next7 = upcoming.filter((t) => t.dueDate <= in7);
  const week = next7.filter((t) => t.dueDate > today);
  // กิจกรรมถัดไป: วันนี้เลือกอันที่มีเวลาก่อน (กิจกรรมทั้งวันใช้เมื่อไม่มีอย่างอื่น)
  const next = upcoming.find((t) => t.dueDate > today || t.dueTime) || upcoming[0];

  const cats = Object.entries(U.EVENT_CATEGORIES).map(([k, c]) => [k, c.label, next7.filter((t) => t.category === k).length]);
  const max = Math.max(1, ...cats.map(([, , n]) => n));

  return `
    <section class="stats">
      <button class="stat" type="button" data-action="goto-calendar">
        <span class="stat-label">${t('stat.todayEvents')}</span>
        <span class="stat-value">${todayLeft}</span>
        <span class="stat-sub">${todayList.length ? t('stat.leftOf', { left: todayLeft, total: todayList.length }) : t('stat.freeToday')}</span>
      </button>
      ${
        next
          ? `<button class="stat stat-event cat-${next.category}" type="button" data-action="edit" data-id="${esc(next.id)}">
               <span class="stat-label">${t('next')} · ${U.EVENT_CATEGORIES[next.category].label}</span>
               <span class="stat-text" title="${esc(next.title)}">${esc(next.title)}</span>
               <span class="stat-sub">${esc(U.eventWhenLabel(next))}${next.location ? ` · ${esc(next.location)}` : ''}</span>
             </button>`
          : `<div class="stat"><span class="stat-label">${t('next')}</span><span class="stat-text">—</span><span class="stat-sub">${t('stat.noUpcoming')}</span></div>`
      }
      <button class="stat stat-event cat-meeting" type="button" data-action="goto-list" data-status="pending" data-kind="event:meeting">
        <span class="stat-label">${t('stat.meetings')}</span>
        <span class="stat-value">${meetings7.length}</span>
        <span class="stat-sub">${t('stat.meetingsSub', { n: meetingsToday })}</span>
      </button>
      <button class="stat" type="button" data-action="goto-list" data-status="pending" data-kind="event">
        <span class="stat-label">${t('stat.upcomingEvents')}</span>
        <span class="stat-value">${upcoming.length}</span>
        <span class="stat-sub">${t('stat.next7Items', { n: next7.length })}</span>
      </button>
    </section>
    <div class="dash-grid">
      ${panelHTML(t('stat.meetings'), meetings, { empty: t('empty.noMeetings'), limit: 6, more: { kind: 'event:meeting' } })}
      ${panelHTML(t('today'), todayList, { empty: t('empty.noEventsToday'), showDate: false })}
      ${panelHTML(t('next7'), week, { empty: t('empty.noEventsWeek'), limit: 8, more: { kind: 'event' } })}
      <section class="panel">
        <header class="panel-head"><h2>${t('byCategory')}</h2><span class="count">${next7.length}</span></header>
        <ul class="cat-rows">
          ${cats
            .map(
              ([k, label, n]) => `
            <li><button class="cat-row cat-${k}" type="button" data-action="goto-list" data-status="pending" data-kind="event:${k}">
              <span class="cat-name">${label}</span>
              <span class="cat-bar"><span style="width:${Math.round((n / max) * 100)}%"></span></span>
              <span class="cat-count">${n}</span>
            </button></li>`,
            )
            .join('')}
        </ul>
      </section>
    </div>`;
}

// ---------- มุมมอง: รายการงาน ----------
function ofKind(list) {
  const kind = state.filter.kind;
  if (kind === 'all') return list;
  if (kind === 'task') return list.filter((t) => !U.isEvent(t));
  const cat = kind.split(':')[1];
  return list.filter((t) => U.isEvent(t) && (!cat || t.category === cat));
}

function filteredTasks() {
  const { status, tag, q, sort } = state.filter;
  const needle = q.trim().toLowerCase();
  const list = ofKind(state.tasks).filter(
    (t) =>
      (status === 'all' ||
        (status === 'done' ? U.isFinished(t) : status === 'overdue' ? U.isOverdue(t) : !U.isFinished(t))) &&
      (!tag || t.tags.includes(tag)) &&
      (!needle || [t.title, t.description, t.location, U.isEvent(t) ? U.EVENT_CATEGORIES[t.category].label : '', ...t.tags].some((s) => s.toLowerCase().includes(needle))),
  );
  const cmp =
    sort === 'priority' ? U.compareByPriority : sort === 'created' ? (a, b) => b.createdAt - a.createdAt : U.compareByDue;
  return list.sort(cmp);
}

function groupOf(t) {
  if (U.isFinished(t) && state.filter.status === 'all') return ['done', tr('group.finished')];
  if (U.isOverdue(t)) return ['overdue', tr('status.overdue')];
  if (!t.dueDate) return ['none', tr('noDate')];
  return [t.dueDate, `${U.relativeDateLabel(t.dueDate)} · ${U.F.weekdayLong.format(U.parseISODate(t.dueDate))}`];
}

function listResultsHTML() {
  if (!state.tasks.length) return emptyHTML(t('empty.noTasks'), t('empty.list'), false);
  const list = filteredTasks();
  if (!list.length) return emptyHTML(t('empty.noResults'), t('empty.tryFilter'), false);
  if (state.filter.sort !== 'due') return taskListHTML(list);

  let html = '';
  let current = null;
  for (const item of list) {
    const [key, label] = groupOf(item);
    if (key !== current) {
      if (current !== null) html += '</ul></section>';
      html += `<section class="group${key === 'overdue' ? ' group-danger' : ''}"><h3 class="group-title">${esc(label)}</h3><ul class="task-list">`;
      current = key;
    }
    html += taskItemHTML(item, { showDate: key === 'overdue' || key === 'done' });
  }
  return html + '</ul></section>';
}

function listView() {
  const f = state.filter;
  const tags = allTags();
  if (f.tag && !tags.includes(f.tag)) f.tag = '';
  const items = ofKind(state.tasks);
  const counts = {
    pending: items.filter((t) => !U.isFinished(t)).length,
    overdue: items.filter((t) => U.isOverdue(t)).length,
    done: items.filter((t) => U.isFinished(t)).length,
    all: items.length,
  };
  const opt = (v, l, cur) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`;

  return `
    <div class="page-head"><h1>${t('view.list')}</h1></div>
    <form class="quick-add" id="quick-add" autocomplete="off">
      ${icon('plus')}
      <input id="quick-add-input" name="title" maxlength="200" placeholder="${t('quick.ph')}" aria-label="${t('quick.aria')}" />
      <select id="quick-when" name="when" aria-label="${t('f.dueDate')}">
        ${opt('', t('noDate'), state.quickWhen)}${opt('today', t('today'), state.quickWhen)}${opt('tomorrow', t('tomorrow'), state.quickWhen)}
      </select>
      <button class="btn btn-primary" type="submit">${t('add')}</button>
    </form>
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="search-input" type="search" placeholder="${t('search')}" value="${esc(f.q)}" aria-label="${t('searchAria')}" /></label>
      <div class="segmented" role="group" aria-label="${t('status')}">
        ${STATUSES.map(([v, l]) => `<button type="button" data-action="set-status" data-status="${v}" aria-pressed="${f.status === v}">${l()}<span class="seg-count">${counts[v]}</span></button>`).join('')}
      </div>
      <div class="selects">
        <select id="kind-select" aria-label="${t('type')}">${KINDS.map(([v, l]) => opt(v, l(), f.kind)).join('')}</select>
        <select id="sort-select" aria-label="${t('sortAria')}">${SORTS.map(([v, l]) => opt(v, t('sortBy', { label: l() }), f.sort)).join('')}</select>
        <select id="tag-select" aria-label="${t('tagAria')}">${opt('', t('allTags'), f.tag)}${tags.map((tag) => opt(tag, `#${tag}`, f.tag)).join('')}</select>
      </div>
    </div>
    <div id="list-results">${listResultsHTML()}</div>`;
}

// ---------- มุมมอง: ตารางงาน ----------
function tasksByDate() {
  const map = new Map();
  for (const item of state.tasks) {
    if (!item.dueDate) continue;
    if (!map.has(item.dueDate)) map.set(item.dueDate, []);
    map.get(item.dueDate).push(item);
  }
  for (const list of map.values()) list.sort(U.compareByDue);
  return map;
}

// รายรับรายจ่ายตามวัน (แสดงในปฏิทินด้วย)
function moneyByDate() {
  const map = new Map();
  for (const m of state.money) {
    if (!map.has(m.dueDate)) map.set(m.dueDate, []);
    map.get(m.dueDate).push(m);
  }
  for (const list of map.values()) list.sort((a, b) => a.createdAt - b.createdAt);
  return map;
}

// "+฿30,000 −฿845" (แสดงเฉพาะฝั่งที่มี)
function moneyTotalsHTML(list) {
  const inc = sumOf(list.filter((m) => m.type === 'income'));
  const exp = sumOf(list.filter((m) => m.type === 'expense'));
  return [inc && `<span class="money-in">+${U.formatMoney(inc)}</span>`, exp && `<span class="money-out">−${U.formatMoney(exp)}</span>`]
    .filter(Boolean)
    .join('');
}

function dayMoneyHTML(list) {
  if (!list.length) return '';
  return `
    <div class="cal-money-block">
      <h3 class="group-title"><span>${icon('wallet')}${t('money.title')}</span><span class="money-totals">${moneyTotalsHTML(list)}</span></h3>
      <ul class="task-list">${list.map((m) => moneyItemHTML(m)).join('')}</ul>
    </div>`;
}

function calendarView() {
  const { mode, cursor } = state.cal;
  const byDate = tasksByDate();
  const money = moneyByDate();
  let title;
  if (mode === 'month') {
    title = U.F.monthYear.format(cursor);
  } else {
    const start = U.startOfWeek(cursor);
    title = `${U.F.dayMonth.format(start)} – ${U.F.dayMonthYear.format(U.addDays(start, 6))}`;
  }
  return `
    <div class="cal-head">
      <h1 class="cal-title">${title}</h1>
      <div class="cal-controls">
        <div class="cal-nav">
          <button class="icon-btn" type="button" data-action="cal-prev" aria-label="${t('prev')}">${icon('left')}</button>
          <button class="btn btn-sm" type="button" data-action="cal-today">${t('today')}</button>
          <button class="icon-btn" type="button" data-action="cal-next" aria-label="${t('next')}">${icon('right')}</button>
        </div>
        <div class="segmented" role="group" aria-label="${t('layout')}">
          <button type="button" data-action="cal-mode" data-mode="month" aria-pressed="${mode === 'month'}">${t('month')}</button>
          <button type="button" data-action="cal-mode" data-mode="week" aria-pressed="${mode === 'week'}">${t('week')}</button>
        </div>
      </div>
    </div>
    ${mode === 'month' ? monthHTML(byDate, money) : weekHTML(byDate, money)}`;
}

function monthHTML(byDate, money) {
  const { cursor, selected } = state.cal;
  const today = U.todayISO();
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const daysInMonth = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0).getDate();
  const rows = Math.ceil((first.getDay() + daysInMonth) / 7);
  const start = U.startOfWeek(first);

  let cells = '';
  for (let i = 0; i < rows * 7; i++) {
    const d = U.addDays(start, i);
    const iso = U.toISODate(d);
    const list = byDate.get(iso) || [];
    const cash = money.get(iso) || [];
    const cls = [
      'cal-cell',
      d.getMonth() !== cursor.getMonth() && 'is-outside',
      iso === today && 'is-today',
      iso === selected && 'is-selected',
    ].filter(Boolean).join(' ');
    const chips = list
      .slice(0, 3)
      .map(
        (item) => `<button type="button" class="chip ${chipClass(item)}" data-action="edit" data-id="${esc(item.id)}" title="${esc(item.title)}">${item.dueTime ? `<b>${item.dueTime}</b> ` : ''}${esc(item.title)}</button>`,
      )
      .join('');
    const dots = list
      .slice(0, 4)
      .map((item) => `<i class="dot ${chipClass(item)}"></i>`)
      .join('');
    cells += `
      <div class="${cls}" role="button" tabindex="0" data-action="select-day" data-date="${iso}"
        aria-label="${U.F.full.format(d)}${list.length + cash.length ? t('hasItems', { n: list.length + cash.length }) : ''}">
        <span class="cal-num">${d.getDate()}</span>
        <div class="cal-chips">${chips}${list.length > 3 ? `<span class="more">${t('moreItems', { n: list.length - 3 })}</span>` : ''}</div>
        ${cash.length ? `<div class="cal-money">${moneyTotalsHTML(cash)}</div>` : ''}
        <div class="cal-dots">${dots}${cash.length ? '<i class="dot dot-money"></i>' : ''}</div>
      </div>`;
  }

  const selList = byDate.get(selected) || [];
  const selMoney = money.get(selected) || [];
  return `
    <div class="month">
      <div class="cal-weekdays">${t('wd').map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <section class="panel day-panel">
      <header class="panel-head">
        <h2>${selected === U.todayISO() ? `${t('today')} · ` : ''}${U.F.full.format(U.parseISODate(selected))}</h2>
        <div class="panel-actions">
          <button class="btn btn-sm" type="button" data-action="add-on" data-date="${selected}">${icon('plus')}${t('task')}</button>
          <button class="btn btn-sm" type="button" data-action="add-event-on" data-date="${selected}">${icon('plus')}${t('event')}</button>
          <button class="btn btn-sm" type="button" data-action="add-money" data-type="expense" data-date="${selected}">${icon('plus')}${t('cal.money')}</button>
        </div>
      </header>
      ${selList.length ? taskListHTML(selList, { showDate: false }) : selMoney.length ? '' : `<p class="panel-empty">${t('empty.day')}</p>`}
      ${dayMoneyHTML(selMoney)}
    </section>`;
}

const chipClass = (t) =>
  U.isEvent(t)
    ? `is-event cat-${t.category}${U.isPastEvent(t) ? ' is-done' : ''}`
    : `prio-${t.priority}${t.done ? ' is-done' : ''}${U.isOverdue(t) ? ' is-overdue' : ''}`;

function weekHTML(byDate, money) {
  const start = U.startOfWeek(state.cal.cursor);
  const today = U.todayISO();
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = U.addDays(start, i);
    const iso = U.toISODate(d);
    const list = byDate.get(iso) || [];
    const cash = money.get(iso) || [];
    const n = list.length + cash.length;
    cols += `
      <section class="week-col${iso === today ? ' is-today' : ''}">
        <header class="week-head">
          <span class="wd">${U.weekdayShort(i)}</span>
          <span class="wn">${d.getDate()}</span>
          <span class="wc">${n ? t('items', { n }) : ''}</span>
        </header>
        ${list.length ? taskListHTML(list, { showDate: false }) : ''}
        ${dayMoneyHTML(cash)}
        <div class="add-slots">
          <button class="add-slot" type="button" data-action="add-on" data-date="${iso}" aria-label="${t('addTask')}">${icon('plus')}${t('task')}</button>
          <button class="add-slot" type="button" data-action="add-event-on" data-date="${iso}" aria-label="${t('addEvent')}">${icon('plus')}${t('event')}</button>
          <button class="add-slot" type="button" data-action="add-money" data-type="expense" data-date="${iso}" aria-label="${t('cal.moneyAdd')}">${icon('plus')}${t('cal.money')}</button>
        </div>
      </section>`;
  }
  return `<div class="week">${cols}</div>`;
}

// ---------- มุมมอง: รายรับรายจ่าย ----------
const monthKey = () => U.toISODate(state.moneyMonth).slice(0, 7);
const sumOf = (list) => list.reduce((n, m) => n + m.amount, 0);
const signed = (m) => `${m.type === 'income' ? '+' : '−'}${U.formatMoney(m.amount)}`;

function moneyItemHTML(m, { showDate = false } = {}) {
  const cat = U.moneyCategories(m.type)[m.category];
  const meta = [`<span class="kind-badge">${cat.label}</span>`];
  if (showDate) meta.push(`<span class="meta">${icon('calendar')}${U.relativeDateLabel(m.dueDate)}</span>`);
  if (m.description) meta.push(`<span class="meta" title="${tr('hasNotes')}">${icon('note')}</span>`);
  for (const tag of m.tags) meta.push(`<span class="tag">#${esc(tag)}</span>`);
  return `
    <li class="task money-item is-${m.type} mcat-${m.category}" data-id="${esc(m.id)}">
      <span class="event-mark" aria-hidden="true">${icon(m.type === 'income' ? 'down' : 'up')}</span>
      <button class="task-main" type="button" data-action="edit">
        <span class="task-title">${esc(m.title)}</span>
        <span class="task-meta">${meta.join('')}</span>
      </button>
      <span class="money-amount">${signed(m)}</span>
      <button class="icon-btn task-del" type="button" data-action="delete" aria-label="${tr('delete')}">${icon('trash')}</button>
    </li>`;
}

// แถบสัดส่วนตามหมวด · กดเพื่อกรองรายการ (กดซ้ำ = ยกเลิก)
function moneyCatRowsHTML(type, list, { limit = 0, action = 'money-cat' } = {}) {
  const all = Object.entries(U.moneyCategories(type))
    .map(([k, c]) => [k, c.label, sumOf(list.filter((m) => m.category === k))])
    .filter(([, , n]) => n > 0)
    .sort((a, b) => b[2] - a[2]);
  const rows = limit ? all.slice(0, limit) : all;
  const max = Math.max(1, ...rows.map(([, , n]) => n));
  return `<ul class="cat-rows money-rows">${rows
    .map(
      ([k, label, n]) => `
      <li><button class="cat-row mcat-${k}" type="button" data-action="${action}" data-cat="${k}" aria-pressed="${action === 'money-cat' && state.moneyCat === k}">
        <span class="cat-name">${label}</span>
        <span class="cat-bar"><span style="width:${Math.round((n / max) * 100)}%"></span></span>
        <span class="cat-count">${U.formatMoney(n)}</span>
      </button></li>`,
    )
    .join('')}</ul>`;
}

function moneyView() {
  const month = state.moneyMonth;
  const now = new Date();
  const isThisMonth = month.getFullYear() === now.getFullYear() && month.getMonth() === now.getMonth();
  const head = `
    <div class="cal-head">
      <div>
        <p class="eyebrow">${t('money.title')}</p>
        <h1 class="cal-title">${U.F.monthYear.format(month)}</h1>
      </div>
      <div class="cal-nav">
        <button class="icon-btn" type="button" data-action="money-month" data-n="-1" aria-label="${t('money.prevMonth')}">${icon('left')}</button>
        <button class="btn btn-sm" type="button" data-action="money-month" data-n="0"${isThisMonth ? ' disabled' : ''}>${t('money.thisMonth')}</button>
        <button class="icon-btn" type="button" data-action="money-month" data-n="1" aria-label="${t('money.nextMonth')}">${icon('right')}</button>
      </div>
    </div>
    <form class="quick-add money-quick" id="money-quick" autocomplete="off">
      <div class="segmented money-type" role="group" aria-label="${t('type')}">
        ${U.MONEY_TYPES.map((v) => `<button type="button" class="is-${v}" data-action="quick-money-type" data-type="${v}" aria-pressed="${state.quickMoneyType === v}">${t(`type.${v}`)}</button>`).join('')}
      </div>
      <input id="money-quick-input" maxlength="200" placeholder="${t('quick.money')}" aria-label="${t('quick.moneyAria')}" />
      <button class="btn slip-btn" type="button" data-action="slip-pick" title="${t('slip.hint')}">${icon('receipt')}<span>${t('slip.read')}</span></button>
      <button class="btn btn-primary" type="submit">${t('add')}</button>
    </form>`;

  if (!state.money.length) {
    return `${head}
      <div class="empty">
        ${icon('wallet')}
        <h2>${t('money.empty')}</h2>
        <p>${t('money.emptyText')}</p>
        <div class="panel-actions">
          <button class="btn btn-primary" type="button" data-action="add-money" data-type="expense">${icon('plus')}${t('type.expense')}</button>
          <button class="btn" type="button" data-action="add-money" data-type="income">${icon('plus')}${t('type.income')}</button>
          <button class="btn" type="button" data-action="slip-pick">${icon('receipt')}${t('slip.read')}</button>
        </div>
      </div>`;
  }

  const items = state.money.filter((m) => m.dueDate.startsWith(monthKey()));
  const incomes = items.filter((m) => m.type === 'income');
  const expenses = items.filter((m) => m.type === 'expense');
  const income = sumOf(incomes);
  const expense = sumOf(expenses);
  const balance = income - expense;
  // เฉลี่ยต่อวัน: เดือนนี้นับถึงวันนี้ · เดือนอื่นนับทั้งเดือน
  const days = isThisMonth ? now.getDate() : new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();

  const cat = state.moneyCat;
  const shown = items
    .filter((m) => !cat || m.category === cat)
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate) || b.createdAt - a.createdAt);
  let list = '';
  let current = null;
  for (const m of shown) {
    if (m.dueDate !== current) {
      if (current !== null) list += '</ul></section>';
      current = m.dueDate;
      const day = shown.filter((x) => x.dueDate === current);
      const net = sumOf(day.filter((x) => x.type === 'income')) - sumOf(day.filter((x) => x.type === 'expense'));
      const sign = net < 0 ? '−' : net > 0 ? '+' : '';
      list += `
        <section class="money-day">
          <h3 class="group-title">
            <span>${esc(U.relativeDateLabel(current))} · ${esc(U.F.weekdayLong.format(U.parseISODate(current)))}</span>
            <span class="money-net${net < 0 ? ' is-neg' : ''}">${sign}${U.formatMoney(Math.abs(net))}</span>
          </h3>
          <ul class="task-list">`;
    }
    list += moneyItemHTML(m);
  }
  if (current !== null) list += '</ul></section>';
  const catLabel = cat && (U.EXPENSE_CATEGORIES[cat] || U.INCOME_CATEGORIES[cat])?.label;

  return `${head}
    <section class="stats">
      <button class="stat stat-income" type="button" data-action="add-money" data-type="income">
        <span class="stat-label">${t('type.income')}</span>
        <span class="stat-value">${U.formatMoney(income)}</span>
        <span class="stat-sub">${t('items', { n: incomes.length })}</span>
      </button>
      <button class="stat stat-expense" type="button" data-action="add-money" data-type="expense">
        <span class="stat-label">${t('type.expense')}</span>
        <span class="stat-value">${U.formatMoney(expense)}</span>
        <span class="stat-sub">${t('items', { n: expenses.length })}</span>
      </button>
      <div class="stat${balance < 0 ? ' stat-danger' : ''}">
        <span class="stat-label">${t('money.balance')}</span>
        <span class="stat-value">${balance < 0 ? '−' : ''}${U.formatMoney(Math.abs(balance))}</span>
        <span class="stat-sub">${t('money.balanceSub')}</span>
      </div>
      <div class="stat">
        <span class="stat-label">${t('money.avg')}</span>
        <span class="stat-value">${U.formatMoney(Math.round(expense / days))}</span>
        <span class="stat-sub">${t('money.avgSub', { n: days })}</span>
      </div>
    </section>
    <div class="money-grid">
      <div class="money-side">
        <section class="panel">
          <header class="panel-head"><h2>${t('money.byExpense')}</h2></header>
          ${expenses.length ? moneyCatRowsHTML('expense', expenses) : `<p class="panel-empty">${t('money.noExpense')}</p>`}
        </section>
        ${incomes.length ? `<section class="panel"><header class="panel-head"><h2>${t('money.byIncome')}</h2></header>${moneyCatRowsHTML('income', incomes)}</section>` : ''}
      </div>
      <section class="panel money-list">
        <header class="panel-head">
          <h2>${catLabel ? `${t('money.items')} · ${catLabel}` : t('money.items')}</h2>
          <span class="count">${shown.length}</span>
          ${cat ? `<button class="btn btn-sm" type="button" data-action="money-cat" data-cat="">${icon('close')}${t('money.clearFilter')}</button>` : ''}
        </header>
        ${list || `<p class="panel-empty">${t(cat ? 'money.emptyCat' : 'money.emptyMonth')}</p>`}
      </section>
    </div>`;
}

// ---------- การกระทำ ----------
function setView(view) {
  state.view = view;
  savePrefs({ view });
  render();
  window.scrollTo(0, 0);
}

function shiftCal(n) {
  const c = state.cal.cursor;
  state.cal.cursor = state.cal.mode === 'month' ? new Date(c.getFullYear(), c.getMonth() + n, 1) : U.addDays(c, 7 * n);
  render();
}

function toggleTask(id) {
  const t = store.get(id);
  if (!t || U.isEvent(t) || U.isMoney(t)) return;
  store.update(id, { done: !t.done });
}

function deleteTask(id) {
  const item = store.get(id);
  if (!item) return;
  store.remove(id);
  toast(t('toast.deleted', { title: item.title }), { action: t('undo'), onAction: () => store.put(item) });
}

function openTaskDialog({ task = null, date = '', type = 'task' } = {}) {
  if (!store || (store.mode === 'firebase' && !store.user)) return;
  toggleMenu(false);
  state.editingId = task?.id || null;
  const t = task || {
    type,
    category: 'meeting',
    title: '',
    description: '',
    dueDate: date,
    dueTime: '',
    endTime: '',
    location: '',
    priority: 'medium',
    tags: [],
    done: false,
  };
  const f = form.elements;
  form.reset();
  form.classList.toggle('is-edit', !!task);
  f.type.value = t.type;
  f.title.value = t.title;
  f.description.value = t.description;
  f.dueDate.value = t.dueDate || '';
  f.dueTime.value = t.dueTime || '';
  f.endTime.value = t.endTime || '';
  f.location.value = t.location || '';
  f.priority.value = t.priority;
  f.category.value = t.category || 'meeting';
  f.tags.value = t.tags.join(', ');
  f.done.checked = t.done;
  $$('.field-error', form).forEach((el) => (el.hidden = true));
  f.endTime.setCustomValidity('');
  syncDialogType();
  $('#tag-options').innerHTML = allTags().map((tag) => `<option value="${esc(tag)}"></option>`).join('');
  dialog.showModal();
  if (!task) f.title.focus();
}

// สลับช่องในฟอร์มตามประเภท (งาน / กิจกรรม)
function syncDialogType() {
  const f = form.elements;
  const event = f.type.value === 'event';
  form.dataset.type = event ? 'event' : 'task';
  $('#task-dialog-title').textContent = t(`dlg.${state.editingId ? 'edit' : 'add'}${event ? 'Event' : 'Task'}`);
  f.title.placeholder = t(event ? 'ph.event' : 'ph.task');
  // กิจกรรมต้องมีวันที่: ถ้ายังไม่ได้เลือก ใช้วันนี้
  if (event && !f.dueDate.value) f.dueDate.value = U.todayISO();
}

function closeDialog() {
  if (dialog.open) dialog.close();
  state.editingId = null;
}

function submitTaskForm(e) {
  e.preventDefault();
  const f = form.elements;
  const title = f.title.value.trim();
  if (!title) {
    $('.field-error', form).hidden = false;
    f.title.focus();
    return;
  }
  const event = f.type.value === 'event';
  const dueTime = f.dueTime.value;
  const endTime = event && dueTime ? f.endTime.value : '';
  if (event && !f.dueDate.value) {
    $('.date-error', form).hidden = false;
    f.dueDate.focus();
    return;
  }
  f.endTime.setCustomValidity(endTime && endTime <= dueTime ? t('f.endAfterStart') : '');
  if (!f.endTime.reportValidity()) return;
  const data = {
    type: event ? 'event' : 'task',
    category: event ? f.category.value || 'other' : '',
    title,
    description: f.description.value.trim(),
    // ใส่แค่เวลาโดยไม่ใส่วัน = วันนี้
    dueDate: f.dueDate.value || (dueTime ? U.todayISO() : null),
    dueTime,
    endTime,
    location: event ? f.location.value.trim() : '',
    priority: event ? 'medium' : f.priority.value || 'medium',
    tags: f.tags.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
  };
  if (state.editingId && store.get(state.editingId)) {
    store.update(state.editingId, { ...data, done: !event && f.done.checked });
    toast(t('toast.saved'));
  } else {
    store.add(data);
    toast(t(event ? 'toast.eventAdded' : 'toast.taskAdded'));
  }
  closeDialog();
}

// ---------- ฟอร์มรายรับรายจ่าย ----------
const moneyTags = () => [...new Set(state.money.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'th'));
// แสดงจำนวนเงินในช่องกรอก (สตางค์ → "125.5")
const amountText = (satang) => (satang ? String(satang / 100) : '');

function openMoneyDialog(item = null, type = state.quickMoneyType, date = '') {
  if (!store || (store.mode === 'firebase' && !store.user)) return;
  toggleMenu(false);
  state.editingId = item?.id || null;
  const f = moneyForm.elements;
  moneyForm.reset();
  moneyForm.classList.toggle('is-edit', !!item);
  f.type.value = item?.type || type;
  f.amount.value = amountText(item?.amount);
  f.title.value = item?.title || '';
  f.description.value = item?.description || '';
  f.tags.value = item ? item.tags.join(', ') : '';
  f.ref.value = item?.ref || '';
  hideSlip();
  // เพิ่มใหม่: ถ้ากำลังดูเดือนอื่น ใช้วันแรกของเดือนนั้น
  f.dueDate.value = item?.dueDate || date || (U.todayISO().startsWith(monthKey()) ? U.todayISO() : U.toISODate(state.moneyMonth));
  delete moneyForm.dataset.type;
  for (const k in pickedCat) delete pickedCat[k];
  syncMoneyType(item?.category || state.moneyCat);
  $('.amount-error', moneyForm).hidden = true;
  $('#money-tag-options').innerHTML = moneyTags().map((tag) => `<option value="${esc(tag)}"></option>`).join('');
  moneyDialog.showModal();
  if (!item) f.amount.focus();
}

// สร้างปุ่มหมวดตามประเภท (รายจ่าย / รายรับ) · จำหมวดที่เลือกไว้ของแต่ละประเภท เผื่อสลับกลับ
const pickedCat = {};
function syncMoneyType(keep = '') {
  const f = moneyForm.elements;
  const prev = moneyForm.dataset.type;
  const checked = moneyForm.querySelector('[name="category"]:checked')?.value;
  if (prev && checked) pickedCat[prev] = checked;
  const type = f.type.value === 'income' ? 'income' : 'expense';
  const cats = U.moneyCategories(type);
  const current = keep || pickedCat[type];
  const selected = cats[current] ? current : Object.keys(cats)[0];
  moneyForm.dataset.type = type;
  $('#money-dialog-title').textContent = t(`dlg.${state.editingId ? 'edit' : 'add'}${type === 'income' ? 'Income' : 'Expense'}`);
  f.title.placeholder = t(`ph.${type}`);
  $('#money-cats').innerHTML = Object.entries(cats)
    .map(([k, c]) => `<label class="mcat-${k}"><input type="radio" name="category" value="${k}"${k === selected ? ' checked' : ''} /><span>${c.label}</span></label>`)
    .join('');
}

function closeMoneyDialog() {
  if (moneyDialog.open) moneyDialog.close();
  state.editingId = null;
}

// ---------- อ่านสลิป ----------
// รูปอยู่ในหน่วยความจำระหว่างที่หน้าต่างเปิดเท่านั้น ปิดแล้วทิ้งทันที ไม่บันทึกที่ไหน
let slipUrl = '';
let slipToken = 0;
const slipBox = $('.slip-box', moneyForm);

function hideSlip() {
  slipToken++;
  if (slipUrl) URL.revokeObjectURL(slipUrl);
  slipUrl = '';
  $('.slip-img', slipBox).removeAttribute('src');
  slipBox.hidden = true;
}

function slipStatus(msg, { busy = false, tone = '' } = {}) {
  const el = $('.slip-status', slipBox);
  el.className = `slip-status${busy ? ' is-busy' : ''}${tone ? ` is-${tone}` : ''}`;
  $('.slip-msg', slipBox).textContent = msg;
}

async function readSlipFile(file) {
  if (!file) return;
  if (!file.type.startsWith('image/')) return toast(t('slip.notImage'));
  openMoneyDialog(null, 'expense');
  if (!moneyDialog.open) return;
  const token = ++slipToken;
  slipUrl = URL.createObjectURL(file);
  $('.slip-img', slipBox).src = slipUrl;
  $('.slip-dup', slipBox).hidden = true;
  slipBox.hidden = false;
  slipStatus(t('slip.loading'), { busy: true });
  let r;
  try {
    r = await readSlip(file, ({ stage, pct }) => {
      if (token === slipToken) slipStatus(stage === 'reading' ? t('slip.reading', { pct }) : t('slip.loading'), { busy: true });
    });
  } catch (err) {
    console.error(err);
    if (token === slipToken) slipStatus(t('slip.failed'), { tone: 'warn' });
    return;
  }
  if (token !== slipToken || !moneyDialog.open) return;

  // กรอกให้เฉพาะช่องที่ผู้ใช้ยังไม่ได้พิมพ์เอง
  const f = moneyForm.elements;
  if (r.amount && !f.amount.value) f.amount.value = amountText(r.amount);
  if (r.date) f.dueDate.value = r.date;
  if (!f.title.value) f.title.value = r.name || t(`slip.${r.kind}`);
  // เดาหมวดไม่ได้ = อื่นๆ
  if (f.type.value === 'expense') syncMoneyType(r.category || 'other');
  f.ref.value = r.ref;
  slipStatus(t(r.amount ? 'slip.done' : 'slip.noAmount'), { tone: r.amount ? 'ok' : 'warn' });

  const dup = r.ref && state.money.find((m) => m.ref === r.ref);
  if (dup) {
    const el = $('.slip-dup', slipBox);
    el.textContent = t('slip.dup', { title: dup.title, date: U.relativeDateLabel(dup.dueDate), amount: U.formatMoney(dup.amount) });
    el.hidden = false;
  }
  if (!r.amount) f.amount.focus();
}

// ---------- อ่านสลิปหลายรูป ----------
// อ่านทีละรูปตามคิว แล้วให้ตรวจ/แก้ทุกรายการในหน้าเดียวก่อนบันทึกพร้อมกัน
const MAX_SLIPS = 30;
let batch = [];
let batchToken = 0;

// เลือกมา 1 รูป = หน้าต่างแบบเดิม · หลายรูป = หน้าตรวจรวม
function readSlipFiles(files) {
  const list = [...(files || [])].filter((f) => f?.type?.startsWith('image/'));
  if (!list.length) {
    if (files?.length) toast(t('slip.notImage'));
    return;
  }
  if (list.length === 1) return readSlipFile(list[0]);
  if (list.length > MAX_SLIPS) toast(t('slip.tooMany', { n: MAX_SLIPS }));
  readSlipBatch(list.slice(0, MAX_SLIPS));
}

const catOptions = (selected) =>
  U.MONEY_TYPES.map(
    (type) => `<optgroup label="${t(`type.${type}`)}">${Object.entries(U.moneyCategories(type))
      .map(([k, c]) => `<option value="${type}:${k}"${selected === `${type}:${k}` ? ' selected' : ''}>${c.label}</option>`)
      .join('')}</optgroup>`,
  ).join('');

function slipRowHTML(r, i) {
  return `
    <li class="slip-row is-busy" data-i="${i}">
      <img class="slip-thumb" src="${r.url}" alt="" />
      <div class="slip-fields">
        <div class="slip-row-head">
          <label class="check-field"><input class="slip-use" type="checkbox" disabled /><span>${t('slip.use')} #${i + 1}</span></label>
          <span class="slip-status is-busy"><span class="spinner"></span><span class="slip-msg">${t('slip.waiting')}</span></span>
        </div>
        <div class="slip-grid">
          <input class="slip-amount" type="text" inputmode="decimal" autocomplete="off" placeholder="0.00" aria-label="${t('f.amount')}" disabled />
          <input class="slip-date" type="date" aria-label="${t('f.date')}" disabled />
          <input class="slip-title" type="text" maxlength="200" autocomplete="off" aria-label="${t('f.item')}" placeholder="${t('f.item')}" disabled />
          <select class="slip-cat" aria-label="${t('f.moneyCategory')}" disabled>${catOptions('expense:other')}</select>
        </div>
        <p class="slip-dup" hidden></p>
      </div>
    </li>`;
}

const batchRows = () => $$('.slip-row', slipsDialog);

function updateBatch() {
  const rows = batchRows();
  const done = rows.filter((r) => !r.classList.contains('is-busy')).length;
  $('#slips-title').textContent = done < rows.length ? t('slip.batchReading', { done, n: rows.length }) : t('slip.batchTitle', { n: rows.length });
  const picked = rows.filter((r) => $('.slip-use', r).checked);
  let total = 0;
  for (const r of picked) {
    const [type] = $('.slip-cat', r).value.split(':');
    total += (type === 'income' ? 1 : -1) * U.toSatang($('.slip-amount', r).value);
  }
  $('.slips-sum', slipsDialog).textContent = picked.length ? t('slip.batchSum', { amount: `${total < 0 ? '−' : '+'}${U.formatMoney(Math.abs(total))}` }) : '';
  const btn = $('#slips-save');
  btn.textContent = t('slip.batchSave', { n: picked.length });
  btn.disabled = !picked.length;
}

function setRowStatus(row, msg, { busy = false, tone = '' } = {}) {
  const el = $('.slip-status', row);
  el.className = `slip-status${busy ? ' is-busy' : ''}${tone ? ` is-${tone}` : ''}`;
  $('.slip-msg', row).textContent = msg;
}

function fillSlipRow(row, i, r) {
  row.classList.remove('is-busy');
  $$('input, select', row).forEach((el) => (el.disabled = false));
  const res = r || {};
  batch[i].ref = res.ref || '';
  $('.slip-amount', row).value = amountText(res.amount);
  $('.slip-date', row).value = res.date || U.todayISO();
  $('.slip-title', row).value = res.name || (r ? t(`slip.${res.kind}`) : '');
  $('.slip-cat', row).value = `expense:${res.category || 'other'}`;

  // ซ้ำกับที่บันทึกไว้แล้ว หรือซ้ำกับรูปก่อนหน้าในชุดนี้ = ไม่ติ๊กให้
  const ref = batch[i].ref;
  const saved = ref && state.money.find((m) => m.ref === ref);
  const twin = ref ? batch.findIndex((b, j) => j < i && b.ref === ref) : -1;
  const dup = $('.slip-dup', row);
  if (saved) dup.textContent = t('slip.dup', { title: saved.title, amount: U.formatMoney(saved.amount), date: U.relativeDateLabel(saved.dueDate) });
  else if (twin > -1) dup.textContent = t('slip.dupBatch', { n: twin + 1 });
  dup.hidden = !(saved || twin > -1);
  $('.slip-use', row).checked = !!res.amount && dup.hidden;

  if (!r) setRowStatus(row, t('slip.failed'), { tone: 'warn' });
  else if (!res.amount) setRowStatus(row, t('slip.noAmount'), { tone: 'warn' });
  else setRowStatus(row, t('slip.ok'), { tone: 'ok' });
}

async function readSlipBatch(files) {
  if (!store || (store.mode === 'firebase' && !store.user)) return;
  toggleMenu(false);
  closeBatch();
  const token = ++batchToken;
  batch = files.map((file) => ({ file, url: URL.createObjectURL(file), ref: '' }));
  $('#slips-list').innerHTML = batch.map(slipRowHTML).join('');
  updateBatch();
  slipsDialog.showModal();
  for (let i = 0; i < batch.length; i++) {
    const row = $(`.slip-row[data-i="${i}"]`, slipsDialog);
    setRowStatus(row, t('slip.loading'), { busy: true });
    let r = null;
    try {
      r = await readSlip(batch[i].file, ({ stage, pct }) => {
        if (token === batchToken) setRowStatus(row, stage === 'reading' ? t('slip.reading', { pct }) : t('slip.loading'), { busy: true });
      });
    } catch (err) {
      console.error(err);
    }
    if (token !== batchToken) return;
    fillSlipRow(row, i, r);
    updateBatch();
  }
}

// ปิดหน้าตรวจ: หยุดคิวที่เหลือ และทิ้งรูปทั้งหมดจากหน่วยความจำ
function closeBatch() {
  batchToken++;
  for (const b of batch) URL.revokeObjectURL(b.url);
  batch = [];
  $('#slips-list').innerHTML = '';
  if (slipsDialog.open) slipsDialog.close();
}

function saveBatch() {
  const rows = batchRows().filter((r) => $('.slip-use', r).checked);
  const items = [];
  for (const row of rows) {
    const amount = U.toSatang($('.slip-amount', row).value);
    if (!amount) {
      setRowStatus(row, t('slip.needAmount'), { tone: 'warn' });
      $('.slip-amount', row).focus();
      return;
    }
    const [type, category] = $('.slip-cat', row).value.split(':');
    items.push({
      type,
      category,
      amount,
      title: $('.slip-title', row).value.trim() || U.moneyCategories(type)[category]?.label || t(`type.${type}`),
      dueDate: $('.slip-date', row).value || U.todayISO(),
      ref: batch[Number(row.dataset.i)].ref,
      tags: [],
    });
  }
  if (!items.length) return;
  for (const item of items) store.add(item);
  const total = items.reduce((n, m) => n + (m.type === 'income' ? m.amount : -m.amount), 0);
  closeBatch();
  toast(t('slip.batchSaved', { n: items.length, amount: `${total < 0 ? '−' : '+'}${U.formatMoney(Math.abs(total))}` }));
}

function submitMoneyForm(e) {
  e.preventDefault();
  const f = moneyForm.elements;
  const amount = U.toSatang(f.amount.value);
  if (!amount) {
    $('.amount-error', moneyForm).hidden = false;
    f.amount.focus();
    return;
  }
  const type = f.type.value === 'income' ? 'income' : 'expense';
  const category = moneyForm.querySelector('[name="category"]:checked')?.value || '';
  const data = {
    type,
    category,
    amount,
    // ไม่ใส่ชื่อ = ใช้ชื่อหมวด
    title: f.title.value.trim() || U.moneyCategories(type)[category]?.label || t(`type.${type}`),
    description: f.description.value.trim(),
    dueDate: f.dueDate.value || U.todayISO(),
    tags: f.tags.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean),
    ref: f.ref.value,
  };
  if (state.editingId && store.get(state.editingId)) {
    store.update(state.editingId, data);
    toast(t('toast.saved'));
  } else {
    store.add(data);
    toast(t(`toast.${type}Added`, { amount: U.formatMoney(amount) }));
  }
  closeMoneyDialog();
}

// เพิ่มด่วน: "ข้าวมันไก่ 50 #อาหาร" → ชื่อ, จำนวนเงิน (ตัวเลขตัวสุดท้าย), หมวด (#ชื่อหมวด) และแท็ก
function quickMoney(e) {
  e.preventDefault();
  const input = $('#money-quick-input');
  const raw = input.value.trim();
  if (!raw) return;
  const type = state.quickMoneyType;
  const last = [...raw.matchAll(/(^|\s)฿?(\d[\d,]*(?:\.\d{1,2})?)\s*(?:บาท|฿)?(?=\s|$)/g)].at(-1);
  const amount = last ? U.toSatang(last[2]) : 0;
  if (!amount) {
    toast(t('toast.needAmount'));
    input.focus();
    return;
  }
  const cats = U.moneyCategories(type);
  let category = '';
  const tags = [];
  for (const [, word] of raw.matchAll(/#([^\s#]+)/g)) {
    const hit = Object.entries(cats).find(([k, c]) => [k, c.label].some((x) => x.toLowerCase() === word.toLowerCase()));
    if (hit && !category) category = hit[0];
    else tags.push(word);
  }
  const title = (raw.slice(0, last.index) + last[1] + raw.slice(last.index + last[0].length))
    .replace(/#[^\s#]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  // ไม่ระบุหมวด = อื่นๆ (หมวดสุดท้าย)
  const cat = category || Object.keys(cats).at(-1);
  store.add({ type, category: cat, amount, title: title || cats[cat].label, tags, dueDate: U.todayISO() });
  input.value = '';
  // ให้เห็นรายการที่เพิ่งเพิ่ม
  const now = new Date();
  state.moneyMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  toast(t(`toast.${type}Added`, { amount: U.formatMoney(amount) }));
}

function quickAdd(e) {
  e.preventDefault();
  const input = $('#quick-add-input');
  const raw = input.value.trim();
  if (!raw) return;
  const tags = [...raw.matchAll(/#([^\s#]+)/g)].map((m) => m[1]);
  const title = raw.replace(/#[^\s#]+/g, '').replace(/\s+/g, ' ').trim() || raw;
  const when = $('#quick-when').value;
  state.quickWhen = when;
  const dueDate = when === 'today' ? U.todayISO() : when === 'tomorrow' ? U.toISODate(U.addDays(new Date(), 1)) : null;
  input.value = '';
  store.add({ title, tags, dueDate, priority: 'medium' });
}

function exportJSON() {
  // รวมรายรับรายจ่ายด้วย (store.tasks = ทุกรายการ)
  const data = { app: 'mytodo', version: 1, exportedAt: new Date().toISOString(), tasks: store.tasks };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `mildtask-${U.todayISO()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(t('toast.exported', { n: store.tasks.length }));
}

async function importJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data?.tasks;
    if (!Array.isArray(list)) throw new Error('bad format');
    const valid = list.filter((x) => x && typeof x === 'object' && String(x.title ?? '').trim());
    await store.importMany(valid);
    toast(t('toast.imported', { n: valid.length }));
  } catch {
    toast(t('toast.badFile'));
  }
}

async function signIn() {
  try {
    await store.signIn();
  } catch (err) {
    console.error(err);
    toast(errorMessage(err));
  }
}

function applyTheme(v) {
  if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
  else delete document.documentElement.dataset.theme;
}

function errorMessage(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return t('err.permission');
  if (code === 'auth/unauthorized-domain') return t('err.domain');
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found') return t('err.google');
  if (code === 'auth/network-request-failed' || code === 'unavailable') return t('err.offline');
  if (err?.name === 'QuotaExceededError') return t('err.quota');
  return t('err.generic', { msg: err?.message || err });
}

// ---------- Toast ----------
let toastTimer;
function toast(msg, { action, onAction } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button" class="toast-action">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  const hide = () => {
    el.hidden = true;
  };
  if (action) {
    $('.toast-action', el).addEventListener('click', () => {
      onAction();
      hide();
    });
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hide, action ? 6000 : 3000);
}

// ---------- เมนู ----------
function toggleMenu(open) {
  const menu = $('#menu');
  const next = open ?? menu.hidden;
  menu.hidden = !next;
  $('#menu-btn').setAttribute('aria-expanded', String(next));
}

const isTyping = () => {
  const el = document.activeElement;
  return !!el && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));
};

// ---------- ผูกเหตุการณ์ ----------
const actions = {
  add: () => (state.view === 'money' ? openMoneyDialog() : openTaskDialog()),
  'add-on': (el) => openTaskDialog({ date: el.dataset.date }),
  'add-event-on': (el) => openTaskDialog({ date: el.dataset.date, type: 'event' }),
  edit: (el, id) => {
    const t = store.get(id);
    if (t) U.isMoney(t) ? openMoneyDialog(t) : openTaskDialog({ task: t });
  },
  toggle: (el, id) => toggleTask(id),
  delete: (el, id) => deleteTask(id),
  'delete-from-dialog': () => {
    const id = state.editingId;
    closeDialog();
    deleteTask(id);
  },
  'close-dialog': closeDialog,
  'add-money': (el) => openMoneyDialog(null, el.dataset.type, el.dataset.date),
  'close-money': closeMoneyDialog,
  'slip-pick': () => $('#slip-file').click(),
  'close-slips': closeBatch,
  'save-slips': saveBatch,
  'delete-money': () => {
    const id = state.editingId;
    closeMoneyDialog();
    deleteTask(id);
  },
  'money-month': (el) => {
    const n = Number(el.dataset.n);
    const base = n ? state.moneyMonth : new Date();
    state.moneyMonth = new Date(base.getFullYear(), base.getMonth() + n, 1);
    render();
  },
  'money-cat': (el) => {
    state.moneyCat = state.moneyCat === el.dataset.cat ? '' : el.dataset.cat;
    render();
  },
  'quick-money-type': (el) => {
    state.quickMoneyType = el.dataset.type;
    render();
  },
  'set-status': (el) => {
    state.filter.status = el.dataset.status;
    saveFilter();
    render();
  },
  'goto-list': (el) => {
    state.filter.status = el.dataset.status;
    if (el.dataset.kind) state.filter.kind = el.dataset.kind;
    state.filter.q = '';
    state.filter.tag = '';
    saveFilter();
    setView('list');
  },
  'goto-money': (el) => {
    const now = new Date();
    state.moneyMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    state.moneyCat = el.dataset.cat || '';
    setView('money');
  },
  'goto-calendar': () => {
    state.cal.selected = U.todayISO();
    state.cal.cursor = new Date();
    setView('calendar');
  },
  'select-day': (el) => {
    const d = U.parseISODate(el.dataset.date);
    state.cal.selected = el.dataset.date;
    if (d.getMonth() !== state.cal.cursor.getMonth()) state.cal.cursor = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
  },
  'cal-prev': () => shiftCal(-1),
  'cal-next': () => shiftCal(1),
  'cal-today': () => {
    state.cal.cursor = new Date();
    state.cal.selected = U.todayISO();
    render();
  },
  'cal-mode': (el) => {
    state.cal.mode = el.dataset.mode;
    // ให้สัปดาห์/เดือนที่แสดงตรงกับวันที่เลือกไว้
    state.cal.cursor = U.parseISODate(state.cal.selected);
    savePrefs({ calMode: state.cal.mode });
    render();
  },
  theme: (el) => {
    savePrefs({ theme: el.dataset.themeValue });
    applyTheme(el.dataset.themeValue);
    renderAccount();
  },
  lang: (el) => {
    savePrefs({ lang: el.dataset.langValue });
    setLang(el.dataset.langValue);
    applyI18n();
    render();
  },
  export: () => {
    toggleMenu(false);
    exportJSON();
  },
  import: () => {
    toggleMenu(false);
    $('#import-file').click();
  },
  'sign-in': signIn,
  'sign-out': () => {
    toggleMenu(false);
    store.signOut();
  },
  'dismiss-banner': () => {
    savePrefs({ hideLocalBanner: true });
    renderBanner();
  },
};

function bindEvents() {
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.menu-wrap')) toggleMenu(false);

    const tab = e.target.closest('.tab');
    if (tab) return setView(tab.dataset.view);

    if (e.target.closest('#menu-btn')) return toggleMenu();

    const el = e.target.closest('[data-action]');
    if (!el || !store) return;
    const fn = actions[el.dataset.action];
    if (fn) fn(el, el.closest('[data-id]')?.dataset.id, e);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') toggleMenu(false);
    // เซลล์ปฏิทินเป็น div role=button: รองรับ Enter / Space
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('.cal-cell')) {
      e.preventDefault();
      e.target.click();
    }
    // กด N เพื่อเพิ่มงาน · E เพื่อเพิ่มกิจกรรม
    const key = e.key.toLowerCase();
    if ((key === 'n' || key === 'e') && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping() && !anyDialogOpen()) {
      e.preventDefault();
      openTaskDialog({ type: key === 'e' ? 'event' : 'task' });
    }
  });

  document.addEventListener('submit', (e) => {
    if (e.target.id === 'quick-add') quickAdd(e);
    else if (e.target.id === 'money-quick') quickMoney(e);
  });
  form.addEventListener('submit', submitTaskForm);
  form.elements.title.addEventListener('input', () => {
    $('.field-error', form).hidden = true;
  });
  form.elements.dueDate.addEventListener('input', () => {
    $('.date-error', form).hidden = true;
  });
  form.elements.endTime.addEventListener('input', () => form.elements.endTime.setCustomValidity(''));
  form.addEventListener('change', (e) => {
    if (e.target.name === 'type') syncDialogType();
  });
  // คลิกพื้นหลังเพื่อปิด
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) closeDialog();
  });
  dialog.addEventListener('close', () => {
    state.editingId = null;
  });

  moneyForm.addEventListener('submit', submitMoneyForm);
  moneyForm.elements.amount.addEventListener('input', () => {
    $('.amount-error', moneyForm).hidden = true;
  });
  moneyForm.addEventListener('change', (e) => {
    if (e.target.name === 'type') syncMoneyType();
  });
  moneyDialog.addEventListener('click', (e) => {
    if (e.target === moneyDialog) closeMoneyDialog();
  });
  moneyDialog.addEventListener('close', () => {
    state.editingId = null;
    hideSlip();
  });

  // หน้าการเงิน: วางรูปสลิป (Ctrl+V) หรือลากรูปมาวางเพื่ออ่านได้เลย
  const images = (items) => [...(items || [])].filter((x) => x.type?.startsWith('image/'));
  const canDropSlip = () => state.view === 'money' && store && !(store.mode === 'firebase' && !store.user) && !anyDialogOpen();
  document.addEventListener('paste', (e) => {
    const items = canDropSlip() ? images(e.clipboardData?.items) : [];
    if (!items.length) return;
    e.preventDefault();
    readSlipFiles(items.map((x) => x.getAsFile()));
  });
  document.addEventListener('dragover', (e) => {
    if (canDropSlip() && [...(e.dataTransfer?.types || [])].includes('Files')) e.preventDefault();
  });
  document.addEventListener('drop', (e) => {
    const files = canDropSlip() ? images(e.dataTransfer?.files) : [];
    if (!files.length) return;
    e.preventDefault();
    readSlipFiles(files);
  });

  // หน้าตรวจสลิปหลายรูป
  slipsDialog.addEventListener('close', () => {
    if (batch.length) closeBatch();
  });
  slipsDialog.addEventListener('input', updateBatch);
  slipsDialog.addEventListener('change', updateBatch);

  document.addEventListener('input', (e) => {
    if (e.target.id === 'search-input') {
      state.filter.q = e.target.value;
      $('#list-results').innerHTML = listResultsHTML();
    }
  });
  document.addEventListener('change', (e) => {
    const id = e.target.id;
    if (id === 'sort-select') {
      state.filter.sort = e.target.value;
      saveFilter();
      render();
    } else if (id === 'kind-select') {
      state.filter.kind = e.target.value;
      saveFilter();
      render();
    } else if (id === 'tag-select') {
      state.filter.tag = e.target.value;
      saveFilter();
      render();
    } else if (id === 'quick-when') {
      state.quickWhen = e.target.value;
    } else if (id === 'slip-file') {
      const files = [...(e.target.files || [])];
      e.target.value = '';
      readSlipFiles(files);
    } else if (id === 'import-file') {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) importJSON(file);
    }
  });
}

init();
