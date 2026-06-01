const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { Readable } = require('node:stream');
const zlib = require('node:zlib');
const { handleGenerateQuestions } = require('./question-api');

const DEFAULT_PORT = 3000;
const ROOT = __dirname;
const THREE_ROOT = path.join(ROOT, 'node_modules', 'three');
const DUEL_BOARD_SIZE = 7;
const DUEL_ROOM_TTL_MS = 1000 * 60 * 60 * 4;
const duelRooms = new Map();
const DUEL_QUESTION_BATCH_SIZE = 12;

const DUEL_FALLBACK_QUESTIONS = [
  {
    text: 'Выбери правильную форму.',
    display: 'Heute ___ wir durch die Stadt.',
    options: ['gehen', 'geht', 'gehst', 'gehe'],
    correct: 0,
  },
  {
    text: 'Выбери правильный артикль.',
    display: '___ Brücke ist aus Glas.',
    options: ['Die', 'Der', 'Das', 'Den'],
    correct: 0,
  },
  {
    text: 'Выбери правильную форму Perfekt.',
    display: 'Gestern ___ ich lange gelernt.',
    options: ['habe', 'bin', 'hat', 'ist'],
    correct: 0,
  },
  {
    text: 'Выбери правильный порядок слов.',
    display: 'Ich bleibe ruhig, weil ...',
    options: ['ich die Antwort kenne.', 'ich kenne die Antwort.', 'kenne ich die Antwort.', 'die Antwort ich kenne.'],
    correct: 0,
  },
  {
    text: 'Выбери правильный падеж.',
    display: 'Ich helfe ___ Spieler.',
    options: ['dem', 'den', 'der', 'das'],
    correct: 0,
  },
  {
    text: 'Выбери правильное окончание.',
    display: 'Das ist ein schnell___ Zug.',
    options: ['er', 'e', 'en', 'es'],
    correct: 0,
  },
];

const DUEL_LINE_KEYS = ['lexicon', 'grammar', 'translation'];
const DUEL_DEFAULT_LINE = 'grammar';
const DUEL_FALLBACK_BY_LINE = {
  grammar: DUEL_FALLBACK_QUESTIONS,
  lexicon: [
    {
      text: 'Выбери слово, которое держит смысл фразы.',
      display: 'Der Wind ist heute sehr ___.',
      options: ['stark', 'teuer', 'rund', 'leer'],
      correct: 0,
    },
    {
      text: 'Найди немецкое слово по смыслу.',
      display: 'край, грань',
      options: ['der Rand', 'der Regen', 'die Reise', 'das Regal'],
      correct: 0,
    },
    {
      text: 'Выбери слово, которое подходит к теме.',
      display: 'Auf der Bruecke braucht man ___.',
      options: ['Mut', 'Milch', 'Miete', 'Mode'],
      correct: 0,
    },
    {
      text: 'Найди ближайшее значение.',
      display: 'sich bewegen',
      options: ['двигаться', 'молчать', 'забывать', 'платить'],
      correct: 0,
    },
  ],
  translation: [
    {
      text: 'Выбери живой перевод фразы.',
      display: 'Ich bleibe ruhig.',
      options: ['Я остаюсь спокойным.', 'Я бегу быстрее.', 'Я вижу город.', 'Я теряю ключ.'],
      correct: 0,
    },
    {
      text: 'Собери смысл без лишнего шума.',
      display: 'Мы идём через мост.',
      options: ['Wir gehen ueber die Bruecke.', 'Wir gehen in die Bruecke.', 'Wir geht ueber die Bruecke.', 'Wir gehen der Bruecke.'],
      correct: 0,
    },
    {
      text: 'Выбери перевод, который звучит по-немецки.',
      display: 'Не смотри вниз.',
      options: ['Sieh nicht nach unten.', 'Nicht sieh unten.', 'Siehst nicht unten.', 'Nach unten nicht sehen.'],
      correct: 0,
    },
    {
      text: 'Выбери верный смысл фразы.',
      display: 'Der Gegner steht am Rand.',
      options: ['Противник стоит у края.', 'Противник ждёт дома.', 'Противник пишет письмо.', 'Противник закрывает дверь.'],
      correct: 0,
    },
  ],
};

const CONTENT_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
};

const COMPRESSIBLE = new Set(['.js', '.css', '.html', '.json', '.svg', '.map']);

