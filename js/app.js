import { createStore } from './store.js?v=3';
import * as U from './utils.js?v=3';

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = U.escapeHtml;

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
  dumbbell: '<path d="M6 7v10M18 7v10M3 10v4M21 10v4M6 12h12"/>',
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

const VIEWS = ['dashboard', 'events', 'list', 'calendar', 'fitness'];
const STATUSES = [
  ['pending', 'ค้างอยู่'],
  ['overdue', 'เลยกำหนด'],
  ['done', 'เสร็จแล้ว'],
  ['all', 'ทั้งหมด'],
];
const KINDS = [
  ['all', 'งานและกิจกรรม'],
  ['task', 'เฉพาะงาน'],
  ['event', 'เฉพาะกิจกรรม'],
  ...Object.entries(U.EVENT_CATEGORIES).map(([k, c]) => [`event:${k}`, `กิจกรรม: ${c.label}`]),
];
const SORTS = [
  ['due', 'วันครบกำหนด'],
  ['priority', 'ความสำคัญ'],
  ['created', 'เพิ่มล่าสุด'],
];
const savedFilter = prefs.filter || {};

const state = {
  tasks: [],
  // ตารางออกกำลังกาย (workout/meal) แยกจากงาน เพื่อไม่ให้ไปปนในรายการงาน/ปฏิทิน
  plan: [],
  fitDay: U.todayISO(),
  view: VIEWS.includes(prefs.view) ? prefs.view : 'dashboard',
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
const planDialog = $('#plan-dialog');
const planForm = $('#plan-form');
const anyDialogOpen = () => dialog.open || planDialog.open;

// ---------- เริ่มต้น ----------
async function init() {
  applyTheme(prefs.theme || 'auto');
  bindEvents();
  $('#view').innerHTML = loadingHTML();
  try {
    store = await createStore();
  } catch (err) {
    console.error(err);
    $('#view').innerHTML = `
      <div class="empty">
        ${icon('close')}
        <h2>เชื่อมต่อ Firebase ไม่สำเร็จ</h2>
        <p>ตรวจสอบอินเทอร์เน็ตและค่าใน <code>js/config.js</code> แล้วลองใหม่</p>
        <button class="btn btn-primary" type="button" onclick="location.reload()">ลองใหม่</button>
      </div>`;
    return;
  }
  store.onError = (err) => {
    console.error(err);
    toast(errorMessage(err));
  };
  store.onAuth(() => render());
  store.subscribe((items) => {
    state.tasks = items.filter((t) => !U.isPlan(t));
    state.plan = items.filter(U.isPlan);
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

  el.innerHTML = { dashboard: dashboardView, events: eventsView, list: listView, calendar: calendarView, fitness: fitnessView }[state.view]();

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
             <div class="account-name">${esc(u.displayName || 'ผู้ใช้')}</div>
             <div class="account-sub">${esc(u.email || '')}</div>
           </div>
         </div>
         <div class="sync-note"><i class="dot-online"></i>ซิงก์กับ Firebase</div>
         <button class="menu-item" type="button" data-action="sign-out">ออกจากระบบ</button>`
      : `<div class="menu-label">บัญชี</div><p class="account-sub">ยังไม่ได้เข้าสู่ระบบ</p>`;
  } else {
    el.innerHTML = `<div class="menu-label">โหมดเครื่องนี้</div>
      <p class="account-sub">ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ใส่ค่า Firebase ใน <code>js/config.js</code> เพื่อซิงก์ทุกอุปกรณ์</p>`;
  }
  $$('[data-theme-value]').forEach((b) =>
    b.setAttribute('aria-pressed', String(b.dataset.themeValue === (prefs.theme || 'auto'))),
  );
}

function renderBanner() {
  const show = store.mode === 'local' && !prefs.hideLocalBanner;
  $('#banner').innerHTML = show
    ? `<div class="banner">
         <span><b>โหมดเครื่องนี้</b> — ข้อมูลเก็บในเบราว์เซอร์นี้เท่านั้น ตั้งค่า Firebase ใน <code>js/config.js</code> เพื่อซิงก์ทุกอุปกรณ์</span>
         <button class="icon-btn" type="button" data-action="dismiss-banner" aria-label="ปิดข้อความ">${icon('close')}</button>
       </div>`
    : '';
}

const loadingHTML = () => `<div class="loading"><span class="spinner"></span>กำลังโหลด…</div>`;

function loginHTML() {
  return `
    <div class="login-card">
      <span class="brand-mark big" aria-hidden="true"><svg viewBox="0 0 24 24">${ICONS.check}</svg></span>
      <h1>MildTask</h1>
      <p>จัดการงาน ตารางงาน และ To-do list ของคุณ<br />เข้าสู่ระบบเพื่อซิงก์ข้อมูลทุกอุปกรณ์</p>
      <button class="btn btn-google" type="button" data-action="sign-in">
        <svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
        เข้าสู่ระบบด้วย Google
      </button>
    </div>`;
}

function emptyHTML(title, text, withAdd = true) {
  return `
    <div class="empty">
      ${icon('inbox')}
      <h2>${title}</h2>
      <p>${text}</p>
      ${withAdd ? `<button class="btn btn-primary" type="button" data-action="add">${icon('plus')}เพิ่มงานแรก</button>` : ''}
    </div>`;
}

// ---------- ส่วนประกอบรายการงาน ----------
function taskItemHTML(t, { showDate = true } = {}) {
  const event = U.isEvent(t);
  const overdue = U.isOverdue(t);
  const meta = [];
  if (event) meta.push(`<span class="kind-badge">${U.EVENT_CATEGORIES[t.category].label}</span>`);
  if (U.isOngoingEvent(t)) meta.push('<span class="now-badge">กำลังดำเนินอยู่</span>');
  const time = event ? U.timeRange(t) || (showDate ? '' : 'ทั้งวัน') : t.dueTime;
  if (t.dueDate && (showDate || time)) {
    const label = [showDate ? U.relativeDateLabel(t.dueDate) : '', time].filter(Boolean).join(' · ');
    meta.push(`<span class="meta${overdue ? ' is-overdue' : ''}">${icon(showDate ? 'calendar' : 'clock')}${label}</span>`);
  }
  if (t.location) meta.push(`<span class="meta">${icon('pin')}${esc(t.location)}</span>`);
  if (!event && t.priority !== 'medium') {
    meta.push(`<span class="prio-badge prio-${t.priority}">${U.PRIORITIES[t.priority].label}</span>`);
  }
  if (t.description) meta.push(`<span class="meta" title="มีรายละเอียด">${icon('note')}</span>`);
  for (const tag of t.tags) meta.push(`<span class="tag">#${esc(tag)}</span>`);

  const lead = event
    ? `<span class="event-mark" aria-hidden="true">${icon('calendar')}</span>`
    : `<button class="check" type="button" data-action="toggle" aria-pressed="${t.done}"
        aria-label="${t.done ? 'ทำเครื่องหมายว่ายังไม่เสร็จ' : 'ทำเครื่องหมายว่าเสร็จแล้ว'}">${icon('check')}</button>`;
  const cls = event ? `is-event cat-${t.category}${U.isPastEvent(t) ? ' is-past' : ''}` : `prio-${t.priority}${t.done ? ' is-done' : ''}`;
  return `
    <li class="task ${cls}" data-id="${esc(t.id)}">
      ${lead}
      <button class="task-main" type="button" data-action="edit">
        <span class="task-title">${esc(t.title)}</span>
        ${meta.length ? `<span class="task-meta">${meta.join('')}</span>` : ''}
      </button>
      <button class="icon-btn task-del" type="button" data-action="delete" aria-label="ลบ">${icon('trash')}</button>
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
      ${limit && list.length > limit ? `<button class="link-btn" type="button" data-action="goto-list" data-status="${more.status || 'pending'}" data-kind="${more.kind || 'all'}">ดูทั้งหมด ${list.length} รายการ</button>` : ''}
    </section>`;
}

function dashboardView() {
  const now = new Date();
  const hour = now.getHours();
  const greeting = hour < 12 ? 'สวัสดีตอนเช้า' : hour < 17 ? 'สวัสดีตอนบ่าย' : 'สวัสดีตอนเย็น';
  const head = `
    <div class="page-head">
      <p class="eyebrow">${U.F.full.format(now)}</p>
      <h1>${greeting}</h1>
    </div>`;

  const items = state.tasks;
  if (!items.length) return head + emptyHTML('ยังไม่มีงาน', 'เริ่มจากเพิ่มงานหรือกิจกรรมแรกของคุณ แล้วจัดตารางได้ในหน้า "ตารางงาน"');

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
        <span class="stat-label">งานวันนี้</span>
        <span class="stat-value">${todayTasks.length - todayDone}</span>
        <span class="stat-sub">เสร็จแล้ว ${todayDone} จาก ${todayTasks.length}${todayEvents ? ` · กิจกรรม ${todayEvents}` : ''}</span>
      </button>
      <button class="stat${overdue.length ? ' stat-danger' : ''}" type="button" data-action="goto-list" data-status="overdue" data-kind="task">
        <span class="stat-label">เลยกำหนด</span>
        <span class="stat-value">${overdue.length}</span>
        <span class="stat-sub">${overdue.length ? 'ควรจัดการก่อน' : 'ไม่มีงานค้างเกินกำหนด'}</span>
      </button>
      <button class="stat" type="button" data-action="goto-list" data-status="pending" data-kind="task">
        <span class="stat-label">งานค้างทั้งหมด</span>
        <span class="stat-value">${pending.length}</span>
        <span class="stat-sub">7 วันข้างหน้า ${upcomingTasks} งาน</span>
      </button>
      <button class="stat" type="button" data-action="goto-list" data-status="done" data-kind="task">
        <span class="stat-label">ความคืบหน้า</span>
        <span class="stat-value">${pct}%</span>
        <span class="progress" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></span>
        <span class="stat-sub">เสร็จ ${doneCount} จาก ${tasks.length} งาน</span>
      </button>
    </section>
    <div class="dash-grid">
      ${overdue.length ? panel('เลยกำหนด', overdue, { tone: 'danger' }) : ''}
      ${panel('วันนี้', todayList, { empty: 'ไม่มีงานหรือกิจกรรมวันนี้', showDate: false })}
      ${panel('7 วันข้างหน้า', upcoming, { empty: 'ยังไม่มีงานหรือกิจกรรมในสัปดาห์นี้' })}
      ${noDate.length ? panel('ไม่มีกำหนด', noDate, { limit: 5, more: { kind: 'task' } }) : ''}
    </div>`;
}

// ---------- มุมมอง: กิจกรรม ----------
function eventsView() {
  return `
    <div class="page-head">
      <p class="eyebrow">${U.F.full.format(new Date())}</p>
      <h1>กิจกรรม</h1>
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
        <h2>ยังไม่มีกิจกรรม</h2>
        <p>เพิ่มประชุม นัดหมาย หรือกิจกรรมอื่นๆ แล้วดูสรุปได้ที่นี่</p>
        <button class="btn btn-primary" type="button" data-action="add-event-on" data-date="${U.todayISO()}">${icon('plus')}เพิ่มกิจกรรม</button>
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
        <span class="stat-label">กิจกรรมวันนี้</span>
        <span class="stat-value">${todayLeft}</span>
        <span class="stat-sub">${todayList.length ? `เหลืออีก ${todayLeft} จาก ${todayList.length}` : 'วันนี้ว่าง'}</span>
      </button>
      ${
        next
          ? `<button class="stat stat-event cat-${next.category}" type="button" data-action="edit" data-id="${esc(next.id)}">
               <span class="stat-label">ถัดไป · ${U.EVENT_CATEGORIES[next.category].label}</span>
               <span class="stat-text" title="${esc(next.title)}">${esc(next.title)}</span>
               <span class="stat-sub">${esc(U.eventWhenLabel(next))}${next.location ? ` · ${esc(next.location)}` : ''}</span>
             </button>`
          : `<div class="stat"><span class="stat-label">ถัดไป</span><span class="stat-text">—</span><span class="stat-sub">ไม่มีกิจกรรมที่กำลังจะมาถึง</span></div>`
      }
      <button class="stat stat-event cat-meeting" type="button" data-action="goto-list" data-status="pending" data-kind="event:meeting">
        <span class="stat-label">ประชุมที่ต้องเข้า</span>
        <span class="stat-value">${meetings7.length}</span>
        <span class="stat-sub">ใน 7 วัน · วันนี้ ${meetingsToday}</span>
      </button>
      <button class="stat" type="button" data-action="goto-list" data-status="pending" data-kind="event">
        <span class="stat-label">กิจกรรมที่จะมาถึง</span>
        <span class="stat-value">${upcoming.length}</span>
        <span class="stat-sub">7 วันข้างหน้า ${next7.length} รายการ</span>
      </button>
    </section>
    <div class="dash-grid">
      ${panelHTML('ประชุมที่ต้องเข้า', meetings, { empty: 'ไม่มีประชุมที่กำลังจะมาถึง', limit: 6, more: { kind: 'event:meeting' } })}
      ${panelHTML('วันนี้', todayList, { empty: 'ไม่มีกิจกรรมวันนี้', showDate: false })}
      ${panelHTML('7 วันข้างหน้า', week, { empty: 'ยังไม่มีกิจกรรมในสัปดาห์นี้', limit: 8, more: { kind: 'event' } })}
      <section class="panel">
        <header class="panel-head"><h2>ตามประเภท · 7 วันข้างหน้า</h2><span class="count">${next7.length}</span></header>
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
  if (U.isFinished(t) && state.filter.status === 'all') return ['done', 'เสร็จแล้ว / ผ่านไปแล้ว'];
  if (U.isOverdue(t)) return ['overdue', 'เลยกำหนด'];
  if (!t.dueDate) return ['none', 'ไม่มีกำหนด'];
  return [t.dueDate, `${U.relativeDateLabel(t.dueDate)} · ${U.F.weekdayLong.format(U.parseISODate(t.dueDate))}`];
}

function listResultsHTML() {
  if (!state.tasks.length) return emptyHTML('ยังไม่มีงาน', 'พิมพ์ในช่องด้านบนแล้วกด Enter เพื่อเพิ่มงานได้ทันที', false);
  const list = filteredTasks();
  if (!list.length) return emptyHTML('ไม่พบรายการ', 'ลองเปลี่ยนตัวกรองหรือคำค้นหา', false);
  if (state.filter.sort !== 'due') return taskListHTML(list);

  let html = '';
  let current = null;
  for (const t of list) {
    const [key, label] = groupOf(t);
    if (key !== current) {
      if (current !== null) html += '</ul></section>';
      html += `<section class="group${key === 'overdue' ? ' group-danger' : ''}"><h3 class="group-title">${esc(label)}</h3><ul class="task-list">`;
      current = key;
    }
    html += taskItemHTML(t, { showDate: key === 'overdue' || key === 'done' });
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
    <div class="page-head"><h1>รายการงาน</h1></div>
    <form class="quick-add" id="quick-add" autocomplete="off">
      ${icon('plus')}
      <input id="quick-add-input" name="title" maxlength="200" placeholder="เพิ่มงานด่วน… ใส่ #แท็ก ได้ แล้วกด Enter" aria-label="ชื่องานใหม่" />
      <select id="quick-when" name="when" aria-label="วันครบกำหนด">
        ${opt('', 'ไม่มีกำหนด', state.quickWhen)}${opt('today', 'วันนี้', state.quickWhen)}${opt('tomorrow', 'พรุ่งนี้', state.quickWhen)}
      </select>
      <button class="btn btn-primary" type="submit">เพิ่ม</button>
    </form>
    <div class="toolbar">
      <label class="search">${icon('search')}<input id="search-input" type="search" placeholder="ค้นหา" value="${esc(f.q)}" aria-label="ค้นหางานและกิจกรรม" /></label>
      <div class="segmented" role="group" aria-label="สถานะ">
        ${STATUSES.map(([v, l]) => `<button type="button" data-action="set-status" data-status="${v}" aria-pressed="${f.status === v}">${l}<span class="seg-count">${counts[v]}</span></button>`).join('')}
      </div>
      <div class="selects">
        <select id="kind-select" aria-label="ประเภท">${KINDS.map(([v, l]) => opt(v, l, f.kind)).join('')}</select>
        <select id="sort-select" aria-label="เรียงตาม">${SORTS.map(([v, l]) => opt(v, `เรียง: ${l}`, f.sort)).join('')}</select>
        <select id="tag-select" aria-label="กรองตามแท็ก">${opt('', 'ทุกแท็ก', f.tag)}${tags.map((t) => opt(t, `#${t}`, f.tag)).join('')}</select>
      </div>
    </div>
    <div id="list-results">${listResultsHTML()}</div>`;
}

// ---------- มุมมอง: ตารางงาน ----------
function tasksByDate() {
  const map = new Map();
  for (const t of state.tasks) {
    if (!t.dueDate) continue;
    if (!map.has(t.dueDate)) map.set(t.dueDate, []);
    map.get(t.dueDate).push(t);
  }
  for (const list of map.values()) list.sort(U.compareByDue);
  return map;
}

function calendarView() {
  const { mode, cursor } = state.cal;
  const byDate = tasksByDate();
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
          <button class="icon-btn" type="button" data-action="cal-prev" aria-label="ก่อนหน้า">${icon('left')}</button>
          <button class="btn btn-sm" type="button" data-action="cal-today">วันนี้</button>
          <button class="icon-btn" type="button" data-action="cal-next" aria-label="ถัดไป">${icon('right')}</button>
        </div>
        <div class="segmented" role="group" aria-label="รูปแบบ">
          <button type="button" data-action="cal-mode" data-mode="month" aria-pressed="${mode === 'month'}">เดือน</button>
          <button type="button" data-action="cal-mode" data-mode="week" aria-pressed="${mode === 'week'}">สัปดาห์</button>
        </div>
      </div>
    </div>
    ${mode === 'month' ? monthHTML(byDate) : weekHTML(byDate)}`;
}

function monthHTML(byDate) {
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
    const cls = [
      'cal-cell',
      d.getMonth() !== cursor.getMonth() && 'is-outside',
      iso === today && 'is-today',
      iso === selected && 'is-selected',
    ].filter(Boolean).join(' ');
    const chips = list
      .slice(0, 3)
      .map(
        (t) => `<button type="button" class="chip ${chipClass(t)}" data-action="edit" data-id="${esc(t.id)}" title="${esc(t.title)}">${t.dueTime ? `<b>${t.dueTime}</b> ` : ''}${esc(t.title)}</button>`,
      )
      .join('');
    const dots = list
      .slice(0, 4)
      .map((t) => `<i class="dot ${chipClass(t)}"></i>`)
      .join('');
    cells += `
      <div class="${cls}" role="button" tabindex="0" data-action="select-day" data-date="${iso}"
        aria-label="${U.F.full.format(d)}${list.length ? ` มี ${list.length} รายการ` : ''}">
        <span class="cal-num">${d.getDate()}</span>
        <div class="cal-chips">${chips}${list.length > 3 ? `<span class="more">+${list.length - 3} รายการ</span>` : ''}</div>
        <div class="cal-dots">${dots}</div>
      </div>`;
  }

  const selList = byDate.get(selected) || [];
  return `
    <div class="month">
      <div class="cal-weekdays">${U.WEEKDAYS.map((w) => `<span>${w}</span>`).join('')}</div>
      <div class="cal-grid">${cells}</div>
    </div>
    <section class="panel day-panel">
      <header class="panel-head">
        <h2>${U.relativeDateLabel(selected) === 'วันนี้' ? 'วันนี้ · ' : ''}${U.F.full.format(U.parseISODate(selected))}</h2>
        <div class="panel-actions">
          <button class="btn btn-sm" type="button" data-action="add-on" data-date="${selected}">${icon('plus')}งาน</button>
          <button class="btn btn-sm" type="button" data-action="add-event-on" data-date="${selected}">${icon('plus')}กิจกรรม</button>
        </div>
      </header>
      ${selList.length ? taskListHTML(selList, { showDate: false }) : '<p class="panel-empty">ไม่มีงานหรือกิจกรรมในวันนี้</p>'}
    </section>`;
}

const chipClass = (t) =>
  U.isEvent(t)
    ? `is-event cat-${t.category}${U.isPastEvent(t) ? ' is-done' : ''}`
    : `prio-${t.priority}${t.done ? ' is-done' : ''}${U.isOverdue(t) ? ' is-overdue' : ''}`;

function weekHTML(byDate) {
  const start = U.startOfWeek(state.cal.cursor);
  const today = U.todayISO();
  let cols = '';
  for (let i = 0; i < 7; i++) {
    const d = U.addDays(start, i);
    const iso = U.toISODate(d);
    const list = byDate.get(iso) || [];
    cols += `
      <section class="week-col${iso === today ? ' is-today' : ''}">
        <header class="week-head">
          <span class="wd">${U.WEEKDAYS[i]}</span>
          <span class="wn">${d.getDate()}</span>
          <span class="wc">${list.length ? `${list.length} รายการ` : ''}</span>
        </header>
        ${list.length ? taskListHTML(list, { showDate: false }) : ''}
        <div class="add-slots">
          <button class="add-slot" type="button" data-action="add-on" data-date="${iso}" aria-label="เพิ่มงาน">${icon('plus')}งาน</button>
          <button class="add-slot" type="button" data-action="add-event-on" data-date="${iso}" aria-label="เพิ่มกิจกรรม">${icon('plus')}กิจกรรม</button>
        </div>
      </section>`;
  }
  return `<div class="week">${cols}</div>`;
}

// ---------- มุมมอง: ออกกำลังกาย ----------
const planOn = (iso, type) => state.plan.filter((t) => (!type || t.type === type) && U.onDay(t, iso)).sort(U.comparePlan);
const doneCount = (list, iso) => list.filter((t) => U.isDoneOn(t, iso)).length;

// จำนวนวันติดกันที่ออกกำลังกายครบตามตาราง (วันพักไม่ตัดสถิติ · วันนี้ยังไม่ครบก็ยังไม่ตัด)
function workoutStreak() {
  const workouts = state.plan.filter((t) => t.type === 'workout');
  let streak = 0;
  for (let i = 0; i < 400 && workouts.length; i++) {
    const d = U.addDays(new Date(), -i);
    const iso = U.toISODate(d);
    const dayEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
    const due = workouts.filter((t) => t.createdAt < dayEnd && U.onDay(t, iso));
    if (!due.length) continue;
    if (due.every((t) => U.isDoneOn(t, iso))) streak++;
    else if (i > 0) break;
  }
  return streak;
}

function planItemHTML(t, iso) {
  const done = U.isDoneOn(t, iso);
  const meta = [];
  if (t.type === 'meal') meta.push(`<span class="kind-badge">${U.MEALS[t.category].label}</span>`);
  if (t.dueTime) meta.push(`<span class="meta">${icon('clock')}${t.dueTime}</span>`);
  meta.push(`<span class="meta">${icon('calendar')}${U.daysLabel(t.days)}</span>`);
  if (t.description) meta.push(`<span class="meta plan-detail">${esc(t.description)}</span>`);
  return `
    <li class="task plan-${t.type}${done ? ' is-done' : ''}" data-id="${esc(t.id)}">
      <button class="check" type="button" data-action="toggle" aria-pressed="${done}"
        aria-label="${done ? 'ทำเครื่องหมายว่ายังไม่ได้ทำ' : 'ทำเครื่องหมายว่าทำแล้ว'}">${icon('check')}</button>
      <button class="task-main" type="button" data-action="edit">
        <span class="task-title">${esc(t.title)}</span>
        <span class="task-meta">${meta.join('')}</span>
      </button>
      <button class="icon-btn task-del" type="button" data-action="delete" aria-label="ลบ">${icon('trash')}</button>
    </li>`;
}

function planPanelHTML(title, type, list, iso, empty) {
  return `
    <section class="panel">
      <header class="panel-head">
        <h2>${title}</h2>
        <span class="count">${doneCount(list, iso)}/${list.length}</span>
        <button class="btn btn-sm" type="button" data-action="add-plan" data-type="${type}">${icon('plus')}เพิ่ม</button>
      </header>
      ${list.length ? `<ul class="task-list">${list.map((t) => planItemHTML(t, iso)).join('')}</ul>` : `<p class="panel-empty">${empty}</p>`}
    </section>`;
}

function fitnessView() {
  const day = state.fitDay;
  const today = U.todayISO();
  const start = U.startOfWeek(U.parseISODate(day));
  const head = `
    <div class="cal-head">
      <div>
        <p class="eyebrow">${U.F.dayMonth.format(start)} – ${U.F.dayMonthYear.format(U.addDays(start, 6))}</p>
        <h1 class="cal-title">ออกกำลังกาย</h1>
      </div>
      <div class="cal-nav">
        <button class="icon-btn" type="button" data-action="fit-shift" data-days="-7" aria-label="สัปดาห์ก่อน">${icon('left')}</button>
        <button class="btn btn-sm" type="button" data-action="fit-day" data-date="${today}">วันนี้</button>
        <button class="icon-btn" type="button" data-action="fit-shift" data-days="7" aria-label="สัปดาห์ถัดไป">${icon('right')}</button>
      </div>
    </div>`;

  if (!state.plan.length) {
    return `${head}
      <div class="empty">
        ${icon('dumbbell')}
        <h2>ยังไม่มีตารางออกกำลังกาย</h2>
        <p>เพิ่มสิ่งที่ต้องทำและสิ่งที่ต้องกินของแต่ละวัน แล้วติ๊กเมื่อทำแล้ว</p>
        <div class="panel-actions">
          <button class="btn btn-primary" type="button" data-action="add-plan" data-type="workout">${icon('plus')}สิ่งที่ต้องทำ</button>
          <button class="btn" type="button" data-action="add-plan" data-type="meal">${icon('plus')}สิ่งที่ต้องกิน</button>
        </div>
      </div>`;
  }

  let weekTotal = 0;
  let weekDone = 0;
  const pills = [];
  for (let i = 0; i < 7; i++) {
    const d = U.addDays(start, i);
    const iso = U.toISODate(d);
    const list = planOn(iso);
    const n = doneCount(list, iso);
    weekTotal += list.length;
    weekDone += n;
    const complete = list.length && n === list.length;
    pills.push(`
      <button class="day-pill${iso === today ? ' is-today' : ''}" type="button" data-action="fit-day" data-date="${iso}"
        aria-pressed="${iso === day}" aria-label="${U.F.full.format(d)} ทำแล้ว ${n} จาก ${list.length}">
        <span class="wd">${U.WEEKDAYS[i]}</span>
        <span class="wn">${d.getDate()}</span>
        <span class="wc${complete ? ' is-complete' : ''}">${complete ? '✓' : list.length ? `${n}/${list.length}` : ''}</span>
      </button>`);
  }

  const workouts = planOn(day, 'workout');
  const meals = planOn(day, 'meal');
  const dayLabel = day === today ? 'วันนี้' : U.F.weekdayLong.format(U.parseISODate(day));
  const pct = (n, total) => (total ? Math.round((n / total) * 100) : 0);
  const stat = (label, n, total, sub) => `
    <div class="stat">
      <span class="stat-label">${label}</span>
      <span class="stat-value">${n}/${total}</span>
      <span class="progress" role="progressbar" aria-valuenow="${pct(n, total)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct(n, total)}%"></span></span>
      <span class="stat-sub">${sub}</span>
    </div>`;
  const streak = workoutStreak();

  return `
    ${head}
    <div class="day-strip">${pills.join('')}</div>
    <section class="stats">
      ${stat(`ออกกำลังกาย · ${dayLabel}`, doneCount(workouts, day), workouts.length, workouts.length ? 'รายการที่ทำแล้ว' : 'วันพัก')}
      ${stat(`อาหาร · ${dayLabel}`, doneCount(meals, day), meals.length, 'มื้อที่กินแล้ว')}
      ${stat('สัปดาห์นี้', weekDone, weekTotal, `ทำแล้ว ${pct(weekDone, weekTotal)}%`)}
      <div class="stat">
        <span class="stat-label">ทำครบต่อเนื่อง</span>
        <span class="stat-value">${streak} วัน</span>
        <span class="stat-sub">${streak ? 'ออกกำลังกายครบตามตาราง' : 'ติ๊กให้ครบเพื่อเริ่มนับ'}</span>
      </div>
    </section>
    <div class="dash-grid">
      ${planPanelHTML('สิ่งที่ต้องทำ', 'workout', workouts, day, 'ไม่มีตารางออกกำลังกายในวันนี้ (วันพัก)')}
      ${planPanelHTML('สิ่งที่ต้องกิน', 'meal', meals, day, 'ยังไม่มีรายการอาหารของวันนี้')}
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
  if (!t || U.isEvent(t)) return;
  if (U.isPlan(t)) {
    // รายการในตาราง: ติ๊กแยกเป็นรายวัน ตามวันที่กำลังดูอยู่
    const iso = state.fitDay;
    store.update(id, { doneDates: U.isDoneOn(t, iso) ? t.doneDates.filter((d) => d !== iso) : [...t.doneDates, iso] });
  } else {
    store.update(id, { done: !t.done });
  }
}

function deleteTask(id) {
  const t = store.get(id);
  if (!t) return;
  store.remove(id);
  toast(`ลบ "${t.title}" แล้ว`, { action: 'เลิกทำ', onAction: () => store.put(t) });
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
  $('#task-dialog-title').textContent = `${state.editingId ? 'แก้ไข' : 'เพิ่ม'}${event ? 'กิจกรรม' : 'งาน'}`;
  f.title.placeholder = event ? 'เช่น ประชุมทีม, นัดหมอ' : 'ต้องทำอะไร?';
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
  f.endTime.setCustomValidity(endTime && endTime <= dueTime ? 'เวลาสิ้นสุดต้องหลังเวลาเริ่ม' : '');
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
    toast('บันทึกการแก้ไขแล้ว');
  } else {
    store.add(data);
    toast(event ? 'เพิ่มกิจกรรมแล้ว' : 'เพิ่มงานแล้ว');
  }
  closeDialog();
}

// ---------- ฟอร์มตารางออกกำลังกาย ----------
function openPlanDialog(item = null, type = 'workout') {
  if (!store || (store.mode === 'firebase' && !store.user)) return;
  toggleMenu(false);
  state.editingId = item?.id || null;
  const f = planForm.elements;
  planForm.reset();
  planForm.classList.toggle('is-edit', !!item);
  f.type.value = item?.type || type;
  f.title.value = item?.title || '';
  f.description.value = item?.description || '';
  f.dueTime.value = item?.dueTime || '';
  const hour = new Date().getHours();
  f.meal.value = item?.type === 'meal' ? item.category : hour < 10 ? 'breakfast' : hour < 14 ? 'lunch' : hour < 17 ? 'snack' : 'dinner';
  const days = item?.days || [];
  for (const box of f.days) box.checked = days.includes(Number(box.value));
  $('.field-error', planForm).hidden = true;
  syncPlanType();
  planDialog.showModal();
  if (!item) f.title.focus();
}

function syncPlanType() {
  const f = planForm.elements;
  const meal = f.type.value === 'meal';
  planForm.dataset.type = meal ? 'meal' : 'workout';
  $('#plan-dialog-title').textContent = `${state.editingId ? 'แก้ไข' : 'เพิ่ม'}${meal ? 'สิ่งที่ต้องกิน' : 'สิ่งที่ต้องทำ'}`;
  f.title.placeholder = meal ? 'เช่น อกไก่ + ข้าวกล้อง, โปรตีนเชค' : 'เช่น วิ่ง 30 นาที, วิดพื้น, แพลงก์';
  f.description.placeholder = meal ? 'ปริมาณ แคลอรี่ หรือโน้ต (ไม่ใส่ก็ได้)' : 'เช่น 3 เซ็ต × 12 ครั้ง (ไม่ใส่ก็ได้)';
}

function closePlanDialog() {
  if (planDialog.open) planDialog.close();
  state.editingId = null;
}

function submitPlanForm(e) {
  e.preventDefault();
  const f = planForm.elements;
  const title = f.title.value.trim();
  if (!title) {
    $('.field-error', planForm).hidden = false;
    f.title.focus();
    return;
  }
  const type = f.type.value === 'meal' ? 'meal' : 'workout';
  const data = {
    type,
    category: type === 'meal' ? f.meal.value : '',
    title,
    description: f.description.value.trim(),
    dueTime: f.dueTime.value,
    days: [...f.days].filter((b) => b.checked).map((b) => Number(b.value)),
  };
  if (state.editingId && store.get(state.editingId)) {
    store.update(state.editingId, data);
    toast('บันทึกการแก้ไขแล้ว');
  } else {
    store.add(data);
    toast('เพิ่มลงตารางแล้ว');
  }
  closePlanDialog();
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
  // รวมตารางออกกำลังกายด้วย (store.tasks = ทุกรายการ)
  const data = { app: 'mytodo', version: 1, exportedAt: new Date().toISOString(), tasks: store.tasks };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: `mildtask-${U.todayISO()}.json` });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  toast(`ส่งออก ${store.tasks.length} รายการแล้ว`);
}

async function importJSON(file) {
  try {
    const data = JSON.parse(await file.text());
    const list = Array.isArray(data) ? data : data?.tasks;
    if (!Array.isArray(list)) throw new Error('bad format');
    const valid = list.filter((t) => t && typeof t === 'object' && String(t.title ?? '').trim());
    await store.importMany(valid);
    toast(`นำเข้า ${valid.length} รายการแล้ว`);
  } catch {
    toast('ไฟล์ไม่ถูกต้อง — ต้องเป็นไฟล์ JSON ที่ส่งออกจาก MildTask');
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
  if (code.includes('permission-denied')) return 'ไม่มีสิทธิ์เข้าถึงข้อมูล — ตรวจสอบ Firestore Security Rules';
  if (code === 'auth/unauthorized-domain')
    return 'โดเมนนี้ยังไม่ได้รับอนุญาต — เพิ่มใน Firebase › Authentication › Settings › Authorized domains';
  if (code === 'auth/operation-not-allowed' || code === 'auth/configuration-not-found')
    return 'ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google ใน Firebase Authentication';
  if (code === 'auth/network-request-failed' || code === 'unavailable')
    return 'เชื่อมต่ออินเทอร์เน็ตไม่ได้ — ข้อมูลจะซิงก์เมื่อกลับมาออนไลน์';
  if (err?.name === 'QuotaExceededError') return 'พื้นที่เก็บข้อมูลในเบราว์เซอร์เต็ม';
  return `เกิดข้อผิดพลาด: ${err?.message || err}`;
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
  add: () => (state.view === 'fitness' ? openPlanDialog() : openTaskDialog()),
  'add-on': (el) => openTaskDialog({ date: el.dataset.date }),
  'add-event-on': (el) => openTaskDialog({ date: el.dataset.date, type: 'event' }),
  edit: (el, id) => {
    const t = store.get(id);
    if (t) U.isPlan(t) ? openPlanDialog(t) : openTaskDialog({ task: t });
  },
  toggle: (el, id) => toggleTask(id),
  delete: (el, id) => deleteTask(id),
  'delete-from-dialog': () => {
    const id = state.editingId;
    closeDialog();
    deleteTask(id);
  },
  'close-dialog': closeDialog,
  'add-plan': (el) => openPlanDialog(null, el.dataset.type),
  'close-plan': closePlanDialog,
  'delete-plan': () => {
    const id = state.editingId;
    closePlanDialog();
    deleteTask(id);
  },
  'fit-day': (el) => {
    state.fitDay = el.dataset.date;
    render();
  },
  'fit-shift': (el) => {
    state.fitDay = U.toISODate(U.addDays(U.parseISODate(state.fitDay), Number(el.dataset.days)));
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

  planForm.addEventListener('submit', submitPlanForm);
  planForm.elements.title.addEventListener('input', () => {
    $('.field-error', planForm).hidden = true;
  });
  planForm.addEventListener('change', (e) => {
    if (e.target.name === 'type') syncPlanType();
  });
  planDialog.addEventListener('click', (e) => {
    if (e.target === planDialog) closePlanDialog();
  });
  planDialog.addEventListener('close', () => {
    state.editingId = null;
  });

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
    } else if (id === 'import-file') {
      const file = e.target.files?.[0];
      e.target.value = '';
      if (file) importJSON(file);
    }
  });
}

init();
