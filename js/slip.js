// ---------- อ่านสลิปโอนเงิน (OCR ในเบราว์เซอร์) ----------
// รูปถูกอ่านในเครื่องนี้เท่านั้น ไม่ได้อัปโหลดหรือบันทึกไว้ที่ไหน
// ที่โหลดจากอินเทอร์เน็ตมีแค่ตัวอ่าน (Tesseract.js) และข้อมูลภาษาไทย/อังกฤษ ครั้งแรกครั้งเดียว แล้วเบราว์เซอร์จะจำไว้
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

let workerPromise = null;
let onProgress = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = Object.assign(document.createElement('script'), { src, async: true });
    s.onload = resolve;
    s.onerror = () => reject(new Error('load failed'));
    document.head.append(s);
  });
}

function getWorker() {
  workerPromise ??= (async () => {
    if (!window.Tesseract) await loadScript(TESSERACT);
    return window.Tesseract.createWorker(['tha', 'eng'], 1, {
      logger: (m) => onProgress?.(m),
    });
  })().catch((err) => {
    workerPromise = null;
    throw err;
  });
  return workerPromise;
}

// progress({ stage: 'loading' | 'reading', pct })
export async function readSlip(file, progress) {
  onProgress = (m) =>
    progress?.({
      stage: m.status === 'recognizing text' ? 'reading' : 'loading',
      pct: Math.round((m.progress || 0) * 100),
    });
  try {
    const [worker, image] = await Promise.all([getWorker(), prepare(file)]);
    const { data } = await worker.recognize(image);
    return parseSlip(data.text || '');
  } finally {
    onProgress = null;
  }
}

// ขยายรูปเล็กให้ใหญ่ขึ้น (กว้างราว 1,400px) และแปลงเป็นขาวดำ ทำให้อ่านภาษาไทยแม่นขึ้นมาก
async function prepare(file) {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(Math.max(1400 / bmp.width, 1), 2.5);
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * scale);
    c.height = Math.round(bmp.height * scale);
    const g = c.getContext('2d');
    g.filter = 'grayscale(1) contrast(1.4)';
    g.imageSmoothingQuality = 'high';
    g.drawImage(bmp, 0, 0, c.width, c.height);
    bmp.close?.();
    return c;
  } catch {
    return file;
  }
}

// ---------- แยกข้อมูลจากข้อความในสลิป ----------
const TH_MONTHS = ['มค', 'กพ', 'มีค', 'เมย', 'พค', 'มิย', 'กค', 'สค', 'กย', 'ตค', 'พย', 'ธค'];
const TH_MONTHS_FULL = ['มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน', 'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'];
const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// ปี 2 หลัก: ≥ 50 = พ.ศ. (69 → 2569) · < 50 = ค.ศ. (26 → 2026) · ปี 4 หลักที่เกิน 2400 = พ.ศ.
function toYear(y) {
  let n = Number(y);
  if (y.length <= 2) n += n >= 50 ? 2500 : 2000;
  return n > 2400 ? n - 543 : n;
}

// สระ/วรรณยุกต์ที่ OCR มักอ่านเกินมา เช่น "พ.ุย." → เทียบแบบตัดออกเมื่อเทียบตรง ๆ ไม่เจอ
const stripMarks = (s) => s.replace(/[ัิ-ฺ็-๎]/g, '');
function thaiMonth(word) {
  const w = word.replace(/[.\s]/g, '');
  for (const fn of [(x) => x, stripMarks]) {
    const x = fn(w);
    const i = TH_MONTHS_FULL.findIndex((m) => x.startsWith(fn(m)));
    if (i !== -1) return i;
    const j = TH_MONTHS.findIndex((m) => fn(m) === x);
    if (j !== -1) return j;
  }
  return -1;
}

const pad = (n) => String(n).padStart(2, '0');

