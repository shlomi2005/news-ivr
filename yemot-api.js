/**
 * חיבור ל-API של ימות המשיח
 * העלאת קבצי TTS לשלוחת השמעת קבצים
 */

const YEMOT_API = 'https://www.call2all.co.il/ym/api';
const YEMOT_NUMBER = process.env.YEMOT_NUMBER || '0772521590';
const YEMOT_PASSWORD = process.env.YEMOT_PASSWORD || '215252610';
const YEMOT_EXT = process.env.YEMOT_EXT || '3';

async function login() {
  try {
    const url = `${YEMOT_API}/Login?username=${YEMOT_NUMBER}&password=${YEMOT_PASSWORD}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.responseStatus === 'OK') {
      console.log('✅ התחברות לימות המשיח הצליחה');
      return data.token;
    } else {
      console.error('❌ שגיאת התחברות:', data);
      return null;
    }
  } catch (err) {
    console.error('❌ שגיאת רשת:', err.message);
    return null;
  }
}

async function logout(token) {
  try { await fetch(`${YEMOT_API}/Logout?token=${token}`); } catch (e) {}
}

async function getNextFileNumber(token) {
  try {
    const path = `ivr2:/${YEMOT_EXT}/`;
    const url = `${YEMOT_API}/GetIVR2Dir?token=${token}&path=${path}`;
    const res = await fetch(url);
    const data = await res.json();

    if (data.responseStatus !== 'OK' || !data.files || data.files.length === 0) {
      return 0;
    }

    let maxNum = -1;
    for (const file of data.files) {
      if (file.name && (file.name.endsWith('.tts') || file.name.endsWith('.wav'))) {
        const num = parseInt(file.name.split('.')[0], 10);
        if (!isNaN(num) && num > maxNum) maxNum = num;
      }
    }
    return maxNum + 1;
  } catch (err) {
    console.error('❌ שגיאה בקריאת שלוחה:', err.message);
    return 0;
  }
}

async function uploadTTS(token, fileNumber, text) {
  try {
    const fileName = String(fileNumber).padStart(3, '0');
    const filePath = `ivr2:/${YEMOT_EXT}/${fileName}.tts`;
    const params = new URLSearchParams({ token, what: filePath, contents: text });
    const res = await fetch(`${YEMOT_API}/UploadTextFile?${params.toString()}`);
    const data = await res.json();

    if (data.responseStatus === 'OK') {
      console.log(`✅ קובץ ${fileName}.tts הועלה לשלוחה ${YEMOT_EXT}`);
      return { success: true, fileName: `${fileName}.tts` };
    } else {
      console.error('❌ שגיאה בהעלאה:', data);
      return { success: false, error: data };
    }
  } catch (err) {
    console.error('❌ שגיאת רשת בהעלאה:', err.message);
    return { success: false, error: err.message };
  }
}

async function publishToYemot(ttsText) {
  const token = await login();
  if (!token) return { success: false, error: 'שגיאת התחברות' };

  try {
    const nextNum = await getNextFileNumber(token);
    return await uploadTTS(token, nextNum, ttsText);
  } finally {
    await logout(token);
  }
}

async function syncAllToYemot(newsItems, cleanTextFn) {
  const token = await login();
  if (!token) return { success: false, error: 'שגיאת התחברות' };

  try {
    // מוחקים את כל הקבצים הקיימים
    const path = `ivr2:/${YEMOT_EXT}/`;
    const dirRes = await fetch(`${YEMOT_API}/GetIVR2Dir?token=${token}&path=${path}`);
    const dirData = await dirRes.json();

    if (dirData.responseStatus === 'OK' && dirData.files) {
      for (const file of dirData.files) {
        if (file.name && (file.name.endsWith('.tts') || file.name.endsWith('.wav'))) {
          await fetch(`${YEMOT_API}/FileAction?token=${token}&action=delete&what=ivr2:/${YEMOT_EXT}/${file.name}`);
        }
      }
    }

    // מעלים מחדש
    let uploaded = 0;
    for (let i = 0; i < newsItems.length; i++) {
      const item = newsItems[i];
      const text = cleanTextFn(item.title) + ' ' + cleanTextFn(item.content);
      const result = await uploadTTS(token, i, text);
      if (result.success) uploaded++;
    }

    console.log(`✅ סונכרנו ${uploaded} מבזקים לשלוחה ${YEMOT_EXT}`);
    return { success: true, uploaded };
  } finally {
    await logout(token);
  }
}

module.exports = { login, logout, publishToYemot, syncAllToYemot, YEMOT_EXT };