function acceptsGzip(req) {
  const h = req.headers['accept-encoding'];
  return typeof h === 'string' && h.split(',').some((p) => p.trim().toLowerCase().startsWith('gzip'));
}

function cacheControlFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.glb') return 'public, max-age=31536000, immutable';
  if (ext === '.js' || ext === '.css') return 'public, max-age=3600';
  return 'no-cache';
}

function safeResolve(root, requestPath) {
  let pathname;
  try {
    const rawPath = (requestPath || '/').split('?')[0].split('#')[0];
    pathname = decodeURIComponent(rawPath);
  } catch {
    return null;
  }

  if (!pathname.startsWith('/')) pathname = `/${pathname}`;
  if (pathname.includes('\\') || pathname.split('/').includes('..')) return null;
  if (pathname === '/node_modules' || pathname.startsWith('/node_modules/')) return null;

  if (pathname === '/') pathname = '/index.html';
  const resolved = path.resolve(root, `.${pathname}`);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  if (!resolved.startsWith(rootWithSep)) return null;
  return resolved;
}

function resolveThreeVendor(requestPath) {
  let pathname;
  try {
    pathname = decodeURIComponent((requestPath || '').split('?')[0].split('#')[0]);
  } catch {
    return null;
  }

  const prefix = '/vendor/three/';
  if (!pathname.startsWith(prefix)) return null;
  const relative = pathname.slice(prefix.length);
  if (!relative || relative.includes('\\') || relative.split('/').includes('..')) {
    return null;
  }

  const resolved = path.resolve(THREE_ROOT, relative);
  const vendorRoot = THREE_ROOT.endsWith(path.sep) ? THREE_ROOT : `${THREE_ROOT}${path.sep}`;
  if (!resolved.startsWith(vendorRoot)) return null;
  return resolved;
}

function sendText(res, status, body) {
  res.writeHead(status, {
    'Cache-Control': 'no-cache',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
  });
  res.end(body);
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

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 128 * 1024) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(error);
      }
    });
    req.on('error', reject);
  });
}

function makeRoomId() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let id = '';
  for (let i = 0; i < 5; i++) {
    id += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return duelRooms.has(id) ? makeRoomId() : id;
}

function normalizeDuelLine(line) {
  return DUEL_LINE_KEYS.includes(line) ? line : DUEL_DEFAULT_LINE;
}

function makeLineRecord(factory) {
  return DUEL_LINE_KEYS.reduce((record, line) => {
    record[line] = factory(line);
    return record;
  }, {});
}

function makeDuelQuestionStore() {
  return {
    deck: makeLineRecord(() => []),
    cursor: {
      p1: makeLineRecord(() => 0),
      p2: makeLineRecord(() => 0),
    },
    fetch: makeLineRecord(() => null),
    status: makeLineRecord(() => 'idle'),
    fallbackCursor: makeLineRecord(() => 0),
  };
}

function copyDuelPos(pos) {
  return pos ? { row: Number(pos.row), col: Number(pos.col) } : null;
}

function setDuelAction(room, action) {
  room.eventSeq = (room.eventSeq || 0) + 1;
  room.lastAction = {
    id: room.eventSeq,
    at: Date.now(),
    ...action,
  };
}

function duelStartPositions() {
  const center = Math.floor(DUEL_BOARD_SIZE / 2);
  return {
    p1: { row: DUEL_BOARD_SIZE - 1, col: center },
    p2: { row: 0, col: center },
  };
}

function publicDuelState(room) {
  return {
    id: room.id,
    phase: room.phase,
    revision: room.revision,
    turn: room.turn,
    winner: room.winner,
    settings: room.settings,
    lastEvent: room.lastEvent,
    lastAction: room.lastAction || null,
    players: room.players,
    questions: {
      status: room.questionStatus || makeLineRecord(() => 'idle'),
      deckSize: makeLineRecord((line) => room.questionDeck?.[line]?.length || 0),
    },
  };
}

function touchDuelRoom(room) {
  room.updatedAt = Date.now();
}

function cleanupDuelRooms() {
  const now = Date.now();
  for (const [roomId, room] of duelRooms) {
    if (now - room.updatedAt > DUEL_ROOM_TTL_MS) {
      duelRooms.delete(roomId);
    }
  }
}

