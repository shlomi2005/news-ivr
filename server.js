const express = require('express');
const path = require('path');
const { getDb, saveDb } = require('./db');
const { cleanTextForIVR, formatTime, buildIVRResponse } = require('./text-cleaner');
const { publishToYemot, syncAllToYemot } = require('./yemot-api');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// GET /api/news
app.get('/api/news', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`SELECT id, title, content, created_at, is_active FROM news WHERE is_active = 1 ORDER BY created_at DESC LIMIT 10`);
    if (!results.length) return res.json([]);
    const items = results[0].values.map(row => ({ id: row[0], title: row[1], content: row[2], time: formatTime(row[3]).replace(' ', ':'), created_at: row[3], is_active: row[4] }));
    res.json(items);
  } catch (err) { res.status(500).json({ error: 'שגיאה בשרת' }); }
});

// GET /api/news/all
app.get('/api/news/all', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`SELECT id, title, content, created_at, is_active FROM news ORDER BY created_at DESC`);
    if (!results.length) return res.json([]);
    const items = results[0].values.map(row => ({ id: row[0], title: row[1], content: row[2], time: formatTime(row[3]).replace(' ', ':'), created_at: row[3], is_active: row[4] }));
    res.json(items);
  } catch (err) { res.status(500).json({ error: 'שגיאה בשרת' }); }
});

// POST /api/news — יצירת מבזק + העלאה אוטומטית לימות המשיח
app.post('/api/news', async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ error: 'חובה למלא תוכן' });

    const db = await getDb();
    db.run(`INSERT INTO news (title, content) VALUES (?, ?)`, [content, content]);
    saveDb();

    const result = db.exec('SELECT last_insert_rowid()');
    const newId = result[0].values[0][0];

    // העלאה אוטומטית לימות המשיח
    let yemotResult = null;
    try {
      const now = new Date();
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      const cleanContent = cleanTextForIVR(content);
      const ttsText = `${hours}:${minutes} בחדשותינו ${cleanContent}`;
      yemotResult = await publishToYemot(ttsText);
      console.log('📞 ימות המשיח:', yemotResult);
    } catch (yemotErr) {
      console.error('⚠️ שגיאה בהעלאה לימות:', yemotErr.message);
    }

    res.status(201).json({ id: newId, content, message: 'מבזק פורסם בהצלחה', yemot: yemotResult || { success: false, error: 'לא הצליח להעלות לימות' } });
  } catch (err) { res.status(500).json({ error: 'שגיאה ביצירת מבזק' }); }
});

// PUT /api/news/:id
app.put('/api/news/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, is_active } = req.body;
    const db = await getDb();

    if (title !== undefined && content !== undefined) {
      db.run(`UPDATE news SET title = ?, content = ? WHERE id = ?`, [title, content, Number(id)]);
    }
    if (is_active !== undefined) {
      db.run(`UPDATE news SET is_active = ? WHERE id = ?`, [is_active ? 1 : 0, Number(id)]);
    }
    saveDb();

    // סנכרון מחדש לימות
    try { await syncActiveNews(db); } catch (e) { console.error('⚠️ סנכרון:', e.message); }

    res.json({ message: 'מבזק עודכן בהצלחה' });
  } catch (err) { res.status(500).json({ error: 'שגיאה בעדכון מבזק' }); }
});

// DELETE /api/news/:id
app.delete('/api/news/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const db = await getDb();
    db.run(`DELETE FROM news WHERE id = ?`, [Number(id)]);
    saveDb();

    // סנכרון מחדש לימות
    try { await syncActiveNews(db); } catch (e) { console.error('⚠️ סנכרון:', e.message); }

    res.json({ message: 'מבזק נמחק בהצלחה' });
  } catch (err) { res.status(500).json({ error: 'שגיאה במחיקת מבזק' }); }
});

// פונקציית עזר — סנכרון כל המבזקים הפעילים לימות
async function syncActiveNews(db) {
  const results = db.exec(`SELECT id, title, content, created_at FROM news WHERE is_active = 1 ORDER BY created_at DESC`);
  let newsItems = [];
  if (results.length) {
    newsItems = results[0].values.map(row => ({ id: row[0], title: row[1], content: row[2], created_at: row[3] }));
  }
  await syncAllToYemot(newsItems, cleanTextForIVR);
}

// GET /ivr
app.get('/ivr', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`SELECT id, title, content, created_at FROM news WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5`);
    let newsItems = [];
    if (results.length) { newsItems = results[0].values.map(row => ({ id: row[0], title: row[1], content: row[2], created_at: row[3] })); }
    const ivrResponse = buildIVRResponse(newsItems);
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send(ivrResponse);
  } catch (err) {
    res.set('Content-Type', 'text/plain; charset=utf-8');
    res.send('id_list_message=t-שגיאה במערכת נסו שוב מאוחר יותר תודה&go_to_folder=/hangup');
  }
});

// GET /ivr/preview
app.get('/ivr/preview', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`SELECT id, title, content, created_at FROM news WHERE is_active = 1 ORDER BY created_at DESC LIMIT 5`);
    let newsItems = [];
    if (results.length) { newsItems = results[0].values.map(row => ({ id: row[0], title: row[1], content: row[2], created_at: row[3] })); }
    const ivrResponse = buildIVRResponse(newsItems);
    res.json({ raw_output: ivrResponse, news_count: newsItems.length, items: newsItems.map(item => ({ ...item, cleaned_title: cleanTextForIVR(item.title), cleaned_content: cleanTextForIVR(item.content) })) });
  } catch (err) { res.status(500).json({ error: 'שגיאה' }); }
});

// סנכרון ידני — מוחק הכל ומעלה מחדש
app.post('/api/yemot/sync', async (req, res) => {
  try {
    const db = await getDb();
    const results = db.exec(`SELECT id, title, content, created_at FROM news WHERE is_active = 1 ORDER BY created_at DESC LIMIT 10`);
    let newsItems = [];
    if (results.length) {
      newsItems = results[0].values.map(row => ({ id: row[0], title: row[1], content: row[2], created_at: row[3] }));
    }
    const result = await syncAllToYemot(newsItems, cleanTextForIVR, formatTime);
    res.json({ success: true, message: 'סונכרן בהצלחה', ...result });
  } catch (err) { res.status(500).json({ success: false, error: err.message }); }
});

async function start() {
  await getDb();
  const ext = process.env.YEMOT_EXT || '3';
  app.listen(PORT, () => {
    console.log(`\n🚀 מערכת מבזקי חדשות פעילה!`);
    console.log(`   📋 פאנל ניהול: http://localhost:${PORT}`);
    console.log(`   📡 API:        http://localhost:${PORT}/api/news`);
    console.log(`   📞 IVR:        http://localhost:${PORT}/ivr`);
    console.log(`   📱 ימות המשיח: שלוחה ${ext}\n`);
  });
}

start();
