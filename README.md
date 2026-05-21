<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# PEA PQ Smart Tracker

แอปพลิเคชันสำหรับติดตามและตรวจสอบคุณภาพไฟฟ้า (Power Quality) สำหรับโรงไฟฟ้า PEA

## การติดตั้งและใช้งานในเครื่อง (Local Development)

**สิ่งที่ต้องมี:** Node.js (v18 ขึ้นไป)

1. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
2. ตั้งค่า Environment Variables ในไฟล์ `.env`:
   - `GEMINI_API_KEY`: คีย์สำหรับใช้งาน AI วิเคราะห์ข้อมูล
   - `GOOGLE_SCRIPT_URL`: URL ของ Google Apps Script สำหรับซิงค์ข้อมูลลง Google Sheets
3. เริ่มต้นแอปพลิเคชัน:
   ```bash
   npm run dev
   ```

## การเตรียมตัวสำหรับ GitHub และ Vercel

### 1. GitHub
- สร้าง Repository ใหม่บน GitHub
- ทำการ Push โค้ดขึ้นไปยัง Repository:
  ```bash
  git init
  git add .
  git commit -m "Initial commit"
  git branch -M main
  git remote add origin <YOUR_GITHUB_REPO_URL>
  git push -u origin main
  ```

### 2. Vercel Deployment
แอปพลิเคชันนี้ได้รับการตั้งค่าให้รองรับการ Deploy บน Vercel ผ่าน `vercel.json` และ `api/index.ts`

**ขั้นตอนการ Deploy:**
1. เชื่อมต่อ GitHub Repository กับ Vercel
2. ตั้งค่า **Environment Variables** บน Vercel Dashboard:
   - `GEMINI_API_KEY`
   - `GOOGLE_SCRIPT_URL`
3. Vercel จะทำการ Build และ Deploy อัตโนมัติ

**ข้อควรระวังบน Vercel:**
- **WebSockets:** Vercel Serverless Functions ไม่รองรับ WebSockets ระบบ Real-time Sync ระหว่างหน้าจออาจไม่ทำงาน (แต่การบันทึกข้อมูลยังทำงานปกติ)
- **Persistence:** ไฟล์ `db.json` จะไม่ถูกบันทึกถาวรบน Vercel แนะนำให้ตั้งค่า **Google Sheets Integration** เพื่อเก็บข้อมูลจริง

## โครงสร้างโปรเจกต์
- `/src`: โค้ดฝั่ง Frontend (React + Vite)
- `/api`: โค้ดฝั่ง Backend (Express) สำหรับ Vercel Serverless Functions
- `server.ts`: สำหรับรัน Full-stack ในเครื่อง (Local)
- `vercel.json`: ไฟล์ตั้งค่าการ Deploy บน Vercel
