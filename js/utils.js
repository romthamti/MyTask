import { t, locale } from './i18n.js?v=6';

// ---------- วันที่ ----------
export const pad = (n) => String(n).padStart(2, '0');
export const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISODate = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const todayISO = () => toISODate(new Date());
export const nowHHMM = () => {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
export const addDays = (date, n) => {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
};
// สัปดาห์เริ่มวันอาทิตย์ ตามปฏิทินไทยทั่วไป
export const startOfWeek = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - d.getDay());
  return d;
};
export const diffDays = (a, b) => Math.round((parseISODate(a) - parseISODate(b)) / 86400000);

const FORMATS = {
  dayMonth: { day: 'numeric', month: 'short' },
  dayMonthYear: { day: 'numeric', month: 'short', year: 'numeric' },
  full: { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' },
  monthYear: { month: 'long', year: 'numeric' },
  weekdayLong: { weekday: 'long' },
};
// สร้างตัวจัดรูปแบบตามภาษาที่เลือกอยู่ (เก็บไว้ใช้ซ้ำ)
const formatters = new Map();
export const F = Object.fromEntries(
  Object.entries(FORMATS).map(([name, opts]) => [
    name,
    {
      format(d) {
        const key = `${locale()}|${name}`;
        if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(locale(), opts));
        return formatters.get(key).format(d);
      },
    },
  ]),
);

// ตัวย่อมาตรฐาน (Intl ของแต่ละเบราว์เซอร์ให้ความยาวไม่เท่ากัน) · 0 = อาทิตย์
export const weekdayShort = (d) => t('wd')[d];

export function relativeDateLabel(iso) {
  const diff = diffDays(iso, todayISO());
  if (diff === 0) return t('today');
  if (diff === 1) return t('tomorrow');
  if (diff === -1) return t('yesterday');
  const d = parseISODate(iso);
  return (d.getFullYear() === new Date().getFullYear() ? F.dayMonth : F.dayMonthYear).format(d);
}

// ---------- ทั่วไป ----------
export const escapeHtml = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const uid = () =>
  globalThis.crypto?.randomUUID
    ? crypto.randomUUID().replace(/-/g, '').slice(0, 20)
    : Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

// ---------- งาน ----------
// label เป็น getter เพื่อให้ได้ข้อความตามภาษาที่เลือกอยู่
const labelled = (prefix, entries) =>
  Object.fromEntries(
    Object.entries(entries).map(([k, v]) => [k, { ...v, get label() { return t(`${prefix}.${k}`); } }]),
  );

export const PRIORITIES = labelled('prio', {
  high: { rank: 0 },
  medium: { rank: 1 },
  low: { rank: 2 },
});

// ประเภทของกิจกรรม (สีอยู่ใน css: --cat-<key>)
export const EVENT_CATEGORIES = labelled('cat', {
  meeting: {},
  appointment: {},
  personal: {},
  travel: {},
  other: {},
});

// รายรับรายจ่าย: amount เก็บเป็นสตางค์ (จำนวนเต็ม) เพื่อไม่ให้ทศนิยมเพี้ยนตอนรวมยอด
// expense = รายจ่าย · income = รายรับ · saving = เงินออม (ไม่นับเป็นรายจ่าย แต่หักออกจากคงเหลือ)
export const MONEY_TYPES = ['expense', 'income', 'saving'];
export const EXPENSE_CATEGORIES = labelled('mcat', {
  food: {},
  transport: {},
  shopping: {},
  bills: {},
  health: {},
  fun: {},
  other: {},
});
export const INCOME_CATEGORIES = labelled('mcat', {
  salary: {},
  bonus: {},
  sales: {},
  otherIncome: {},
});
export const SAVING_CATEGORIES = labelled('mcat', {
  reserve: {},
  emergency: {},
  invest: {},
});
const CATEGORIES_BY_TYPE = { expense: EXPENSE_CATEGORIES, income: INCOME_CATEGORIES, saving: SAVING_CATEGORIES };
export const moneyCategories = (type) => CATEGORIES_BY_TYPE[type] || EXPENSE_CATEGORIES;
export const defaultMoneyCategory = (type) => ({ income: 'otherIncome', saving: 'reserve' })[type] || 'other';
export const moneyCategoryLabel = (key) =>
  (EXPENSE_CATEGORIES[key] || INCOME_CATEGORIES[key] || SAVING_CATEGORIES[key])?.label || '';