function makeDuelPlayer(id, name, pos) {
  const now = Date.now();
  return {
    id,
    name: String(name || (id === 'p1' ? 'Spieler 1' : 'Spieler 2')).slice(0, 24),
    lives: 3,
    pos,
    shaky: false,
    guarded: false,
    connectedAt: now,
    lastSeenAt: now,
  };
}

function touchDuelPlayer(room, playerId) {
  const player = room?.players?.[playerId];
  if (!player) return false;
  player.lastSeenAt = Date.now();
  touchDuelRoom(room);
  return true;
}

function createDuelRoom(settings = {}, hostName = '') {
  cleanupDuelRooms();
  const id = makeRoomId();
  const positions = duelStartPositions();
  const questionStore = makeDuelQuestionStore();
  const room = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 1,
    phase: 'waiting',
    turn: null,
    winner: null,
    settings: {
      level: settings.level || settings.langLevel || 'A2',
      lexicalTopic: settings.lexicalTopic || 'Reisen',
      grammarTopic: settings.grammarTopic || 'Perfekt',
    },
    players: {
      p1: makeDuelPlayer('p1', hostName || settings.hostName || 'Spieler 1', positions.p1),
      p2: null,
    },
    questionDeck: questionStore.deck,
    questionCursor: questionStore.cursor,
    questionFetch: questionStore.fetch,
    questionStatus: questionStore.status,
    fallbackCursor: questionStore.fallbackCursor,
    eventSeq: 0,
    lastAction: null,
    lastEvent: 'Комната создана. Второй игрок может подключаться.',
  };
  duelRooms.set(id, room);
  return room;
}

function getDuelRoom(roomId) {
  if (!roomId || typeof roomId !== 'string') return null;
  return duelRooms.get(roomId.trim().toUpperCase()) || null;
}

function isInsideBoard(pos) {
  return (
    pos &&
    pos.row >= 0 &&
    pos.row < DUEL_BOARD_SIZE &&
    pos.col >= 0 &&
    pos.col < DUEL_BOARD_SIZE
  );
}

function sameCell(a, b) {
  return a && b && a.row === b.row && a.col === b.col;
}

function otherDuelPlayerId(playerId) {
  return playerId === 'p1' ? 'p2' : 'p1';
}

