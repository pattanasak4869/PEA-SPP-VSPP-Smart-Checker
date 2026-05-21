import express from 'express';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '50mb' }));

// Note: db.json will NOT be persistent on Vercel.
// Use Google Sheets integration for real persistence.
const DB_PATH = path.join(process.cwd(), 'db.json');

const initialData = {};

let data = initialData;

// API Routes
app.get('/api/data', (req, res) => {
  res.json(data);
});

app.post('/api/update', (req, res) => {
  // Logic removed for inspections, plants, and tools
  res.json({ status: 'success' });
});

app.post('/api/test-sheets', async (req, res) => {
  const SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;
  if (!SCRIPT_URL) {
    return res.status(400).json({ status: 'error', message: 'GOOGLE_SCRIPT_URL missing' });
  }

  try {
    const response = await fetch(SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'TEST',
        payload: { message: 'Test', timestamp: new Date().toISOString() },
        timestamp: new Date().toISOString(),
        source: 'PEA PQ Smart Tracker TEST'
      })
    });

    if (response.ok) {
      res.json({ status: 'success', message: 'Connected!' });
    } else {
      res.status(500).json({ status: 'error', message: `Error: ${response.status}` });
    }
  } catch (error: any) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

export default app;
