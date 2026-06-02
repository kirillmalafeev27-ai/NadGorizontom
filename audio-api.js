const audioQuestionPool = Object.create(null);
const ttsAudioCache = new Map();

const DEFAULT_MODELS = 'gpt-5.4,gpt-5.2,gpt-5,gpt-5-mini,gpt-4o,gpt-4o-mini';
const AI_MODELS = (process.env.AITUNNEL_MODELS || DEFAULT_MODELS)
  .split(',')
  .map((model) => model.trim())
  .filter(Boolean);

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_API_KEY || '';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const ELEVENLABS_MODEL_ID = process.env.ELEVENLABS_MODEL_ID || 'eleven_turbo_v2_5';
const TTS_CACHE_LIMIT = Math.max(1, Number(process.env.TTS_CACHE_LIMIT) || 180);

function aiKey() {
  return process.env.AITUNNEL_API_KEY || process.env.OPENAI_API_KEY || '';
}

function aiBaseUrl() {
  if (process.env.AI_BASE_URL) return process.env.AI_BASE_URL.replace(/\/$/, '');
  if (process.env.OPENAI_BASE_URL) return process.env.OPENAI_BASE_URL.replace(/\/$/, '');
  return process.env.AITUNNEL_API_KEY ? 'https://api.aitunnel.ru/v1' : 'https://api.openai.com/v1';
}

async function readJsonBody(req, limit = 1024 * 1024) {
  let size = 0;
  const chunks = [];

  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Cache-Control': 'no-cache',
    'Content-Length': Buffer.byteLength(payload),
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  res.end(payload);
}

