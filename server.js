const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const zlib = require('node:zlib');
const { handleGenerateQuestions } = require('./question-api');

const DEFAULT_PORT = 3000;
const ROOT = __dirname;
const THREE_ROOT = path.join(ROOT, 'node_modules', 'three');
const DUEL_BOARD_SIZE = 7;
const DUEL_ROOM_TTL_MS = 1000 * 60 * 60 * 4;
const duelRooms = new Map();

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
    players: room.players,
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
  return {
    id,
    name: String(name || (id === 'p1' ? 'Spieler 1' : 'Spieler 2')).slice(0, 24),
    lives: 3,
    pos,
    shaky: false,
    guarded: false,
    connectedAt: Date.now(),
  };
}

function createDuelRoom(settings = {}, hostName = '') {
  cleanupDuelRooms();
  const id = makeRoomId();
  const positions = duelStartPositions();
  const room = {
    id,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    revision: 1,
    phase: 'waiting',
    turn: 'p1',
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

function resetDuelRound(room) {
  const positions = duelStartPositions();
  if (room.players.p1) room.players.p1.pos = { ...positions.p1 };
  if (room.players.p2) room.players.p2.pos = { ...positions.p2 };
  if (room.players.p1) room.players.p1.shaky = false;
  if (room.players.p2) room.players.p2.shaky = false;
  if (room.players.p1) room.players.p1.guarded = false;
  if (room.players.p2) room.players.p2.guarded = false;
}

function finishDuelTurn(room, nextTurn) {
  room.turn = nextTurn || otherDuelPlayerId(room.turn);
  room.revision += 1;
  touchDuelRoom(room);
}

function handleDuelFall(room, fallenId, attackerId) {
  const fallen = room.players[fallenId];
  if (!fallen) return;

  fallen.lives = Math.max(0, fallen.lives - 1);
  if (fallen.lives <= 0) {
    room.phase = 'finished';
    room.winner = attackerId || otherDuelPlayerId(fallenId);
    room.lastEvent = `${fallen.name} сорвался с края. Дуэль окончена.`;
    return;
  }

  room.lastEvent = `${fallen.name} сорвался с края. Раунд начинается заново.`;
  resetDuelRound(room);
}

function moveDuelPlayer(room, playerId, target, maxDistance) {
  const player = room.players[playerId];
  const opponent = room.players[otherDuelPlayerId(playerId)];
  if (!player || !isInsideBoard(target)) return false;
  if (opponent && sameCell(opponent.pos, target)) return false;
  if (duelDistance(player.pos, target) < 1 || duelDistance(player.pos, target) > maxDistance) return false;

  player.pos = { row: target.row, col: target.col };
  player.guarded = false;
  room.lastEvent = `${player.name} меняет позицию.`;
  return true;
}

function guardDuelPlayer(room, playerId) {
  const player = room.players[playerId];
  if (!player) return false;
  player.guarded = true;
  player.shaky = false;
  room.lastEvent = `${player.name} упирается в стекло и готовит плечо к ответному удару.`;
  return true;
}

function swapDuelPlayers(room, playerId, maxDistance) {
  const player = room.players[playerId];
  const opponent = room.players[otherDuelPlayerId(playerId)];
  if (!player || !opponent) return false;
  if (duelDistance(player.pos, opponent.pos) < 1 || duelDistance(player.pos, opponent.pos) > maxDistance) return false;

  const playerPos = { ...player.pos };
  player.pos = { ...opponent.pos };
  opponent.pos = playerPos;
  player.guarded = false;
  opponent.guarded = false;
  room.lastEvent = `${player.name} меняет угол атаки и оказывается на месте соперника.`;
  return true;
}

function pushDuelPlayer(room, attackerId, distance) {
  const attacker = room.players[attackerId];
  const defenderId = otherDuelPlayerId(attackerId);
  const defender = room.players[defenderId];
  if (!attacker || !defender || duelDistance(attacker.pos, defender.pos) !== 1) return false;

  attacker.guarded = false;
  let pushDistance = Math.max(1, Math.min(2, Number(distance) || 1));
  if (defender.guarded) {
    defender.guarded = false;
    defender.shaky = false;
    room.lastEvent = `${defender.name} выдерживает толчок и не отдаёт край.`;
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
    handleDuelFall(room, defenderId, attackerId);
    return true;
  }

  defender.pos = target;
  room.lastEvent = `${attacker.name} отталкивает ${defender.name}.`;
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
      mover.pos = pos;
      return true;
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
  } else if (correctBefore === 1) {
    autoStepToward(room, opponentId, playerId);
    room.lastEvent = `${player.name} сорвал серию. ${opponent.name} получает короткий шаг.`;
  } else {
    if (duelDistance(player.pos, opponent.pos) === 1) {
      pushDuelPlayer(room, opponentId, 1);
      if (room.phase !== 'finished') {
        room.lastEvent = `${player.name} рискнул слишком глубоко. ${opponent.name} отвечает толчком.`;
      }
    } else {
      autoStepToward(room, opponentId, playerId);
      room.lastEvent = `${player.name} теряет почти готовый ход. ${opponent.name} сокращает дистанцию.`;
    }
  }
  return true;
}

function applyDuelAction(room, playerId, action = {}) {
  if (!room.players[playerId]) return { ok: false, error: 'unknown player' };
  if (room.phase !== 'playing') return { ok: false, error: 'room is not playing' };
  if (room.turn !== playerId) return { ok: false, error: 'not your turn' };

  let changed = false;
  if (action.type === 'move') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    const maxDistance = power >= 2 ? 2 : 1;
    changed = moveDuelPlayer(room, playerId, action.target, maxDistance);
  } else if (action.type === 'push') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    const grammarPush = action.line === 'grammar' && power >= 2;
    changed = pushDuelPlayer(room, playerId, grammarPush || power >= 3 ? 2 : 1);
  } else if (action.type === 'swap') {
    const power = Math.max(1, Math.min(3, Number(action.power) || 1));
    changed = power >= 2 && swapDuelPlayers(room, playerId, 2);
  } else if (action.type === 'guard') {
    changed = guardDuelPlayer(room, playerId);
  } else if (action.type === 'penalty') {
    changed = applyDuelPenalty(room, playerId, Math.max(0, Math.min(2, Number(action.correctBefore) || 0)));
  }

  if (!changed) return { ok: false, error: 'illegal action' };
  if (room.phase !== 'finished') finishDuelTurn(room, otherDuelPlayerId(playerId));
  else {
    room.revision += 1;
    touchDuelRoom(room);
  }
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
    room.lastEvent = `${room.players.p2.name} подключился. Ходит ${room.players.p1.name}.`;
    finishDuelTurn(room, 'p1');
    sendJson(res, 200, { roomId: room.id, playerId: 'p2', state: publicDuelState(room) });
    return;
  }

  if (url.pathname === '/api/duel/action') {
    const room = getDuelRoom(body.roomId);
    if (!room) {
      sendJson(res, 404, { error: 'room not found' });
      return;
    }
    const result = applyDuelAction(room, body.playerId, body.action || {});
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
