import { t, locale } from './i18n.js?v=5';

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

// ตารางออกกำลังกาย: workout = สิ่งที่ต้องทำ · meal = สิ่งที่ต้องกิน
// ทำซ้ำทุกสัปดาห์ตามวันที่เลือก (days ว่าง = ทุกวัน) · doneDates = วันที่ทำแล้ว/กินแล้ว · missedDates = วันที่ลืมกิน
export const PLAN_TYPES = ['workout', 'meal'];
export const MEALS = labelled('meal', {
  breakfast: { rank: 0 },
  lunch: { rank: 1 },
  snack: { rank: 2 },
  dinner: { rank: 3 },
});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// เก็บย้อนหลังพอสำหรับนับวันต่อเนื่อง (Firestore จำกัดขนาดเอกสาร)
const isoDates = (a) => (Array.isArray(a) ? [...new Set(a.filter((d) => ISO_DATE.test(d)))].sort().slice(-400) : []);

// ทำให้ข้อมูลงานมีรูปแบบเดียวกันเสมอ (ใช้ทั้งตอนบันทึกและตอนนำเข้า)
export function normalizeTask(t = {}) {
  const now = Date.now();
  const type = t.type === 'event' || PLAN_TYPES.includes(t.type) ? t.type : 'task';
  const event = type === 'event';
  const plan = PLAN_TYPES.includes(type);
  const done = type === 'task' && !!t.done;
  return {
    // id ต้องใช้เป็นชื่อเอกสาร Firestore ได้ (ห้ามมี /)
    id: typeof t.id === 'string' && /^[\w-]{1,64}$/.test(t.id) ? t.id : uid(),
    // task = งานที่ต้องทำ (ติ๊กเสร็จได้) · event = กิจกรรม/นัดหมาย (มีวันเวลา ไม่ต้องติ๊ก) · workout/meal = ตารางออกกำลังกาย
    type,
    category: event
      ? (EVENT_CATEGORIES[t.category] ? t.category : 'other')
      : type === 'meal' ? (MEALS[t.category] ? t.category : 'lunch') : '',
    title: String(t.title ?? '').trim().slice(0, 200),
    description: String(t.description ?? '').slice(0, 5000),
    dueDate: !plan && ISO_DATE.test(t.dueDate) ? t.dueDate : null,
    days: plan && Array.isArray(t.days)
      ? [...new Set(t.days.map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort()
      : [],
    doneDates: plan ? isoDates(t.doneDates) : [],
    missedDates: type === 'meal' ? isoDates(t.missedDates).filter((d) => !t.doneDates?.includes(d)) : [],
    dueTime: /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : '',
    endTime: /^\d{2}:\d{2}$/.test(t.endTime) ? t.endTime : '',
    location: String(t.location ?? '').trim().slice(0, 200),
    priority: PRIORITIES[t.priority] ? t.priority : 'medium',
    tags: Array.isArray(t.tags)
      ? [...new Set(t.tags.map((x) => String(x).trim().replace(/^#/, '')).filter(Boolean))].slice(0, 20)
      : [],
    done,
    completedAt: done ? Number(t.completedAt) || now : null,
    createdAt: Number(t.createdAt) || now,
    updatedAt: Number(t.updatedAt) || now,
  };
}

export const isEvent = (t) => t.type === 'event';
export const isPlan = (t) => PLAN_TYPES.includes(t.type);

// รายการในตารางที่ต้องทำในวันนั้น
export const onDay = (t, iso) => !t.days.length || t.days.includes(parseISODate(iso).getDay());
export const isDoneOn = (t, iso) => t.doneDates.includes(iso);
export const isMissedOn = (t, iso) => t.missedDates.includes(iso);

export function daysLabel(days) {
  const key = days.join();
  if (!days.length || days.length === 7) return t('everyDay');
  if (key === '1,2,3,4,5') return t('weekdays');
  if (key === '0,6') return t('weekend');
  return days.map(weekdayShort).join(' ');
}

// เรียงตามมื้อ → เวลา → สร้างก่อน
export function comparePlan(a, b) {
  return (
    (a.type === 'meal' && b.type === 'meal' ? MEALS[a.category].rank - MEALS[b.category].rank : 0) ||
    ((a.dueTime ? 0 : 1) - (b.dueTime ? 0 : 1)) ||
    a.dueTime.localeCompare(b.dueTime) ||
    (a.createdAt - b.createdAt)
  );
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