function duelDistance(a, b) {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function cloneDuelQuestion(question, index) {
  return {
    text: question.text,
    display: question.display,
    options: Array.isArray(question.options) ? question.options.slice() : [],
    correct: question.correct,
    duelIndex: index,
  };
}

function isValidDuelQuestion(question) {
  return Boolean(
    question &&
    typeof question.text === 'string' &&
    typeof question.display === 'string' &&
    Array.isArray(question.options) &&
    question.options.length === 4 &&
    Number.isInteger(question.correct) &&
    question.correct >= 0 &&
    question.correct <= 3
  );
}

async function callGeneratedQuestionApi(body) {
  return new Promise((resolve, reject) => {
    const req = Readable.from([Buffer.from(JSON.stringify(body))]);
    req.method = 'POST';
    req.headers = {};

    const res = {
      statusCode: 200,
      writeHead(status) {
        this.statusCode = status;
      },
      end(payload) {
        try {
          const data = payload ? JSON.parse(String(payload)) : {};
          if (this.statusCode >= 200 && this.statusCode < 300) {
            resolve(data.questions || []);
          } else {
            reject(new Error(data.error || `question api ${this.statusCode}`));
          }
        } catch (error) {
          reject(error);
        }
      },
    };

    handleGenerateQuestions(req, res).catch(reject);
  });
}

function buildDuelQuestionRequest(room, line, exclude) {
  const grammarTopic = room.settings.grammarTopic || 'Perfekt';
  const base = {
    level: room.settings.level,
    lexicalTopic: room.settings.lexicalTopic,
    grammarTopic,
    isWortstellung: String(grammarTopic).includes('Wortstellung'),
    count: DUEL_QUESTION_BATCH_SIZE,
    exclude,
    duelLine: line,
  };

  if (line === 'lexicon') {
    return {
      ...base,
      grammarTopic,
      isWortstellung: false,
    };
  }

  if (line === 'translation') {
    return {
      ...base,
      isWortstellung: false,
    };
  }

  return base;
}

function nextDuelFallbackQuestions(room, line, count) {
  const safeLine = normalizeDuelLine(line);
  const fallback = DUEL_FALLBACK_BY_LINE[safeLine] || DUEL_FALLBACK_BY_LINE[DUEL_DEFAULT_LINE];
  const questions = [];
  for (let i = 0; i < count; i++) {
    const cursor = room.fallbackCursor[safeLine] || 0;
    const source = fallback[cursor % fallback.length];
    room.fallbackCursor[safeLine] = cursor + 1;
    questions.push({
      text: source.text,
      display: source.display,
      options: source.options.slice(),
      correct: source.correct,
    });
  }
  return questions;
}

async function fillDuelQuestionDeck(room, line) {
  const safeLine = normalizeDuelLine(line);
  if (room.questionFetch[safeLine]) return room.questionFetch[safeLine];

  room.questionStatus[safeLine] = 'generating';
  markDuelChanged(room);

  room.questionFetch[safeLine] = (async () => {
    const deck = room.questionDeck[safeLine];
    const exclude = deck.map((question) => question.display).slice(-12);
    let questions = [];
    try {
      questions = await callGeneratedQuestionApi(buildDuelQuestionRequest(room, safeLine, exclude));
    } catch (error) {
      console.warn('Duel shared AI question generation fallback:', error.message);
    }

    const valid = questions.filter(isValidDuelQuestion);
    deck.push(...(valid.length ? valid : nextDuelFallbackQuestions(room, safeLine, DUEL_QUESTION_BATCH_SIZE)));
    room.questionStatus[safeLine] = 'ready';
    room.questionFetch[safeLine] = null;
    markDuelChanged(room);
  })().catch((error) => {
    room.questionDeck[safeLine].push(...nextDuelFallbackQuestions(room, safeLine, DUEL_QUESTION_BATCH_SIZE));
    room.questionStatus[safeLine] = 'ready';
    room.questionFetch[safeLine] = null;
    markDuelChanged(room);
    console.warn('Duel question deck failed; using fallback:', error.message);
  });

  return room.questionFetch[safeLine];
}

async function nextDuelQuestion(room, playerId, line) {
  if (!room.players[playerId]) return { ok: false, error: 'unknown player' };
  if (room.phase !== 'playing') return { ok: false, error: 'room is not playing' };
  const safeLine = normalizeDuelLine(line);

  const cursor = room.questionCursor[playerId]?.[safeLine] || 0;
  if (room.questionDeck[safeLine].length <= cursor) {
    await fillDuelQuestionDeck(room, safeLine);
  }

  const question = room.questionDeck[safeLine][cursor];
  if (!question) return { ok: false, error: 'question deck is empty' };

  room.questionCursor[playerId][safeLine] = cursor + 1;
  touchDuelRoom(room);
  return { ok: true, question: cloneDuelQuestion(question, cursor), state: publicDuelState(room) };
}

function resetDuelRound(room) {
  const positions = duelStartPositions();
  if (room.players.p1) room.players.p1.pos = { ...positions.p1 };
  if (room.players.p2) room.players.p2.pos = { ...positions.p2 };
  if (room.players.p1) room.players.p1.shaky = false;
  if (room.players.p2) room.players.p2.shaky = false;
  if (room.players.p1) room.players.p1.guarded = false;
  if (room.players.p2) room.players.p2.guarded = false;
}

function markDuelChanged(room) {
  room.revision += 1;
  touchDuelRoom(room);
}

function handleDuelFall(room, fallenId, attackerId, fall = {}) {
  const fallen = room.players[fallenId];
  if (!fallen) return;

  const from = copyDuelPos(fall.from || fallen.pos);
  const to = copyDuelPos(fall.to || fallen.pos);
  fallen.lives = Math.max(0, fallen.lives - 1);
  if (fallen.lives <= 0) {
    room.phase = 'finished';
    room.winner = attackerId || otherDuelPlayerId(fallenId);
    room.lastEvent = `${fallen.name} сорвался с края. Дуэль окончена.`;
    setDuelAction(room, {
      type: 'fall',
      attackerId,
      fallenId,
      from,
      to,
      livesAfter: fallen.lives,
      final: true,
      roundReset: false,
      winner: room.winner,
      line: fall.line || null,
      power: fall.power || 0,
    });
    return;
  }

  room.lastEvent = `${fallen.name} сорвался с края. Раунд начинается заново.`;
  resetDuelRound(room);
  setDuelAction(room, {
    type: 'fall',
    attackerId,
    fallenId,
    from,
    to,
    livesAfter: fallen.lives,
    final: false,
    roundReset: true,
    resetPositions: duelStartPositions(),
    line: fall.line || null,
    power: fall.power || 0,
  });
}

function moveDuelPlayer(room, playerId, target, maxDistance, meta = {}) {
  const player = room.players[playerId];
  const opponent = room.players[otherDuelPlayerId(playerId)];
  if (!player || !isInsideBoard(target)) return false;
  if (opponent && sameCell(opponent.pos, target)) return false;
  if (duelDistance(player.pos, target) < 1 || duelDistance(player.pos, target) > maxDistance) return false;

  const from = copyDuelPos(player.pos);
  player.pos = { row: target.row, col: target.col };
  player.guarded = false;
  room.lastEvent = `${player.name} меняет позицию.`;
  setDuelAction(room, {
    type: 'move',
    actorId: playerId,
    from,
    to: copyDuelPos(player.pos),
    line: meta.line || null,
    power: meta.power || 0,
  });
  return true;
}

function guardDuelPlayer(room, playerId, meta = {}) {
  const player = room.players[playerId];
  if (!player) return false;
  player.guarded = true;
  player.shaky = false;
  room.lastEvent = `${player.name} упирается в стекло и готовит плечо к ответному удару.`;
  setDuelAction(room, {
    type: 'guard',
    actorId: playerId,
    atCell: copyDuelPos(player.pos),
    line: meta.line || null,
    power: meta.power || 0,
  });
  return true;
}

function swapDuelPlayers(room, playerId, maxDistance, meta = {}) {
  const player = room.players[playerId];
  const opponent = room.players[otherDuelPlayerId(playerId)];
  if (!player || !opponent) return false;
  if (duelDistance(player.pos, opponent.pos) < 1 || duelDistance(player.pos, opponent.pos) > maxDistance) return false;

  const playerPos = { ...player.pos };
  const opponentPos = { ...opponent.pos };
  player.pos = { ...opponent.pos };
  opponent.pos = playerPos;
  player.guarded = false;
  opponent.guarded = false;
  room.lastEvent = `${player.name} меняет угол атаки и оказывается на месте соперника.`;
  setDuelAction(room, {
    type: 'swap',
    actorId: playerId,
    targetId: opponent.id,
    actorFrom: copyDuelPos(playerPos),
    actorTo: copyDuelPos(player.pos),
    targetFrom: copyDuelPos(opponentPos),
    targetTo: copyDuelPos(opponent.pos),
    line: meta.line || null,
    power: meta.power || 0,
  });
  return true;
}

function pushDuelPlayer(room, attackerId, distance, meta = {}) {
  const attacker = room.players[attackerId];
  const defenderId = otherDuelPlayerId(attackerId);
  const defender = room.players[defenderId];
  if (!attacker || !defender || duelDistance(attacker.pos, defender.pos) !== 1) return false;

  attacker.guarded = false;
  const defenderFrom = copyDuelPos(defender.pos);
  let pushDistance = Math.max(1, Math.min(2, Number(distance) || 1));
  if (defender.guarded) {
    defender.guarded = false;
    defender.shaky = false;
    room.lastEvent = `${defender.name} выдерживает толчок и не отдаёт край.`;
    setDuelAction(room, {
      type: 'guardBlock',
      actorId: attackerId,
      targetId: defenderId,
      atCell: defenderFrom,
      line: meta.line || null,
      power: meta.power || 0,
    });
    return true;
  }

  if (defender.shaky) {
    pushDistance += 1;
    defender.shaky = false;
  }

  const dr = Math.sign(defender.pos.row - attacker.pos.row);
  const dc = Math.sign(defender.pos.col - attacker.pos.col);
  const target = {
    row: defender.pos.row + dr * pushDistance,
    col: defender.pos.col + dc * pushDistance,
  };

  if (!isInsideBoard(target)) {
    handleDuelFall(room, defenderId, attackerId, {
      from: defenderFrom,
      to: target,
      line: meta.line || null,
      power: meta.power || pushDistance,
    });
    return true;
  }

  defender.pos = target;
  room.lastEvent = `${attacker.name} отталкивает ${defender.name}.`;
  setDuelAction(room, {
    type: 'push',
    actorId: attackerId,
    targetId: defenderId,
    from: defenderFrom,
    to: copyDuelPos(target),
    distance: pushDistance,
    line: meta.line || null,
    power: meta.power || pushDistance,
  });
  return true;
}

function autoStepToward(room, moverId, targetId) {
  const mover = room.players[moverId];
  const target = room.players[targetId];
  if (!mover || !target) return false;

  const candidates = [
    { row: mover.pos.row + Math.sign(target.pos.row - mover.pos.row), col: mover.pos.col },
    { row: mover.pos.row, col: mover.pos.col + Math.sign(target.pos.col - mover.pos.col) },
  ].filter((pos) => isInsideBoard(pos) && !sameCell(pos, mover.pos));

  for (const pos of candidates) {
    if (!sameCell(pos, target.pos)) {
      const from = copyDuelPos(mover.pos);
      mover.pos = pos;
      return { from, to: copyDuelPos(mover.pos) };
    }
  }
  return false;
}

function applyDuelPenalty(room, playerId, correctBefore) {
  const player = room.players[playerId];
  const opponentId = otherDuelPlayerId(playerId);
  const opponent = room.players[opponentId];
  if (!player || !opponent) return false;

  if (correctBefore <= 0) {
    player.shaky = true;
    room.lastEvent = `${player.name} теряет равновесие. Следующий толчок будет опаснее.`;
    setDuelAction(room, {
      type: 'penalty',
      actorId: playerId,
      targetId: opponentId,
      atCell: copyDuelPos(player.pos),
      correctBefore,
    });
  } else if (correctBefore === 1) {
    const step = autoStepToward(room, opponentId, playerId);
    room.lastEvent = `${player.name} сорвал серию. ${opponent.name} получает короткий шаг.`;
    setDuelAction(room, {
      type: 'penaltyStep',
      actorId: playerId,
      targetId: opponentId,
      from: step?.from || copyDuelPos(opponent.pos),
      to: step?.to || copyDuelPos(opponent.pos),
      correctBefore,
    });
  } else {
    if (duelDistance(player.pos, opponent.pos) === 1) {
      pushDuelPlayer(room, opponentId, 1, { line: 'penalty', power: 1 });
      if (room.phase !== 'finished' && room.lastAction?.type !== 'fall') {
        room.lastEvent = `${player.name} рискнул слишком глубоко. ${opponent.name} отвечает толчком.`;
      }
    } else {
      const step = autoStepToward(room, opponentId, playerId);
      room.lastEvent = `${player.name} теряет почти готовый ход. ${opponent.name} сокращает дистанцию.`;
      setDuelAction(room, {
        type: 'penaltyStep',
        actorId: playerId,
        targetId: opponentId,
        from: step?.from || copyDuelPos(opponent.pos),
        to: step?.to || copyDuelPos(opponent.pos),
        correctBefore,
      });
    }
  }
  return true;
}

function applyDuelAction(room, playerId, action = {}) {
  if (!room.players[playerId]) return { ok: false, error: 'unknown player' };
  if (room.phase !== 'playing') return { ok: false, error: 'room is not playing' };

  let changed = false;
  if (action.type === 'move') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    const maxDistance = power >= 2 ? 2 : 1;
    changed = moveDuelPlayer(room, playerId, action.target, maxDistance, {
      line: normalizeDuelLine(action.line),
      power,
    });
  } else if (action.type === 'push') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    const grammarPush = action.line === 'grammar' && power >= 2;
    changed = pushDuelPlayer(room, playerId, grammarPush || power >= 3 ? 2 : 1, {
      line: normalizeDuelLine(action.line),
      power,
    });
  } else if (action.type === 'swap') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    changed = power >= 2 && swapDuelPlayers(room, playerId, 2, {
      line: normalizeDuelLine(action.line),
      power,
    });
  } else if (action.type === 'guard') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    changed = guardDuelPlayer(room, playerId, {
      line: normalizeDuelLine(action.line),
      power,
    });
  } else if (action.type === 'penalty') {
    changed = applyDuelPenalty(room, playerId, Math.max(0, Math.min(2, Number(action.correctBefore) || 0)));
  }

  if (!changed) return { ok: false, error: 'illegal action' };
  markDuelChanged(room);
  return { ok: true, state: publicDuelState(room) };
}