// ข้อมูลตารางออกกำลังกายเดิม (เลิกใช้แล้ว): เก็บไว้ตามเดิมโดยไม่แตะ และไม่แสดงในแอป
const LEGACY_TYPES = ['workout', 'meal'];
export const isLegacy = (t) => LEGACY_TYPES.includes(t.type);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
// id ต้องใช้เป็นชื่อเอกสาร Firestore ได้ (ห้ามมี /)
const validId = (id) => (typeof id === 'string' && /^[\w-]{1,64}$/.test(id) ? id : uid());

// ทำให้ข้อมูลงานมีรูปแบบเดียวกันเสมอ (ใช้ทั้งตอนบันทึกและตอนนำเข้า)
export function normalizeTask(t = {}) {
  if (isLegacy(t)) return { ...t, id: validId(t.id) };
  const now = Date.now();
  const type = t.type === 'event' || MONEY_TYPES.includes(t.type) ? t.type : 'task';
  const event = type === 'event';
  const money = MONEY_TYPES.includes(type);
  const done = type === 'task' && !!t.done;
  const createdAt = Number(t.createdAt) || now;
  return {
    id: validId(t.id),
    // task = งานที่ต้องทำ (ติ๊กเสร็จได้) · event = กิจกรรม/นัดหมาย · expense/income = รายจ่าย/รายรับ
    type,
    category: event
      ? (EVENT_CATEGORIES[t.category] ? t.category : 'other')
      : money ? (moneyCategories(type)[t.category] ? t.category : defaultMoneyCategory(type)) : '',
    title: String(t.title ?? '').trim().slice(0, 200),
    description: String(t.description ?? '').slice(0, 5000),
    // รายการเงินต้องมีวันที่เสมอ
    dueDate: ISO_DATE.test(t.dueDate) ? t.dueDate : money ? toISODate(new Date(createdAt)) : null,
    dueTime: !money && /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : '',
    endTime: event && /^\d{2}:\d{2}$/.test(t.endTime) ? t.endTime : '',
    location: event ? String(t.location ?? '').trim().slice(0, 200) : '',
    amount: money ? Math.min(Math.max(Math.round(Number(t.amount) || 0), 0), 1e13) : 0,
    // เลขที่รายการจากสลิป (ใช้เตือนเมื่ออ่านสลิปเดิมซ้ำ)
    ref: money ? String(t.ref ?? '').replace(/[^\w-]/g, '').slice(0, 64) : '',
    priority: PRIORITIES[t.priority] ? t.priority : 'medium',
    tags: Array.isArray(t.tags)
      ? [...new Set(t.tags.map((x) => String(x).trim().replace(/^#/, '')).filter(Boolean))].slice(0, 20)
      : [],
    done,
    completedAt: done ? Number(t.completedAt) || now : null,
    createdAt,
    updatedAt: Number(t.updatedAt) || now,
  };
}

export const isEvent = (t) => t.type === 'event';
export const isMoney = (t) => MONEY_TYPES.includes(t.type);

// "125.50" / "1,200" → สตางค์ · ค่าที่ไม่ถูกต้องหรือ ≤ 0 → 0
export function toSatang(s) {
  const n = Number(String(s ?? '').replace(/[,\s฿]/g, ''));
  return Number.isFinite(n) && n > 0 ? Math.min(Math.round(n * 100), 1e13) : 0;
}

// สตางค์ → "฿1,250" หรือ "฿125.50" (แสดงทศนิยมเมื่อมีเศษสตางค์)
const moneyFormatters = new Map();
export function formatMoney(satang) {
  const frac = satang % 100 ? 2 : 0;
  const key = `${locale()}|${frac}`;
  if (!moneyFormatters.has(key)) {
    moneyFormatters.set(key, new Intl.NumberFormat(locale(), {
      style: 'currency', currency: 'THB', currencyDisplay: 'narrowSymbol',
      minimumFractionDigits: frac, maximumFractionDigits: frac,
    }));
  }
  return moneyFormatters.get(key).format(satang / 100);
}

// กิจกรรมที่ผ่านไปแล้ว (ดูจากเวลาสิ้นสุด ถ้าไม่มีใช้เวลาเริ่ม ถ้าไม่มีเวลาเลยถือว่าทั้งวัน)
export function isPastEvent(t, today = todayISO(), now = nowHHMM()) {
  if (!isEvent(t) || !t.dueDate) return false;
  if (t.dueDate < today) return true;
  const end = t.endTime || t.dueTime;
  return t.dueDate === today && !!end && end <= now;
}

// กิจกรรมที่กำลังดำเนินอยู่ (วันนี้ เริ่มแล้วแต่ยังไม่ถึงเวลาสิ้นสุด)
export function isOngoingEvent(t, today = todayISO(), now = nowHHMM()) {
  return isEvent(t) && t.dueDate === today && !!t.dueTime && !!t.endTime && t.dueTime <= now && now < t.endTime;
}

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

// ข้อความบอกว่ากิจกรรมจะเริ่มเมื่อไร เช่น "อีก 25 นาที", "พรุ่งนี้ · 09:00–10:00"
export function eventWhenLabel(ev) {
  if (isOngoingEvent(ev)) return t('ongoingUntil', { end: ev.endTime });
  if (ev.dueDate === todayISO()) {
    if (!ev.dueTime) return t('todayAllDay');
    const diff = toMinutes(ev.dueTime) - toMinutes(nowHHMM());
    if (diff > 0) {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      const d = [h && t('hours', { n: h }), m && t('minutes', { n: m })].filter(Boolean).join(' ');
      return `${t('startsIn', { d })} · ${timeRange(ev)}`;
    }
  }
  return [relativeDateLabel(ev.dueDate), timeRange(ev) || t('allDay')].join(' · ');
}

// "จบแล้ว": งานที่ติ๊กเสร็จ หรือกิจกรรมที่ผ่านไปแล้ว
export const isFinished = (t) => (isEvent(t) ? isPastEvent(t) : t.done);

export const timeRange = (t) => [t.dueTime, t.endTime].filter(Boolean).join('–');

export function isOverdue(t, today = todayISO(), now = nowHHMM()) {
  if (isEvent(t) || t.done || !t.dueDate) return false;
  if (t.dueDate < today) return true;
  return t.dueDate === today && !!t.dueTime && t.dueTime < now;
}

// เรียง: เลยกำหนดก่อน → วันที่ → งานที่มีเวลาก่อน → ความสำคัญ → สร้างก่อน
export function compareByDue(a, b) {
  return (
    (isFinished(a) - isFinished(b)) ||
    (isOverdue(b) - isOverdue(a)) ||
    ((a.dueDate ? 0 : 1) - (b.dueDate ? 0 : 1)) ||
    (a.dueDate || '').localeCompare(b.dueDate || '') ||
    ((a.dueTime ? 0 : 1) - (b.dueTime ? 0 : 1)) ||
    a.dueTime.localeCompare(b.dueTime) ||
    (PRIORITIES[a.priority].rank - PRIORITIES[b.priority].rank) ||
    (a.createdAt - b.createdAt)
  );
}

export function compareByPriority(a, b) {
  return (isFinished(a) - isFinished(b)) || (PRIORITIES[a.priority].rank - PRIORITIES[b.priority].rank) || compareByDue(a, b);
}