function validDate(y, m, d) {
  const date = new Date(y, m, d);
  if (date.getMonth() !== m || date.getDate() !== d) return '';
  const now = Date.now();
  // ไม่รับวันในอนาคต และไม่เก่าเกิน 2 ปี
  if (date.getTime() > now + 86400000 || date.getTime() < now - 2 * 365 * 86400000) return '';
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

function findDate(text) {
  for (const m of text.matchAll(/(\d{1,2})\s*([ก-๙][ก-๙.\s]{1,12}?)\s*(\d{4}|\d{2})(?!\d)/g)) {
    const month = thaiMonth(m[2]);
    if (month !== -1) {
      const iso = validDate(toYear(m[3]), month, Number(m[1]));
      if (iso) return iso;
    }
  }
  for (const m of text.matchAll(/(\d{1,2})\s*([A-Za-z]{3,9})\.?,?\s*(\d{4}|\d{2})(?!\d)/g)) {
    const month = EN_MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (month !== -1) {
      const iso = validDate(toYear(m[3]), month, Number(m[1]));
      if (iso) return iso;
    }
  }
  for (const m of text.matchAll(/(?<!\d)(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)/g)) {
    const iso = validDate(toYear(m[3]), Number(m[2]) - 1, Number(m[1]));
    if (iso) return iso;
  }
  return '';
}

// จำนวนเงินมีทศนิยม 2 ตำแหน่งเสมอ เช่น 1,250.00 (OCR อาจอ่านจุลภาคเป็นเว้นวรรค)
const MONEY = /(?<![\d.,])(\d{1,3}(?:[,\s]\d{3})+|\d+)[.,](\d{2})(?![\d])/g;
const toSatang = (m) => Number(m[1].replace(/[,\s]/g, '')) * 100 + Number(m[2]);
const SKIP_LINE = /ค่าธรรมเนียม|fee|คงเหลือ|balance/i;

function findAmount(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (!/จำนวน|ยอด|amount|total/i.test(lines[i]) || SKIP_LINE.test(lines[i])) continue;
    for (const line of [lines[i], lines[i + 1] || '']) {
      const m = [...line.matchAll(MONEY)][0];
      if (m && toSatang(m) > 0) return toSatang(m);
    }
  }
  // ไม่มีคำว่า "จำนวน": ใช้ยอดที่มากที่สุด (ไม่นับค่าธรรมเนียม/ยอดคงเหลือ)
  const all = lines.filter((l) => !SKIP_LINE.test(l)).flatMap((l) => [...l.matchAll(MONEY)].map(toSatang));
  return all.length ? Math.max(...all) : 0;
}

const NAME_START = /^(?:นาย|นางสาว|นาง|น\.ส\.?|ด\.ช\.|ด\.ญ\.|mr\.?|mrs\.?|ms\.?|miss|บริษัท|บจก|หจก|ร้าน|company|co\.)/i;
const COMPANY = /^(?:บริษัท|บจก|หจก|ร้าน|company|co\.)/i;
const NOT_NAME = /ธนาคาร|^ธ\.|bank|พร้อมเพย์|promptpay|เลขที่|อ้างอิง|ref|จำนวน|amount|ค่าธรรมเนียม/i;

function cleanName(s) {
  return s
    .replace(/[xX*\d-]{4,}.*$/, '') // ตัดเลขบัญชีที่ปิดบังไว้ เช่น xxx-x-x1234-x
    .replace(/[|:：]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}
const looksLikeName = (s) => s.length >= 3 && /[ก-๙A-Za-z]{2}/.test(s) && !NOT_NAME.test(s);

function findRecipient(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(?:ไปยัง|ไป|ถึง|ผู้รับเงิน|ผู้รับ|to|receiver|payee)\s*[:：]?\s*(.*)$/i);
    if (!m) continue;
    for (const cand of [m[1], lines[i + 1] || '']) {
      const name = cleanName(cand);
      if (looksLikeName(name)) return name;
    }
  }
  // ไม่มีป้ายกำกับ (เช่น สลิปกสิกร): บรรทัดแรกที่เป็นชื่อคือผู้โอน บรรทัดที่สองคือผู้รับ
  const names = lines.filter((l) => NAME_START.test(l)).map(cleanName).filter(looksLikeName);
  if (names.length >= 2) return names[1];
  if (names.length === 1 && COMPANY.test(names[0])) return names[0];
  return '';
}

