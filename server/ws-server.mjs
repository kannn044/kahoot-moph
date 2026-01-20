import http from "node:http";
import { readFileSync } from "node:fs";
import { WebSocket, WebSocketServer } from "ws";

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 3001;
const ROOMS_JSON_PATH = new URL("../src/data/rooms.json", import.meta.url);

const INTERMISSION_MS = 12000;
const PRE_START_MS = 5000;

function loadAllowedPins() {
  const raw = readFileSync(ROOMS_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const pins = new Set();
  for (const room of parsed?.rooms ?? []) {
    if (typeof room?.pin === "string" && room.pin.trim().length > 0) {
      pins.add(room.pin.trim());
    }
  }
  return pins;
}

function loadRoomRecord(pin) {
  const raw = readFileSync(ROOMS_JSON_PATH, "utf8");
  const parsed = JSON.parse(raw);
  const roomsArr = Array.isArray(parsed?.rooms) ? parsed.rooms : [];
  return roomsArr.find((r) => typeof r?.pin === "string" && r.pin.trim() === pin) ?? null;
}

let allowedPins = loadAllowedPins();

/** @type {Map<string, Map<string, {id: string, nickname: string}>>} */
const rooms = new Map();

/** @type {Map<string, { hostId?: string, state: 'waiting'|'running'|'ended', quiz?: any, questionIndex: number, questionStartedAt?: number, questionEndsAt?: number, answeredByQuestion: Map<number, Set<string>>, scores: Map<string, number> }>} */
const games = new Map();

function listPlayers(pin) {
  const playersMap = rooms.get(pin);
  if (!playersMap) return [];
  return Array.from(playersMap.values()).map(({ id, nickname }) => ({ id, nickname }));
}

function listRealPlayers(pin) {
  return listPlayers(pin).filter((p) => p.nickname !== "(host)");
}

function broadcastRoom(pin) {
  const payload = JSON.stringify({ type: "room_update", pin, players: listRealPlayers(pin) });
  const wssRoom = rooms.get(pin);
  if (!wssRoom) return;
  for (const player of wssRoom.values()) {
    const ws = sockets.get(player.id);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function sendToRoom(pin, payloadObj) {
  const payload = JSON.stringify(payloadObj);
  const wssRoom = rooms.get(pin);
  if (!wssRoom) return;
  for (const player of wssRoom.values()) {
    const ws = sockets.get(player.id);
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}

function getOrCreateGame(pin) {
  const existing = games.get(pin);
  if (existing) return existing;
  const next = {
    hostId: undefined,
    state: "waiting",
    quiz: undefined,
    questionIndex: -1,
    questionStartedAt: undefined,
    questionEndsAt: undefined,
    answeredByQuestion: new Map(),
    scores: new Map(),
  };
  games.set(pin, next);
  return next;
}

function computeLeaderboard(pin) {
  const game = games.get(pin);
  if (!game) return [];
  return listRealPlayers(pin)
    .map((p) => ({
      id: p.id,
      nickname: p.nickname,
      score: game.scores.get(p.id) ?? 0,
    }))
    .sort((a, b) => b.score - a.score);
}

function computePoints({ correct, elapsedMs, durationMs }) {
  if (!correct) return 0;
  const base = 500;
  const bonus = 500;
  const t = Math.max(0, Math.min(1, 1 - elapsedMs / Math.max(1, durationMs)));
  return base + Math.floor(bonus * t);
}

function endQuestion(pin, questionIndex) {
  const game = games.get(pin);
  if (!game) return;
  if (game.state !== "running") return;
  if (game.questionIndex !== questionIndex) return;

  const leaderboard = computeLeaderboard(pin);
  const nextQuestionAt = Date.now() + INTERMISSION_MS;
  sendToRoom(pin, {
    type: "question_over",
    pin,
    questionIndex,
    nextQuestionAt,
    leaderboard,
    top3: leaderboard.slice(0, 3),
  });

  setTimeout(() => {
    const g = games.get(pin);
    if (!g) return;
    if (g.state !== "running") return;
    if (g.questionIndex !== questionIndex) return;
    startQuestion(pin);
  }, INTERMISSION_MS);
}

function startQuestion(pin) {
  const game = getOrCreateGame(pin);
  const quiz = game.quiz;
  const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
  const nextIndex = game.questionIndex + 1;
  if (nextIndex >= questions.length) {
    game.state = "ended";

    const leaderboard = computeLeaderboard(pin);
    sendToRoom(pin, { type: "game_over", pin, leaderboard, top3: leaderboard.slice(0, 3) });
    return;
  }

  const q = questions[nextIndex];
  const timerSeconds = typeof q?.timerSeconds === "number" ? q.timerSeconds : 10;
  const durationMs = Math.max(5000, Math.min(300000, Math.round(timerSeconds * 1000)));
  const startedAt = Date.now();
  const endsAt = startedAt + durationMs;

  game.state = "running";
  game.questionIndex = nextIndex;
  game.questionStartedAt = startedAt;
  game.questionEndsAt = endsAt;
  if (!game.answeredByQuestion.has(nextIndex)) game.answeredByQuestion.set(nextIndex, new Set());

  sendToRoom(pin, {
    type: "question",
    pin,
    questionIndex: nextIndex,
    totalQuestions: questions.length,
    text: String(q?.text ?? ""),
    choices: Array.isArray(q?.choices) ? q.choices : ["", "", "", ""],
    endsAt,
  });

  setTimeout(() => {
    endQuestion(pin, nextIndex);
  }, durationMs + 50);
}

function uniqueNickname(pin, desiredNickname) {
  const base = desiredNickname.trim().slice(0, 24) || "Player";
  const players = listPlayers(pin);
  if (!players.some((p) => p.nickname === base)) return base;
  for (let i = 2; i < 999; i++) {
    const candidate = `${base} ${i}`;
    if (!players.some((p) => p.nickname === candidate)) return candidate;
  }
  return `${base} ${Date.now() % 1000}`;
}

function makeId() {
  return Math.random().toString(36).slice(2, 10);
}

/** @type {Map<string, import('ws').WebSocket>} */
const sockets = new Map();

const server = http.createServer((req, res) => {
  if (req.url === "/health") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }
  if (req.url === "/reload") {
    allowedPins = loadAllowedPins();
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, pins: Array.from(allowedPins) }));
    return;
  }
  res.writeHead(404, { "content-type": "text/plain" });
  res.end("Not found");
});

