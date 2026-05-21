
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

app.use(express.json({ limit: '50mb' }));

// ระบบจำลองฐานข้อมูลในหน่วยความจำ (In-memory store) พร้อมระบบบันทึกไฟล์ (File Persistence)
// สำหรับการใช้งานจริง ควรเปลี่ยนไปใช้ฐานข้อมูลเช่น PostgreSQL หรือ Google Sheets API
const DB_PATH = path.join(process.cwd(), 'db.json');

const initialData = {
  inspections: [] as any[],
  plants: [] as any[],
  tools: [] as any[]
};

let data = initialData;

// โหลดข้อมูลจากไฟล์เมื่อเริ่มต้นระบบ
function loadData() {
    try {
        if (fs.existsSync(DB_PATH)) {
            const fileContent = fs.readFileSync(DB_PATH, 'utf-8');
            if (fileContent.trim()) {
                data = JSON.parse(fileContent);
                console.log(`[Database] โหลดข้อมูลสำเร็จ: Inspections=${data.inspections.length}, Plants=${data.plants.length}, Tools=${data.tools.length}`);
            } else {
                console.log('[Database] ไฟล์ db.json ว่างเปล่า กำลังใช้ข้อมูลเริ่มต้น');
                saveData();
            }
        } else {
            console.log('[Database] ไม่พบไฟล์ db.json กำลังสร้างไฟล์ใหม่');
            saveData(); // สร้างไฟล์เริ่มต้น
        }
    } catch (error) {
        console.error('[Database] เกิดข้อผิดพลาดในการโหลดข้อมูล:', error);
    }
}

// บันทึกข้อมูลลงไฟล์
function saveData() {
    try {
        fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf-8');
        console.log('[Database] บันทึกข้อมูลลง db.json สำเร็จ');
    } catch (error) {
        console.error('[Database] เกิดข้อผิดพลาดในการบันทึกข้อมูล:', error);
    }
}

loadData();

/**
 * ฟังก์ชันสำหรับส่งข้อมูลไปยัง Google Sheets (Google Sheets Synchronization)
 * 
 * วิธีการทำงาน:
 * 1. ระบบจะตรวจสอบว่ามีการตั้งค่า GOOGLE_SCRIPT_URL ใน Environment Variables หรือไม่
 * 2. หากมี ระบบจะส่งข้อมูลแบบ POST ไปยัง URL นั้นในรูปแบบ JSON
 * 3. ข้อมูลที่ส่งไปจะประกอบด้วย 'type' (ประเภทข้อมูล) และ 'payload' (ตัวข้อมูล)
 */
async function syncToGoogleSheets(type: string, payload: any) {
    const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
    
    if (!SCRIPT_URL) {
        console.log(`[Google Sheets] ข้ามการซิงค์: ไม่พบ GOOGLE_SCRIPT_URL (ประเภท: ${type})`);
        return;
    }

    console.log(`[Google Sheets] กำลังส่งข้อมูลไปยัง Google Sheets... (ประเภท: ${type})`);
    
    try {
        // ส่งข้อมูลไปยัง Google Apps Script Web App
        const response = await fetch(SCRIPT_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type,
                payload,
                timestamp: new Date().toISOString(),
                source: 'PEA PQ Smart Tracker'
            })
        });

        if (response.ok) {
            console.log(`[Google Sheets] ซิงค์ข้อมูลสำเร็จ: ${type}`);
        } else {
            console.error(`[Google Sheets] การซิงค์ล้มเหลว: ${response.statusText}`);
        }
    } catch (error) {
        console.error(`[Google Sheets] เกิดข้อผิดพลาดในการเชื่อมต่อ:`, error);
    }
}

// Broadcast to all clients
const activeUsers = new Map<string, number>();

function broadcast(type: string, payload: any) {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client: any) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

