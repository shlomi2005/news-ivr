/**
 * Gemini TTS — המרת טקסט לדיבור באיכות גבוהה
 * משתמש ב-gemini-2.5-flash-preview-tts
 */

const GEMINI_API = 'https://generativelanguage.googleapis.com/v1beta';
const MODEL = 'gemini-2.5-flash-preview-tts';

/**
 * יוצר קובץ WAV מ-PCM data
 * Gemini מחזיר PCM 24kHz 16-bit LE
 */
function pcmToWav(pcmBuffer, sampleRate = 24000, numChannels = 1, bitsPerSample = 16) {
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBuffer.length;
  const headerSize = 44;
  const buffer = Buffer.alloc(headerSize + dataSize);

  // RIFF header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);

  // fmt chunk
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);          // chunk size
  buffer.writeUInt16LE(1, 20);           // PCM format
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(byteRate, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(bitsPerSample, 34);

  // data chunk
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  pcmBuffer.copy(buffer, 44);

  return buffer;
}

/**
 * ממיר טקסט עברי לקובץ שמע WAV באמצעות Gemini TTS
 */
async function textToSpeech(text) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('חסר GEMINI_API_KEY — הגדר אותו במשתני הסביבה');
  }

  const url = `${GEMINI_API}/models/${MODEL}:generateContent?key=${apiKey}`;

  const body = {
    contents: [{
      parts: [{
        text: text
      }]
    }],
    generationConfig: {
      response_modalities: ["AUDIO"],
      speech_config: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voice_name: "Orus"
          }
        }
      }
    }
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();

  // חילוץ ה-audio מהתשובה
  if (!data.candidates || !data.candidates[0] ||
      !data.candidates[0].content || !data.candidates[0].content.parts) {
    throw new Error('תשובה לא תקינה מ-Gemini');
  }

  const audioPart = data.candidates[0].content.parts.find(
    p => p.inlineData && p.inlineData.mimeType && p.inlineData.mimeType.startsWith('audio/')
  );

  if (!audioPart) {
    throw new Error('לא התקבל אודיו מ-Gemini');
  }

  // המרה מ-base64 ל-buffer
  const pcmBuffer = Buffer.from(audioPart.inlineData.data, 'base64');

  // המרה ל-WAV
  const wavBuffer = pcmToWav(pcmBuffer);

  console.log(`Gemini TTS: ${text.substring(0, 50)}... -> ${wavBuffer.length} bytes WAV`);

  return wavBuffer;
}

module.exports = { textToSpeech };
