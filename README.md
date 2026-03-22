# מערכת מבזקי חדשות — ימות המשיח IVR

מערכת מבזקי חדשות חיה, מותאמת לעבודה מושלמת עם ימות המשיח (TTS/IVR).

## 🚀 התקנה והרצה

```bash
npm install
npm start
```

השרת יעלה על `http://localhost:3000`

## 📡 Endpoints

| Endpoint | תיאור |
|----------|--------|
| `GET /` | פאנל ניהול |
| `GET /api/news` | מבזקים פעילים (JSON) |
| `GET /api/news/all` | כל המבזקים כולל לא פעילים |
| `POST /api/news` | יצירת מבזק חדש |
| `PUT /api/news/:id` | עדכון מבזק |
| `DELETE /api/news/:id` | מחיקת מבזק |
| `GET /ivr` | **פלט לימות המשיח** (text/plain) |
| `GET /ivr/preview` | תצוגה מקדימה של פלט IVR |

## 📞 פורמט IVR

הפלט ב-`/ivr` מחזיר:

```
id_list_message=t-שלום להלן המבזקים האחרונים מבזק שעה 14 30 כותרת המבזק תוכן המבזק עד כאן המבזקים תודה ולהתראות&go_to_folder=/hangup
```

### ניקוי טקסט אוטומטי:
- הסרת HTML
- החלפת קיצורים (רה"מ → ראש הממשלה, צה"ל → צבא ההגנה לישראל, וכו')
- הסרת תווים בעייתיים (. - " ' : ; & = / וכו')
- השארת עברית + מספרים + רווחים בלבד

## 🧱 טכנולוגיות

- **Backend**: Node.js + Express
- **Database**: SQLite (via sql.js)
- **Frontend**: HTML/CSS/JS (Vanilla)

## 🌐 דפלוי

### Render
1. צור Web Service חדש
2. חבר את הריפו
3. Build Command: `npm install`
4. Start Command: `npm start`

### Railway
1. חבר את הריפו
2. הכל אוטומטי

### Vercel
⚠️ Vercel עובד Serverless — תצטרך להתאים ל-Vercel Functions

## ⚙️ משתני סביבה

| משתנה | ברירת מחדל | תיאור |
|-------|-----------|--------|
| `PORT` | 3000 | פורט השרת |

## 📌 הערות חשובות

- הדאטאבייס נשמר בקובץ `news.db` בתיקיית הפרויקט
- ב-Render/Railway הקובץ יימחק בכל deploy — שקול לעבור ל-PostgreSQL לפרודקשן
- המערכת מחזירה 3-5 מבזקים אחרונים ב-IVR
- רענון אוטומטי כל 30 שניות בפאנל הניהול