wss.on('connection', (ws: any) => {
  let identifiedUserId: string | null = null;

  ws.on('message', (message: any) => {
    try {
      const data = JSON.parse(message.toString());
      if (data.type === 'IDENTIFY') {
        identifiedUserId = data.payload.userId;
        if (identifiedUserId) {
          activeUsers.set(identifiedUserId, (activeUsers.get(identifiedUserId) || 0) + 1);
          broadcast('ONLINE_USERS', Array.from(activeUsers.keys()));
        }
      } else if (data.type === 'FORCE_LOGOUT') {
        broadcast('FORCE_LOGOUT', data.payload);
      }
    } catch (e) {
      console.error('WebSocket Error:', e);
    }
  });

  ws.on('close', () => {
    if (identifiedUserId) {
      const count = activeUsers.get(identifiedUserId) || 1;
      if (count <= 1) {
        activeUsers.delete(identifiedUserId);
      } else {
        activeUsers.set(identifiedUserId, count - 1);
      }
      broadcast('ONLINE_USERS', Array.from(activeUsers.keys()));
    }
  });
});

// API Routes
app.get('/api/data', (req, res) => {
  res.json(data);
});

app.post('/api/update', (req, res) => {
  const { type, payload } = req.body;
  
  if (type === 'saveInspection') {
    const index = data.inspections.findIndex(i => i.id === payload.id);
    if (index >= 0) data.inspections[index] = payload;
    else data.inspections.unshift(payload);
    saveData();
    broadcast('INSPECTION_UPDATED', payload);
    syncToGoogleSheets('INSPECTION', payload);
  } else if (type === 'savePlant') {
    const index = data.plants.findIndex(p => p.id === payload.id);
    if (index >= 0) data.plants[index] = payload;
    else data.plants.push(payload);
    saveData();
    broadcast('PLANT_UPDATED', payload);
    syncToGoogleSheets('PLANT', payload);
  } else if (type === 'saveTool') {
    const index = data.tools.findIndex(t => t.id === payload.id);
    if (index >= 0) data.tools[index] = payload;
    else data.tools.push(payload);
    saveData();
    broadcast('TOOL_UPDATED', payload);
    syncToGoogleSheets('TOOL', payload);
  } else if (type === 'deleteTool') {
    data.tools = data.tools.filter(t => t.id !== payload.id);
    saveData();
    broadcast('TOOL_DELETED', payload.id);
    syncToGoogleSheets('DELETE_TOOL', payload);
  } else if (type === 'deleteAllPlants') {
    data.plants = [];
    saveData();
    broadcast('PLANTS_CLEARED', null);
    syncToGoogleSheets('DELETE_ALL_PLANTS', {});
  } else if (type === 'deleteAllData') {
    data = {
      inspections: [],
      plants: [],
      tools: []
    };
    saveData();
    broadcast('ALL_DATA_CLEARED', null);
    syncToGoogleSheets('DELETE_ALL_DATA', {});
  }

  res.json({ status: 'success' });
});

app.post('/api/test-sheets', async (req, res) => {
  const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
  
  if (!SCRIPT_URL) {
    return res.status(400).json({ 
      status: 'error', 
      message: 'ไม่พบ GOOGLE_SCRIPT_URL ในระบบ (Environment Variable missing)' 
    });
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TEST',
        payload: { message: 'ระบบทดสอบการเชื่อมต่อ (Connection Test)', timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        source: 'PEA PQ Smart Tracker TEST'
      })
    });

    if (response.ok) {
      res.json({ status: 'success', message: 'เชื่อมต่อ Google Sheets สำเร็จ!' });
    } else {
      res.status(500).json({ 
        status: 'error', 
        message: `Google Sheets ตอบกลับด้วยข้อผิดพลาด: ${response.status} ${response.statusText}` 
      });
    }
  } catch (error: any) {
    res.status(500).json({ 
      status: 'error', 
      message: `เกิดข้อผิดพลาดในการเชื่อมต่อ: ${error.message}` 
    });
  }
});

// Vite middleware for development
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = 3000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
