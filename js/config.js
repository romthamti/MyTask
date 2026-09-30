// ค่า config จาก Firebase Console (Project settings → General → Your apps → Web app)
//
// ค่าเหล่านี้เปิดเผยได้ ไม่ใช่รหัสลับ — ความปลอดภัยของข้อมูลอยู่ที่ Firestore Security Rules (ไฟล์ firestore.rules)
// ถ้าปล่อย apiKey ว่างไว้ เว็บจะทำงานแบบ "โหมดเครื่องนี้" เก็บข้อมูลในเบราว์เซอร์ (localStorage)
export const firebaseConfig = {
  apiKey: 'AIzaSyD7cdFHg0apZYAhSs3TN522_mPolB7x3sk',
  authDomain: 'mildtask.firebaseapp.com',
  projectId: 'mildtask',
  storageBucket: 'mildtask.firebasestorage.app',
  messagingSenderId: '1031982692894',
  appId: '1:1031982692894:web:b72f9aeb4b8bd0fdcd0c0f',
};