async function handleDuelApi(req, res) {
  const url = new URL(req.url || '/', 'http://localhost');

  if (req.method === 'GET' && url.pathname === '/api/duel/state') {
    const room = getDuelRoom(url.searchParams.get('roomId'));
    if (!room) {
      sendJson(res, 404, { error: 'room not found' });
      return;
    }
    touchDuelPlayer(room, url.searchParams.get('playerId'));
    touchDuelRoom(room);
    sendJson(res, 200, { state: publicDuelState(room) });
    return;
  }

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'method not allowed' });
    return;
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    sendJson(res, 400, { error: 'invalid json' });
    return;
  }

  if (url.pathname === '/api/duel/create') {
    const room = createDuelRoom(body.settings || {}, body.name || '');
    sendJson(res, 200, { roomId: room.id, playerId: 'p1', state: publicDuelState(room) });
    return;
  }

  if (url.pathname === '/api/duel/join') {
    const room = getDuelRoom(body.roomId);
    if (!room) {
      sendJson(res, 404, { error: 'room not found' });
      return;
    }
    if (room.players.p2) {
      sendJson(res, 409, { error: 'room is full' });
      return;
    }
    const positions = duelStartPositions();
    room.players.p2 = makeDuelPlayer('p2', body.name || 'Spieler 2', positions.p2);
    room.phase = 'playing';
    room.turn = null;
    room.lastEvent = `${room.players.p2.name} подключился. Оба игрока на стекле.`;
    setDuelAction(room, { type: 'join', actorId: 'p2' });
    markDuelChanged(room);
    sendJson(res, 200, { roomId: room.id, playerId: 'p2', state: publicDuelState(room) });
    return;
  }

  if (url.pathname === '/api/duel/action') {
    const room = getDuelRoom(body.roomId);
    if (!room) {
      sendJson(res, 404, { error: 'room not found' });
      return;
    }
    touchDuelPlayer(room, body.playerId);
    const result = applyDuelAction(room, body.playerId, body.action || {});
    sendJson(res, result.ok ? 200 : 400, result.ok ? result : { error: result.error, state: publicDuelState(room) });
    return;
  }

  if (url.pathname === '/api/duel/question') {
    const room = getDuelRoom(body.roomId);
    if (!room) {
      sendJson(res, 404, { error: 'room not found' });
      return;
    }
    touchDuelPlayer(room, body.playerId);
    const result = await nextDuelQuestion(room, body.playerId, body.line);
    sendJson(res, result.ok ? 200 : 400, result.ok ? result : { error: result.error, state: publicDuelState(room) });
    return;
  }

  sendJson(res, 404, { error: 'not found' });
}

