const express = require('express');
const path = require('path');
const { getDb, saveDb } = require('./db');
const { cleanTextForIVR, formatTime, buildIVRResponse } = require('./text-cleaner');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// CORS for API access
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// ===========================
// API Routes (JSON)
// ===========================

// GET /api/news — קבלת כל המבזקים הפעילים
app.get('/api/news', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, title, content, created_at, is_active
      FROM news
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 10
    `);

    if (!results.length) return res.json([]);

    const items = results[0].values.map(row => ({
      id: row[0],
      title: row[1],
      content: row[2],
      time: formatTime(row[3]).replace(' ', ':'),
      created_at: row[3],
      is_active: row[4]
    }));

    res.json(items);
  } catch (err) {
    console.error('Error fetching news:', err);
    res.status(500).json({ error: 'שגיאה בשרת' });
  }
});

// GET /api/news/all — כל המבזקים כולל לא פעילים (לפאנל ניהול)
app.get('/api/news/all', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, title, content, created_at, is_active
      FROM news
      ORDER BY created_at DESC
    `);

    if (!results.length) return res.json([]);

    const items = results[0].values.map(row => ({
      id: row[0],
      title: row[1],
      content: row[2],
      time: formatTime(row[3]).replace(' ', ':'),
      created_at: row[3],
      is_active: row[4]
    }));

    res.json(items);
  } catch (err) {
    console.error('Error fetching all news:', err);
    res.status(500).json({ error: 'שגיאה בשרת' });
  }
});

// POST /api/news — יצירת מבזק חדש
app.post('/api/news', async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ error: 'חובה למלא כותרת ותוכן' });
    }

    const db = await getDb();
    db.run(
      `INSERT INTO news (title, content) VALUES (?, ?)`,
      [title, content]
    );
    saveDb();

    const result = db.exec('SELECT last_insert_rowid()');
    const newId = result[0].values[0][0];

    res.status(201).json({
      id: newId,
      title,
      content,
      message: 'מבזק פורסם בהצלחה'
    });
  } catch (err) {
    console.error('Error creating news:', err);
    res.status(500).json({ error: 'שגיאה ביצירת מבזק' });
  }
});

// PUT /api/news/:id — עדכון מבזק
app.put('/api/news/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_active } = req.body;

    const db = await getDb();

    if (title !== undefined && content !== undefined) {
      db.run(
        `UPDATE news SET title = ?, content = ? WHERE id = ?`,
        [title, content, Number(id)]
      );
    }

    if (is_active !== undefined) {
      db.run(
        `UPDATE news SET is_active = ? WHERE id = ?`,
        [is_active ? 1 : 0, Number(id)]
      );
    }

    saveDb();
    res.json({ message: 'מבזק עודכן בהצלחה' });
  } catch (err) {
    console.error('Error updating news:', err);
    res.status(500).json({ error: 'שגיאה בעדכון מבזק' });
  }
});

// DELETE /api/news/:id — מחיקת מבזק
app.delete('/api/news/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    db.run(`DELETE FROM news WHERE id = ?`, [Number(id)]);
    saveDb();
    res.json({ message: 'מבזק נמחק בהצלחה' });
  } catch (err) {
    console.error('Error deleting news:', err);
    res.status(500).json({ error: 'שגיאה במחיקת מבזק' });
  }
});

// ===========================
// IVR Endpoint (ימות המשיח)
// ===========================

app.get('/ivr', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, title, content, created_at
      FROM news
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 5
    `);

    let newsItems = [];
    if (results.length) {
      newsItems = results[0].values.map(row => ({
        id: row[0],
        title: row[1],
        content: row[2],
        created_at: row[3]
      }));
    }

    const ivrResponse = buildIVRResponse(newsItems);

    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(ivrResponse);
  } catch (err) {
    console.error('Error generating IVR response:', err);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send('id_list_message=t-שגיאה במערכת נסו שוב מאוחר יותר תודה&go_to_folder=/hangup');
  }
});

// ===========================
// IVR Preview (for debugging)
// ===========================

app.get('/ivr/preview', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`
      SELECT id, title, content, created_at
      FROM news
      WHERE is_active = 1
      ORDER BY created_at DESC
      LIMIT 5
    `);

    let newsItems = [];
    if (results.length) {
      newsItems = results[0].values.map(row => ({
        id: row[0],
        title: row[1],
        content: row[2],
        created_at: row[3]
      }));
    }

    const ivrResponse = buildIVRResponse(newsItems);

    res.json({
      raw_output: ivrResponse,
      news_count: newsItems.length,
      items: newsItems.map(item => ({
        ...item,
        cleaned_title: cleanTextForIVR(item.title),
        cleaned_content: cleanTextForIVR(item.content)
      }))
    });
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'שגיאה' });
  }
});

// ===========================
// Start Server
// ===========================

async function start() {
  await getDb(); // Initialize DB
  app.listen(PORT, () => {
    console.log(`\n🚀 מערכת מבזקי חדשות פעילה!`);
    console.log(`   📋 פאנל ניהול: http://localhost:${PORT}`);
    console.log(`   📡 API:        http://localhost:${PORT}/api/news`);
    console.log(`   📞 IVR:        http://localhost:${PORT}/ivr`);
    console.log(`   🔍 IVR Debug:  http://localhost:${PORT}/ivr/preview\n`);
  });
}

start();
