const audioCache = new Map();

let activeAudio = null;
let currentQuestion = null;
let playbackToken = 0;
let repeatButton = null;

function ensureRepeatButton() {
  if (repeatButton || !document.body) return repeatButton;

  repeatButton = document.createElement('button');
  repeatButton.id = 'audio-repeat';
  repeatButton.type = 'button';
  repeatButton.textContent = '\u25b6';
  repeatButton.title = '\u041f\u043e\u0432\u0442\u043e\u0440\u0438\u0442\u044c \u0430\u0443\u0434\u0438\u043e-\u0432\u043e\u043f\u0440\u043e\u0441';
  repeatButton.setAttribute('aria-label', repeatButton.title);
  repeatButton.addEventListener('click', () => {
    void playAudioQuestion(currentQuestion, true);
  });
  document.body.appendChild(repeatButton);
  return repeatButton;
}

function stopCurrentPlayback() {
  playbackToken += 1;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio = null;
  }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

function fallbackSpeech(text) {
  if (!('speechSynthesis' in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'de-DE';
  utterance.rate = 0.88;
  const voices = window.speechSynthesis.getVoices ? window.speechSynthesis.getVoices() : [];
  const germanVoice = voices.find((voice) => /^de[-_]/i.test(voice.lang || ''));
  if (germanVoice) utterance.voice = germanVoice;
  window.speechSynthesis.speak(utterance);
}

export function clearAudioQuestion() {
  stopCurrentPlayback();
  currentQuestion = null;
  const button = ensureRepeatButton();
  button?.classList.remove('on', 'loading');
}

export async function playAudioQuestion(question, force = false) {
  const button = ensureRepeatButton();
  currentQuestion = question && question.audioText ? question : null;
  button?.classList.toggle('on', Boolean(currentQuestion));

  if (!currentQuestion) {
    stopCurrentPlayback();
    button?.classList.remove('loading');
    return;
  }
  if (!force && currentQuestion._audioPlayed) return;

  currentQuestion._audioPlayed = true;
  stopCurrentPlayback();
  const token = playbackToken;
  const text = currentQuestion.audioText;
  button?.classList.add('loading');

  try {
    let buffer = audioCache.get(text);
    if (!buffer) {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(`TTS HTTP ${response.status}`);
      buffer = await response.arrayBuffer();
      audioCache.set(text, buffer.slice(0));
    }
    if (token !== playbackToken) return;

    const url = URL.createObjectURL(new Blob([buffer.slice(0)], { type: 'audio/mpeg' }));
    activeAudio = new Audio(url);
    activeAudio.addEventListener('ended', () => URL.revokeObjectURL(url), { once: true });
    activeAudio.addEventListener('error', () => URL.revokeObjectURL(url), { once: true });
    await activeAudio.play();
  } catch (_) {
    if (token === playbackToken) fallbackSpeech(text);
  } finally {
    if (token === playbackToken) button?.classList.remove('loading');
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureRepeatButton, { once: true });
} else {
  ensureRepeatButton();
}