function findRef(lines) {
  const label = /(?:เลขที่รายการ|รหัสอ้างอิง|หมายเลขอ้างอิง|เลขที่อ้างอิง|ref(?:erence)?\.?\s*(?:no\.?|id|code)?|transaction\s*(?:id|no\.?))\s*[:：]?\s*(.*)$/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(label);
    if (!m) continue;
    for (const cand of [m[1], lines[i + 1] || '']) {
      const ref = cand.replace(/\s/g, '').match(/[A-Za-z0-9]{8,}/);
      if (ref) return ref[0].slice(0, 64);
    }
  }
  // อ่านป้ายไม่ออก: ใช้รหัสยาว ๆ ที่มีตัวเลขอย่างน้อย 8 ตัว (เบอร์โทร/เลขบัญชีสั้นกว่านี้)
  for (const line of lines) {
    if (line.search(MONEY) !== -1) continue;
    const m = line.replace(/\s/g, '').match(/[A-Za-z0-9]{12,}/g)?.find((x) => (x.match(/\d/g) || []).length >= 8);
    if (m) return m.slice(0, 64);
  }
  return '';
}

// เดาหมวดจากชื่อผู้รับ/ร้านค้า
// [หมวด, คำที่พบ, ประเภท (ไม่ระบุ = รายจ่าย)]
const CATEGORY_HINTS = [
  ['invest', /กองทุน|\bfunds?\b|หุ้น|หลักทรัพย์|securities|บลจ|asset\s*management|bitkub|binance|ทองคำ|ฮั่วเซ่งเฮง/i, 'saving'],
  ['food', /ร้านอาหาร|อาหาร|กาแฟ|coffee|cafe|คาเฟ่|grab\s*food|lineman|ไลน์แมน|foodpanda|starbucks|kfc|mcdonald|แมคโดนัลด์|swensen|mk\s|ก๋วยเตี๋ยว|ข้าว/i],
  ['transport', /grab|bolt|bts|mrt|ปตท|ptt|bangchak|บางจาก|shell|เชลล์|ทางด่วน|easy\s*pass|น้ำมัน|รถไฟ|การบิน|airways|air\s?asia/i],
  ['bills', /การไฟฟ้า|ไฟฟ้า|ประปา|\bmea\b|\bpea\b|true|ทรู|\bais\b|dtac|3bb|internet|อินเทอร์เน็ต|ค่าไฟ|ค่าน้ำ|ประกัน|insurance/i],
  ['shopping', /shopee|lazada|7-?eleven|เซเว่น|lotus|โลตัส|big\s?c|บิ๊กซี|makro|แม็คโคร|central|เซ็นทรัล|uniqlo|ikea|tops/i],
  ['health', /โรงพยาบาล|hospital|clinic|คลินิก|pharmacy|ร้านยา|เภสัช|boots|watsons|ทันตกรรม|dental/i],
  ['fun', /netflix|spotify|youtube|steam|cinema|โรงภาพยนตร์|major|sf\s?cinema|คอนเสิร์ต|ticket/i],
];

// คืนค่า { amount (สตางค์), date (YYYY-MM-DD หรือ ''), name, ref, kind: 'payment'|'transfer', category, type }
export function parseSlip(raw) {
  // OCR มักแยก "ำ" เป็น นิคหิต + สระอา
  const text = raw.replace(/ํา/g, 'ำ');
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const name = findRecipient(lines);
  const hay = name || text;
  const hint = CATEGORY_HINTS.find(([, re]) => re.test(hay));
  return {
    amount: findAmount(lines),
    date: findDate(text),
    name,
    ref: findRef(lines),
    kind: /ชำระ|payment|bill\s*pay/i.test(text) ? 'payment' : 'transfer',
    category: hint?.[0] || '',
    type: hint?.[2] || 'expense',
  };
}
