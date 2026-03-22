/**
 * חיבור ל-API של ימות המשיח
 * עם תמיכה ב-Gemini TTS — העלאת קבצי שמע WAV איכותיים
 */

const { textToSpeech } = require('./gemini-tts');

const YEMOT_API = 'https://www.call2all.co.il/ym/api';
const YEMOT_EXT = process.env.YEMOT_EXT || '3';

async function login() {
  const number = process.env.YEMOT_NUMBER;
  const password = process.env.YEMOT_PASSWORD;
  if (!number || !password) {
    throw new Error('חסרים YEMOT_NUMBER / YEMOT_PASSWORD');
  }

  const url = `${YEMOT_API}/Login?username=${number}&password=${password}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.responseStatus !== 'OK') {
    throw new Error(`שגיאת התחברות: ${data.message || 'unknown'}`);
  }

  console.log('התחברות לימות המשיח הצליחה');
  return data.token;
}

async function logout(token) {
  try { await fetch(`${YEMOT_API}/Logout?token=${token}`); } catch (e) {}
}

async function getNextFileNumber(token) {
  const path = `ivr2:/${YEMOT_EXT}/`;
  const url = `${YEMOT_API}/GetIVR2Dir?token=${token}&path=${path}`;
  const res = await fetch(url);
  const data = await res.json();

  if (data.responseStatus !== 'OK' || !data.files || data.files.length === 0) {
    return 0;
  }

  let maxNum = -1;
  for (const file of data.files) {
    if (file.name && (file.name.endsWith('.tts') || file.name.endsWith('.wav') || file.name.endsWith('.ogg'))) {
      const num = parseInt(file.name.split('.')[0], 10);
      if (!isNaN(num) && num > maxNum) maxNum = num;
    }
  }
  return maxNum + 1;
}

/**
 * העלאת קובץ WAV לימות המשיח
 */
async function uploadWav(token, fileNumber, wavBuffer) {
  const fileName = String(fileNumber).padStart(3, '0');
  const filePath = `ivr2:/${YEMOT_EXT}/${fileName}.wav`;

  const boundary = '----FormBoundary' + Date.now().toString(36);

  const header = Buffer.from(
    `--${boundary}\r\n` +
    `Content-Disposition: form-data; name="upload"; filename="${fileName}.wav"\r\n` +
    `Content-Type: audio/wav\r\n\r\n`
  );
  const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

  const body = Buffer.concat([header, wavBuffer, footer]);

  const url = `${YEMOT_API}/UploadFile?token=${token}&path=${filePath}&convertAudio=1`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`
    },
    body: body
  });

  const data = await res.json();

  if (data.responseStatus === 'OK') {
    console.log(`קובץ ${fileName}.wav הועלה לשלוחה ${YEMOT_EXT}`);
    return { success: true, fileName: `${fileName}.wav` };
  } else {
    throw new Error(`שגיאה בהעלאת WAV: ${JSON.stringify(data)}`);
  }
}

/**
 * fallback — העלאת TTS רגיל אם Gemini לא עובד
 */
async function uploadTTS(token, fileNumber, text) {
  const fileName = String(fileNumber).padStart(3, '0');
  const filePath = `ivr2:/${YEMOT_EXT}/${fileName}.tts`;
  const params = new URLSearchParams({ token, what: filePath, contents: text });
  const res = await fetch(`${YEMOT_API}/UploadTextFile?${params.toString()}`);
  const data = await res.json();

  if (data.responseStatus === 'OK') {
    console.log(`קובץ ${fileName}.tts הועלה (fallback)`);
    return { success: true, fileName: `${fileName}.tts` };
  } else {
    throw new Error(`שגיאה בהעלאת TTS: ${JSON.stringify(data)}`);
  }
}

/**
 * פרסום מבזק — Gemini TTS → WAV → ימות המשיח
 */
async function publishToYemot(ttsText) {
  const token = await login();
  if (!token) return { success: false, error: 'שגיאת התחברות' };

  try {
    const nextNum = await getNextFileNumber(token);
    const geminiKey = process.env.GEMINI_API_KEY;

    if (geminiKey) {
      try {
        console.log('מייצר שמע עם Gemini TTS...');
        const wavBuffer = await textToSpeech(ttsText);
        return await uploadWav(token, nextNum, wavBuffer);
      } catch (geminiErr) {
        console.error('Gemini TTS נכשל, fallback ל-TTS רגיל:', geminiErr.message);
        return await uploadTTS(token, nextNum, ttsText);
      }
    } else {
      return await uploadTTS(token, nextNum, ttsText);
    }
  } finally {
    await logout(token);
  }
}

/**
 * סנכרון מלא
 */
async function syncAllToYemot(newsItems, cleanTextFn) {
  const token = await login();
  if (!token) return { success: false, error: 'שגיאת התחברות' };

  try {
    const path = `ivr2:/${YEMOT_EXT}/`;
    const dirRes = await fetch(`${YEMOT_API}/GetIVR2Dir?token=${token}&path=${path}`);
    const dirData = await dirRes.json();

    if (dirData.responseStatus === 'OK' && dirData.files) {
      for (const file of dirData.files) {
        if (file.name && (file.name.endsWith('.tts') || file.name.endsWith('.wav') || file.name.endsWith('.ogg'))) {
          await fetch(`${YEMOT_API}/FileAction?token=${token}&action=delete&what=ivr2:/${YEMOT_EXT}/${file.name}`);
        }
      }
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    let uploaded = 0;

    for (let i = 0; i < newsItems.length; i++) {
      const item = newsItems[i];
      const text = cleanTextFn(item.title) + ' ' + cleanTextFn(item.content);

      try {
        if (geminiKey) {
          const wavBuffer = await textToSpeech(text);
          await uploadWav(token, i, wavBuffer);
        } else {
          await uploadTTS(token, i, text);
        }
        uploaded++;
      } catch (err) {
        console.error(`שגיאה במבזק ${i}:`, err.message);
        try { await uploadTTS(token, i, text); uploaded++; } catch (e) {}
      }
    }

    console.log(`סונכרנו ${uploaded} מבזקים לשלוחה ${YEMOT_EXT}`);
    return { success: true, uploaded };
  } finally {
    await logout(token);
  }
}

module.exports = { login, logout, publishToYemot, syncAllToYemot, YEMOT_EXT };