function createServer(root = ROOT) {
  return http.createServer((req, res) => {
    if (req.url === '/healthz') {
      sendText(res, 200, 'ok');
      return;
    }

    if ((req.url || '').split('?')[0].startsWith('/api/duel/')) {
      handleDuelApi(req, res).catch((err) => {
        console.error('Duel endpoint failed', err);
        sendJson(res, 500, { error: 'internal server error' });
      });
      return;
    }

    if ((req.url || '').split('?')[0] === '/api/generate-questions') {
      handleGenerateQuestions(req, res).catch((err) => {
        console.error('Question generation endpoint failed', err);
        sendText(res, 500, 'internal server error');
      });
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendText(res, 405, 'method not allowed');
      return;
    }

    const filePath =
      resolveThreeVendor(req.url || '/') ||
      safeResolve(root, req.url || '/');
    if (!filePath) {
      sendText(res, 403, 'forbidden');
      return;
    }

    fs.stat(filePath, (statErr, stats) => {
      if (statErr || !stats.isFile()) {
        sendText(res, 404, 'not found');
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      const useGzip = COMPRESSIBLE.has(ext) && acceptsGzip(req);

      const headers = {
        'Cache-Control': cacheControlFor(filePath),
        'Content-Type': CONTENT_TYPES[ext] || 'application/octet-stream',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'SAMEORIGIN',
      };
      if (useGzip) {
        headers['Content-Encoding'] = 'gzip';
        headers['Vary'] = 'Accept-Encoding';
      } else {
        headers['Content-Length'] = stats.size;
      }
      res.writeHead(200, headers);

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const source = fs.createReadStream(filePath);
      if (useGzip) {
        source.pipe(zlib.createGzip({ level: 6 })).pipe(res);
      } else {
        source.pipe(res);
      }
    });
  });
}

if (require.main === module) {
  const port = Number(process.env.PORT) || DEFAULT_PORT;
  createServer().listen(port, '0.0.0.0', () => {
    console.log(`Nad Gorizontom web service listening on ${port}`);
  });
}

module.exports = { cacheControlFor, createServer, resolveThreeVendor, safeResolve };
