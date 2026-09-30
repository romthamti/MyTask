// วางค่า config จาก Firebase Console ที่นี่
// (Project settings → General → Your apps → Web app → SDK setup and configuration → Config)
//
// ค่าเหล่านี้เปิดเผยได้ ไม่ใช่รหัสลับ — ความปลอดภัยของข้อมูลอยู่ที่ Firestore Security Rules (ไฟล์ firestore.rules)
// ถ้าปล่อย apiKey ว่างไว้ เว็บจะทำงานแบบ "โหมดเครื่องนี้" เก็บข้อมูลในเบราว์เซอร์ (localStorage)
export const firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: '',
};
