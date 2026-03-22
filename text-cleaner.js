/**
 * ניקוי טקסט עבור מערכת ימות המשיח (TTS)
 * מסיר תווים בעייתיים, מחליף קיצורים, ומשאיר רק עברית + מספרים + רווחים
 */

// מילון קיצורים להחלפה
const ABBREVIATIONS = {
  'זצ"ל': 'זכר צדיק לברכה',
  'זצוק"ל': 'זכר צדיק וקדוש לברכה',
  'רה"מ': 'ראש הממשלה',
  'צה"ל': 'צבא ההגנה לישראל',
  'מד"א': 'מגן דוד אדום',
  'בג"ץ': 'בית המשפט הגבוה לצדק',
  'ח"כ': 'חבר כנסת',
  'ח"כים': 'חברי כנסת',
  'שב"כ': 'שירות הביטחון הכללי',
  'מל"ל': 'המוסד לביטוח לאומי',
  'עו"ד': 'עורך דין',
  'ד"ר': 'דוקטור',
  'פרופ\'': 'פרופסור',
  'גב\'': 'גברת',
  'מר\'': 'מר',
  'ר\'': 'רב',
  'הר\'': 'הרב',
  'יו"ר': 'יושב ראש',
  'אלו"מ': 'אלוף משנה',
  'תא"ל': 'תת אלוף',
  'רס"ן': 'רב סרן',
  'סא"ל': 'סגן אלוף',
  'רא"ל': 'רב אלוף',
  'כט"ם': 'כלי טיס מאויש מרחוק',
  'נצ"מ': 'ניצב משנה',
  'תנ"צ': 'תת ניצב',
  'רנ"צ': 'רב ניצב',
  'או"ם': 'האומות המאוחדות',
  'ארה"ב': 'ארצות הברית',
  'אמ"ן': 'אגף המודיעין',
  'חמ"ל': 'חדר מלחמה',
  'פצ"ר': 'פרקליט צבאי ראשי',
  'מפכ"ל': 'מפקד כללי',
  'רמטכ"ל': 'ראש המטה הכללי',
  'זק"א': 'זיהוי קורבנות אסון',
  'כ"ץ': 'כל ישראל חברים',
  'ש"ח': 'שקלים',
  'שעה': 'שעה',
  'ק"מ': 'קילומטר',
  'מ"ר': 'מטר רבוע',
};

/**
 * ניקוי טקסט עבור TTS של ימות המשיח
 */
function cleanTextForIVR(text) {
  if (!text) return '';

  let cleaned = text;

  // 1. הסרת HTML tags
  cleaned = cleaned.replace(/<[^>]*>/g, ' ');

  // 2. החלפת קיצורים (מהארוך לקצר כדי למנוע התנגשויות)
  const sortedAbbrevs = Object.entries(ABBREVIATIONS)
    .sort((a, b) => b[0].length - a[0].length);

  for (const [abbr, full] of sortedAbbrevs) {
    // escape special regex chars in the abbreviation
    const escaped = abbr.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    cleaned = cleaned.replace(new RegExp(escaped, 'g'), full);
  }

  // 3. המרת מספרים עם נקודתיים (שעות) לפורמט קריא
  // 02:16 → 02 16
  cleaned = cleaned.replace(/(\d{1,2}):(\d{2})/g, '$1 $2');

  // 4. הסרת כל התווים שלא עברית, ספרות 0-9, או רווחים
  cleaned = cleaned.replace(/[^\u0590-\u05FF0-9 ]/g, ' ');

  // 5. ניקוי רווחים מיותרים
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned;
}

/**
 * פורמט שעה למבזק
 */
function formatTime(dateStr) {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    // try parsing as local datetime string
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${hours} ${minutes}`;
  }
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours} ${minutes}`;
}

/**
 * בניית תגובת IVR מלאה מרשימת מבזקים
 */
function buildIVRResponse(newsItems) {
  if (!newsItems || newsItems.length === 0) {
    return 'id_list_message=t-שלום אין מבזקים חדשים כרגע תודה ולהתראות&go_to_folder=/hangup';
  }

  let parts = ['שלום להלן המבזקים האחרונים'];

  for (const item of newsItems) {
    const time = formatTime(item.created_at);
    const title = cleanTextForIVR(item.title);
    const content = cleanTextForIVR(item.content);
    parts.push(`מבזק שעה ${time} ${title} ${content}`);
  }

  parts.push('עד כאן המבזקים תודה ולהתראות');

  const fullText = parts.join(' ');
  // ניקוי סופי של רווחים כפולים
  const cleanedText = fullText.replace(/\s+/g, ' ').trim();

  return `id_list_message=t-${cleanedText}&go_to_folder=/hangup`;
}

module.exports = { cleanTextForIVR, formatTime, buildIVRResponse };
