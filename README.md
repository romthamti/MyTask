# MyTodo

เว็บจัดการงาน ตารางงาน และ To-do list ส่วนตัว ใช้ HTML/CSS/JavaScript ล้วน ไม่มีขั้นตอน build โฮสต์บน GitHub Pages และเก็บข้อมูลใน Firebase Firestore (ฟรี)

## ฟีเจอร์
- เพิ่ม แก้ไข ลบ และติ๊กว่าเสร็จ (ลบแล้วกด "เลิกทำ" ได้)
- งานมี: ชื่อ, รายละเอียด, วันครบกำหนด, เวลา, ความสำคัญ (สูง/กลาง/ต่ำ), แท็ก
- **ภาพรวม:** งานวันนี้, งานเลยกำหนด, 7 วันข้างหน้า, % ความคืบหน้า
- **รายการงาน:** เพิ่มงานด่วน (พิมพ์ `#แท็ก` ได้), ค้นหา, กรองตามสถานะหรือแท็ก, เรียงตามวันที่ ความสำคัญ หรืองานที่เพิ่มล่าสุด
- **ตารางงาน:** ปฏิทินรายเดือนและรายสัปดาห์
- ส่งออกหรือนำเข้าไฟล์ JSON เพื่อสำรองข้อมูล
- ใช้บนมือถือได้, มีโหมดมืด, ใช้ออฟไลน์ได้แล้วซิงก์เมื่อกลับมาออนไลน์
- คีย์ลัด: กด `N` เพื่อเพิ่มงาน

## โครงสร้างไฟล์
```
index.html         หน้าเว็บ
css/style.css      สไตล์ทั้งหมด
js/config.js       ← ใส่ค่า Firebase ที่นี่
js/app.js          หน้าจอและการทำงาน
js/store.js        ชั้นเก็บข้อมูล (Firebase หรือ localStorage)
js/utils.js        ฟังก์ชันช่วยเรื่องวันที่และข้อมูลงาน
firestore.rules    กฎความปลอดภัยของฐานข้อมูล
```

ถ้ายังไม่ได้ใส่ค่า Firebase เว็บจะทำงานใน **โหมดเครื่องนี้** และเก็บข้อมูลไว้ในเบราว์เซอร์ (localStorage) จึงลองใช้ได้ทันที

---

## ขั้นที่ 1: ลองรันในเครื่อง
ไฟล์ JS เป็นแบบ ES module จึงต้องเปิดผ่านเว็บเซิร์ฟเวอร์ ดับเบิลคลิก `index.html` ตรง ๆ จะใช้ไม่ได้
```bash
cd D:\MyTodoList
python -m http.server 8000
```
จากนั้นเปิด http://localhost:8000

## ขั้นที่ 2: ตั้งค่า Firebase
1. ไปที่ https://console.firebase.google.com แล้วกด **Create a project** (ไม่ต้องเปิด Google Analytics)
2. **เพิ่ม Web app:** ในหน้า Project Overview กดไอคอน `</>` ตั้งชื่อ (เช่น `mytodo`) ไม่ต้องติ๊ก Hosting
   - คัดลอกค่าใน `firebaseConfig` มาวางใน `js/config.js`
3. **เปิด Authentication:** เมนู Build › Authentication › Get started › Sign-in method › **Google** › Enable › Save
4. **เพิ่มโดเมนที่อนุญาต:** Authentication › Settings › **Authorized domains** › Add domain
   - เพิ่ม `<username>.github.io` (`localhost` มีให้อยู่แล้ว)
5. **สร้างฐานข้อมูล:** Build › Firestore Database › Create database › เลือก location `asia-southeast1` (สิงคโปร์) › Start in **production mode**
6. **ตั้ง Security Rules:** Firestore › แท็บ **Rules** › วางเนื้อหาไฟล์ `firestore.rules` ทั้งไฟล์ › **Publish**
   - ถ้าอยากให้เข้าได้แค่อีเมลของคุณคนเดียว ให้แก้ฟังก์ชัน `isOwner` ตามคอมเมนต์ในไฟล์

> ค่าใน `config.js` เปิดเผยได้ ไม่ใช่รหัสลับ ข้อมูลจะปลอดภัยเพราะ Security Rules อนุญาตให้แต่ละบัญชีอ่านและเขียนได้เฉพาะงานของตัวเอง

## ขั้นที่ 3: ขึ้น GitHub Pages
1. สร้าง repo ใหม่ที่ https://github.com/new (เช่นชื่อ `MyTodoList`) ตั้งเป็น **Public** และ**ไม่ต้อง**ติ๊กสร้าง README
2. push โค้ดขึ้นไป:
   ```bash
   git remote add origin https://github.com/<username>/MyTodoList.git
   git push -u origin main
   ```
3. ใน repo ไปที่ **Settings › Pages** ตรง Source เลือก **Deploy from a branch** › Branch `main` / `/ (root)` › Save
4. รอประมาณ 1–2 นาที เว็บจะอยู่ที่ `https://<username>.github.io/MyTodoList/`

แก้โค้ดครั้งต่อไปแค่ `git add . && git commit -m "..." && git push` แล้วเว็บจะอัปเดตเอง

## ย้ายข้อมูลจากโหมดเครื่องนี้ไป Firebase
1. ก่อนใส่ config ให้กดเมนู `⋯` › **ส่งออกไฟล์ JSON**
2. ใส่ config แล้วเข้าสู่ระบบ
3. กดเมนู `⋯` › **นำเข้าไฟล์ JSON**

## แก้ปัญหา
| อาการ | วิธีแก้ |
|---|---|
| "โดเมนนี้ยังไม่ได้รับอนุญาต" | ทำขั้นที่ 2 ข้อ 4 |
| "ไม่มีสิทธิ์เข้าถึงข้อมูล" | ตรวจว่า Publish rules จากขั้นที่ 2 ข้อ 6 แล้ว |
| "ยังไม่ได้เปิดการเข้าสู่ระบบด้วย Google" | ทำขั้นที่ 2 ข้อ 3 |
| หน้าเว็บว่างเมื่อดับเบิลคลิก `index.html` | ต้องเปิดผ่านเซิร์ฟเวอร์ (ขั้นที่ 1) |