function stripOuterQuotes(value) {
  return String(value || '')
    .replace(/^[\s"'`]+|[\s"'`]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeAnswerText(value) {
  return stripOuterQuotes(value).toLowerCase();
}

function hasCyrillic(value) {
  return /\p{Script=Cyrillic}/u.test(String(value || ''));
}

function answerLetterToIndex(value) {
  return ['A', 'B', 'C', 'D'].indexOf(String(value || '').trim().toUpperCase());
}

function normalizeAudioQuestion(raw, level, lexicalTopic) {
  if (!raw || typeof raw !== 'object') return null;

  const audioText = stripOuterQuotes(raw.audioText || raw.audio || raw.de || raw.sentence);
  const options = Array.isArray(raw.options)
    ? raw.options.map((option) => stripOuterQuotes(option)).filter(Boolean)
    : [];

  if (!audioText || hasCyrillic(audioText)) return null;
  if (options.length !== 4 || options.some((option) => !hasCyrillic(option))) return null;
  if (new Set(options.map(normalizeAnswerText)).size !== 4) return null;

  let correct = typeof raw.correct === 'number' ? raw.correct : answerLetterToIndex(raw.correct);
  if (!Number.isInteger(correct) && raw.correctAnswer) {
    const correctAnswer = normalizeAnswerText(raw.correctAnswer);
    correct = options.findIndex((option) => normalizeAnswerText(option) === correctAnswer);
  }
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return null;

  return {
    mode: 'audio',
    level,
    topic: lexicalTopic || 'Audio',
    text: '\u041f\u0440\u043e\u0441\u043b\u0443\u0448\u0430\u0439 \u043d\u0435\u043c\u0435\u0446\u043a\u0443\u044e \u0444\u0440\u0430\u0437\u0443 \u0438 \u0432\u044b\u0431\u0435\u0440\u0438 \u0442\u043e\u0447\u043d\u044b\u0439 \u043f\u0435\u0440\u0435\u0432\u043e\u0434.',
    display: '\u041d\u0435\u043c\u0435\u0446\u043a\u0430\u044f \u0444\u0440\u0430\u0437\u0430 \u0437\u0432\u0443\u0447\u0438\u0442 \u0432\u0441\u043b\u0443\u0445.',
    audioText,
    options,
    correct,
  };
}

function parseAudioQuestions(rawText, expectedCount, level, lexicalTopic) {
  const text = String(rawText || '').trim();
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map((item) => normalizeAudioQuestion(item, level, lexicalTopic))
    .filter(Boolean)
    .slice(0, expectedCount);
}

function buildAudioPrompt({ level, lexicalTopic, questionsCount, exclude }) {
  const excludePart = exclude && exclude.length
    ? `\nDo not reuse these German sentences: ${exclude.slice(-12).map((item) => `"${item}"`).join(', ')}\n`
    : '';

  return `You are an experienced DaF teacher building listening-comprehension tasks.

Create exactly ${questionsCount} short German listening tasks with one exact Russian translation and three wrong Russian options.
Level: ${level}. Do not use grammar or vocabulary above ${level}.
Lexical topic: ${lexicalTopic || 'Alltag'}.
${excludePart}
Rules:
1. Every German sentence is natural, complete, and 6 to 14 words long.
2. The correct option is an exact Russian translation.
3. Wrong options are realistic learner traps: similar word field, prefix, modal verb, preposition, movement direction, false friend, or verb valency.
4. All four options are written in Russian, similarly short, plausible, and distinct.
5. "correct" is the zero-based index of the exact translation.

Output only a JSON array, no Markdown:
[{"audioText":"Ich hole das Rezept in der Apotheke ab.","options":["...","...","...","..."],"correct":0}]

Write exactly ${questionsCount} objects now.`;
}

async function requestAiText(prompt, maxTokens) {
  const key = aiKey();
  if (!key) {
    const error = new Error('AITUNNEL_API_KEY is not configured');
    error.statusCode = 503;
    throw error;
  }

  const errors = [];
  for (const model of AI_MODELS) {
    try {
      const response = await fetch(`${aiBaseUrl()}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          messages: [{ role: 'user', content: prompt }],
        }),
      });

      const bodyText = await response.text();
      if (!response.ok) {
        errors.push(`${model}: HTTP ${response.status} ${bodyText.slice(0, 220)}`);
        continue;
      }

      const data = JSON.parse(bodyText);
      const content = data.choices?.[0]?.message?.content;
      if (content && content.trim()) return content.trim();
      errors.push(`${model}: empty response`);
    } catch (error) {
      errors.push(`${model}: ${error?.message || String(error)}`);
    }
  }

  const error = new Error(`AI Tunnel: all models failed: ${errors.join(' | ')}`);
  error.statusCode = 502;
  throw error;
}

function putTtsCache(key, entry) {
  if (ttsAudioCache.has(key)) ttsAudioCache.delete(key);
  ttsAudioCache.set(key, entry);
  while (ttsAudioCache.size > TTS_CACHE_LIMIT) {
    const oldestKey = ttsAudioCache.keys().next().value;
    ttsAudioCache.delete(oldestKey);
  }
}

async function handleGenerateAudioQuestions(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message || 'invalid json' });
    return;
  }

  const { level, lexicalTopic, count, exclude } = body;
  if (!level) {
    sendJson(res, 400, { error: 'level is required' });
    return;
  }

  const questionsCount = Math.max(1, Math.min(20, Number(count) || 10));
  const cacheKey = `audio:${level}:${lexicalTopic || ''}`;
  if (audioQuestionPool[cacheKey] && audioQuestionPool[cacheKey].length >= questionsCount) {
    sendJson(res, 200, { questions: audioQuestionPool[cacheKey].splice(0, questionsCount) });
    return;
  }

  const prompt = buildAudioPrompt({
    level,
    lexicalTopic,
    questionsCount: Math.max(questionsCount, 10),
    exclude: Array.isArray(exclude) ? exclude : [],
  });

  try {
    const text = await requestAiText(prompt, 4096);
    const valid = parseAudioQuestions(text, Math.max(questionsCount, 10), level, lexicalTopic);
    if (!valid.length) {
      sendJson(res, 502, { error: 'No valid audio questions in LLM response' });
      return;
    }

    if (valid.length > questionsCount) {
      if (!audioQuestionPool[cacheKey]) audioQuestionPool[cacheKey] = [];
      audioQuestionPool[cacheKey].push(...valid.slice(questionsCount));
    }
    sendJson(res, 200, { questions: valid.slice(0, questionsCount) });
  } catch (error) {
    sendJson(res, error.statusCode || 502, { error: error.message || 'Failed to generate audio questions' });
  }
}

async function handleTts(req, res) {
  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, error.statusCode || 400, { error: error.message || 'invalid json' });
    return;
  }

  const text = String(body.text || '').replace(/\s+/g, ' ').trim();
  if (!text) {
    sendJson(res, 400, { error: 'text is required' });
    return;
  }
  if (text.length > 420) {
    sendJson(res, 400, { error: 'text is too long' });
    return;
  }
  if (!ELEVENLABS_API_KEY) {
    sendJson(res, 503, { error: 'ELEVENLABS_API_KEY is not configured' });
    return;
  }

  const cacheKey = `${ELEVENLABS_VOICE_ID}:${ELEVENLABS_MODEL_ID}:${text}`;
  const cached = ttsAudioCache.get(cacheKey);
  if (cached) {
    res.writeHead(200, {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': cached.buffer.length,
      'Content-Type': cached.contentType,
      'X-TTS-Cache': 'HIT',
    });
    res.end(cached.buffer);
    return;
  }

  try {
    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(ELEVENLABS_VOICE_ID)}`, {
      method: 'POST',
      headers: {
        Accept: 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': ELEVENLABS_API_KEY,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.75,
          use_speaker_boost: true,
        },
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      sendJson(res, 502, { error: 'ElevenLabs TTS failed', detail: detail.slice(0, 500) });
      return;
    }

    const contentType = response.headers.get('content-type') || 'audio/mpeg';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) {
      sendJson(res, 502, { error: 'ElevenLabs returned empty audio' });
      return;
    }

    putTtsCache(cacheKey, { buffer, contentType });
    res.writeHead(200, {
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': buffer.length,
      'Content-Type': contentType,
      'X-TTS-Cache': 'MISS',
    });
    res.end(buffer);
  } catch (error) {
    sendJson(res, 502, { error: 'ElevenLabs TTS request failed', detail: error?.message || String(error) });
  }
}

function isAudioApiPath(pathname) {
  return pathname === '/api/audio/status' ||
    pathname === '/api/generate-audio-questions' ||
    pathname === '/api/tts';
}

async function handleAudioApi(req, res) {
  const pathname = (req.url || '').split('?')[0];
  if (pathname === '/api/audio/status') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      generationConfigured: Boolean(aiKey()),
      ttsConfigured: Boolean(ELEVENLABS_API_KEY),
    });
    return;
  }

  if (pathname === '/api/generate-audio-questions') {
    await handleGenerateAudioQuestions(req, res);
    return;
  }

  if (pathname === '/api/tts') {
    await handleTts(req, res);
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

module.exports = { handleAudioApi, isAudioApiPath };
