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

// ทำให้ข้อมูลงานมีรูปแบบเดียวกันเสมอ (ใช้ทั้งตอนบันทึกและตอนนำเข้า)
export function normalizeTask(t = {}) {
  const now = Date.now();
  const done = !!t.done;
  return {
    // id ต้องใช้เป็นชื่อเอกสาร Firestore ได้ (ห้ามมี /)
    id: typeof t.id === 'string' && /^[\w-]{1,64}$/.test(t.id) ? t.id : uid(),
    title: String(t.title ?? '').trim().slice(0, 200),
    description: String(t.description ?? '').slice(0, 5000),
    dueDate: /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null,
    dueTime: /^\d{2}:\d{2}$/.test(t.dueTime) ? t.dueTime : '',
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

export function isOverdue(t, today = todayISO(), now = nowHHMM()) {
  if (t.done || !t.dueDate) return false;
  if (t.dueDate < today) return true;
  return t.dueDate === today && !!t.dueTime && t.dueTime < now;
}

// เรียง: เลยกำหนดก่อน → วันที่ → งานที่มีเวลาก่อน → ความสำคัญ → สร้างก่อน
export function compareByDue(a, b) {
  return (
    (a.done - b.done) ||
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
  return (a.done - b.done) || (PRIORITIES[a.priority].rank - PRIORITIES[b.priority].rank) || compareByDue(a, b);
}