const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  /** @type {{id?: string, pin?: string}} */
  const state = {};

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON" }));
      return;
    }

    if (msg?.type === "join") {
      const pin = typeof msg?.pin === "string" ? msg.pin.trim() : "";
      const nickname = typeof msg?.nickname === "string" ? msg.nickname : "";

      try {
        allowedPins = loadAllowedPins();
      } catch {
        // Keep existing cache if reload fails.
      }

      if (!allowedPins.has(pin)) {
        ws.send(JSON.stringify({ type: "error", code: "INVALID_PIN", message: "Invalid game PIN" }));
        return;
      }

      const id = makeId();
      state.id = id;
      state.pin = pin;

      const game = getOrCreateGame(pin);
      if (!game.scores.has(id)) game.scores.set(id, 0);

      const roomPlayers = rooms.get(pin) ?? new Map();
      rooms.set(pin, roomPlayers);

      const finalNickname = uniqueNickname(pin, nickname);
      roomPlayers.set(id, { id, nickname: finalNickname });
      sockets.set(id, ws);

      ws.send(JSON.stringify({ type: "welcome", id, pin, nickname: finalNickname, players: listRealPlayers(pin) }));
      broadcastRoom(pin);

      const existingGame = games.get(pin);
      if (existingGame?.state === "running" && typeof existingGame.questionEndsAt === "number") {
        const quiz = existingGame.quiz;
        const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
        const q = questions[existingGame.questionIndex];
        ws.send(
          JSON.stringify({
            type: "question",
            pin,
            questionIndex: existingGame.questionIndex,
            totalQuestions: questions.length,
            text: String(q?.text ?? ""),
            choices: Array.isArray(q?.choices) ? q.choices : ["", "", "", ""],
            endsAt: existingGame.questionEndsAt,
          }),
        );
      }
      return;
    }

    if (msg?.type === "host_join") {
      const pin = typeof msg?.pin === "string" ? msg.pin.trim() : "";
      const hostKey = typeof msg?.hostKey === "string" ? msg.hostKey.trim() : "";
      if (!pin || !hostKey) {
        ws.send(JSON.stringify({ type: "error", message: "Missing PIN or host key" }));
        return;
      }

      try {
        allowedPins = loadAllowedPins();
      } catch {
        // ignore
      }

      if (!allowedPins.has(pin)) {
        ws.send(JSON.stringify({ type: "error", code: "INVALID_PIN", message: "Invalid game PIN" }));
        return;
      }

      let record;
      try {
        record = loadRoomRecord(pin);
      } catch {
        record = null;
      }
      if (!record || record.hostKey !== hostKey) {
        ws.send(JSON.stringify({ type: "error", code: "HOST_KEY_INVALID", message: "Invalid host key" }));
        return;
      }

      const id = makeId();
      state.id = id;
      state.pin = pin;
      sockets.set(id, ws);

      const roomPlayers = rooms.get(pin) ?? new Map();
      rooms.set(pin, roomPlayers);
      roomPlayers.set(id, { id, nickname: "(host)" });

      const game = getOrCreateGame(pin);
      game.hostId = id;
      game.quiz = record.quiz;

      ws.send(
        JSON.stringify({
          type: "host_welcome",
          id,
          pin,
          players: listRealPlayers(pin),
          state: game.state,
          questionIndex: game.questionIndex,
        }),
      );
      broadcastRoom(pin);
      return;
    }

    if (msg?.type === "host_start") {
      const pin = typeof msg?.pin === "string" ? msg.pin.trim() : "";
      if (!pin || state.pin !== pin) {
        ws.send(JSON.stringify({ type: "error", message: "Invalid PIN" }));
        return;
      }
      const game = getOrCreateGame(pin);
      if (!state.id || game.hostId !== state.id) {
        ws.send(JSON.stringify({ type: "error", message: "Not host" }));
        return;
      }
      if (!game.quiz || !Array.isArray(game.quiz?.questions) || game.quiz.questions.length === 0) {
        ws.send(JSON.stringify({ type: "error", message: "No quiz found" }));
        return;
      }

      game.state = "running";
      game.questionIndex = -1;
      game.questionStartedAt = undefined;
      game.questionEndsAt = undefined;
      game.answeredByQuestion = new Map();
      // Reset scores for a fresh run.
      game.scores = new Map();
      for (const p of listRealPlayers(pin)) game.scores.set(p.id, 0);

      const startsAt = Date.now() + PRE_START_MS;
      sendToRoom(pin, { type: "starting", pin, startsAt });
      setTimeout(() => {
        const g = games.get(pin);
        if (!g) return;
        if (g.state !== "running") return;
        // If another start happened, ignore this timer.
        if (g.questionIndex !== -1) return;

        sendToRoom(pin, { type: "game_started", pin });
        startQuestion(pin);
      }, PRE_START_MS);
      return;
    }

    if (msg?.type === "answer") {
      const pin = typeof msg?.pin === "string" ? msg.pin.trim() : "";
      const questionIndex = typeof msg?.questionIndex === "number" ? msg.questionIndex : -1;
      const choiceIndex = typeof msg?.choiceIndex === "number" ? msg.choiceIndex : -1;
      if (!pin || !state.id || state.pin !== pin) return;

      const game = games.get(pin);
      if (!game || game.state !== "running") return;
      if (questionIndex !== game.questionIndex) return;
      if (choiceIndex < 0 || choiceIndex > 3) return;
      if (typeof game.questionStartedAt !== "number" || typeof game.questionEndsAt !== "number") return;

      const answeredSet = game.answeredByQuestion.get(questionIndex) ?? new Set();
      if (answeredSet.has(state.id)) return;
      answeredSet.add(state.id);
      game.answeredByQuestion.set(questionIndex, answeredSet);

      const quiz = game.quiz;
      const questions = Array.isArray(quiz?.questions) ? quiz.questions : [];
      const q = questions[questionIndex];
      const correctIndex = typeof q?.correctIndex === "number" ? q.correctIndex : -1;
      const correct = choiceIndex === correctIndex;
      const now = Date.now();
      const elapsedMs = now - game.questionStartedAt;
      const durationMs = game.questionEndsAt - game.questionStartedAt;
      const delta = computePoints({ correct, elapsedMs, durationMs });
      const nextScore = (game.scores.get(state.id) ?? 0) + delta;
      game.scores.set(state.id, nextScore);

      ws.send(
        JSON.stringify({
          type: "answer_result",
          pin,
          questionIndex,
          correct,
          delta,
          total: nextScore,
        }),
      );
      return;
    }

    ws.send(JSON.stringify({ type: "error", message: "Unknown message type" }));
  });

  ws.on("close", () => {
    const { id, pin } = state;
    if (!id || !pin) return;

    sockets.delete(id);

    const roomPlayers = rooms.get(pin);
    if (roomPlayers) {
      roomPlayers.delete(id);
      if (roomPlayers.size === 0) rooms.delete(pin);
      else broadcastRoom(pin);
    }

    const game = games.get(pin);
    if (game) {
      game.scores.delete(id);
      const answered = game.answeredByQuestion.get(game.questionIndex);
      if (answered) answered.delete(id);
      if (game.hostId === id) {
        game.hostId = undefined;
        if (game.state === "running") {
          game.state = "waiting";
          game.questionIndex = -1;
          game.questionStartedAt = undefined;
          game.questionEndsAt = undefined;
          sendToRoom(pin, { type: "host_left", pin });
        }
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`WS server listening on ws://localhost:${PORT}`);
});
