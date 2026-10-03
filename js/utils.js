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

const fmt = (opts) => new Intl.DateTimeFormat('th-TH', opts);
export const F = {
  dayMonth: fmt({ day: 'numeric', month: 'short' }),
  dayMonthYear: fmt({ day: 'numeric', month: 'short', year: 'numeric' }),
  full: fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
  monthYear: fmt({ month: 'long', year: 'numeric' }),
  weekdayLong: fmt({ weekday: 'long' }),
};

// ตัวย่อมาตรฐาน (Intl ของแต่ละเบราว์เซอร์ให้ความยาวไม่เท่ากัน)
export const WEEKDAYS = ['อา.', 'จ.', 'อ.', 'พ.', 'พฤ.', 'ศ.', 'ส.'];

export function relativeDateLabel(iso) {
  const diff = diffDays(iso, todayISO());
  if (diff === 0) return 'วันนี้';
  if (diff === 1) return 'พรุ่งนี้';
  if (diff === -1) return 'เมื่อวาน';
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
export const PRIORITIES = {
  high: { label: 'สูง', rank: 0 },
  medium: { label: 'กลาง', rank: 1 },
  low: { label: 'ต่ำ', rank: 2 },
};

// ประเภทของกิจกรรม (สีอยู่ใน css: --cat-<key>)
export const EVENT_CATEGORIES = {
  meeting: { label: 'ประชุม' },
  appointment: { label: 'นัดหมาย' },
  personal: { label: 'ส่วนตัว' },
  travel: { label: 'เดินทาง' },
  other: { label: 'อื่นๆ' },
};

// ตารางออกกำลังกาย: workout = สิ่งที่ต้องทำ · meal = สิ่งที่ต้องกิน
// ทำซ้ำทุกสัปดาห์ตามวันที่เลือก (days ว่าง = ทุกวัน) · doneDates = วันที่ติ๊กว่าทำแล้ว
export const PLAN_TYPES = ['workout', 'meal'];
export const MEALS = {
  breakfast: { label: 'มื้อเช้า', rank: 0 },
  lunch: { label: 'มื้อกลางวัน', rank: 1 },
  snack: { label: 'มื้อว่าง', rank: 2 },
  dinner: { label: 'มื้อเย็น', rank: 3 },
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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
    // เก็บย้อนหลังพอสำหรับนับวันต่อเนื่อง (Firestore จำกัดขนาดเอกสาร)
    doneDates: plan && Array.isArray(t.doneDates) ? [...new Set(t.doneDates.filter((d) => ISO_DATE.test(d)))].sort().slice(-400) : [],
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

export function daysLabel(days) {
  const key = days.join();
  if (!days.length || days.length === 7) return 'ทุกวัน';
  if (key === '1,2,3,4,5') return 'จ.–ศ.';
  if (key === '0,6') return 'ส.–อา.';
  return days.map((d) => WEEKDAYS[d]).join(' ');
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
export function eventWhenLabel(t) {
  if (isOngoingEvent(t)) return `กำลังดำเนินอยู่ · ถึง ${t.endTime}`;
  if (t.dueDate === todayISO()) {
    if (!t.dueTime) return 'วันนี้ · ทั้งวัน';
    const diff = toMinutes(t.dueTime) - toMinutes(nowHHMM());
    if (diff > 0) {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      return `อีก ${[h && `${h} ชม.`, m && `${m} นาที`].filter(Boolean).join(' ')} · ${timeRange(t)}`;
    }
  }
  return [relativeDateLabel(t.dueDate), timeRange(t) || 'ทั้งวัน'].join(' · ');
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
