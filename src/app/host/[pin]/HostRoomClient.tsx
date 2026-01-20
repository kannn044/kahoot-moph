"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import type { QuizDraft } from "@/lib/quiz";
import { useFlipList } from "@/lib/useFlipList";
import { withBasePath } from "@/lib/public-base-path";
import AnimatedNumber from "@/components/AnimatedNumber";

type Room = {
  pin: string;
  title: string;
  quiz?: QuizDraft;
};

type Player = { id: string; nickname: string };

type HostMessage =
  | ({
      serverNow?: number;
    } &
      (
        | {
            type: "host_welcome";
            id: string;
            pin: string;
            players: Player[];
            state: "waiting" | "running" | "ended";
            questionIndex: number;
          }
        | { type: "room_update"; pin: string; players: Player[] }
        | { type: "starting"; pin: string; startsAt: number }
        | { type: "game_started"; pin: string }
        | {
            type: "question";
            pin: string;
            questionIndex: number;
            totalQuestions: number;
            text: string;
            choices: [string, string, string, string];
            endsAt: number;
          }
        | {
            type: "question_over";
            pin: string;
            questionIndex: number;
            nextQuestionAt: number;
            leaderboard: Array<{ id: string; nickname: string; score: number }>;
            top3: Array<{ id: string; nickname: string; score: number }>;
          }
        | {
            type: "game_over";
            pin: string;
            leaderboard: Array<{ id: string; nickname: string; score: number }>;
            top3: Array<{ id: string; nickname: string; score: number }>;
          }
        | { type: "error"; code?: string; message: string }
      ));

function getWsUrl() {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl.trim();

  if (typeof window === "undefined") return "ws://localhost:3001";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://localhost:3001`;
}

export default function HostRoomClient({
  pin,
  hostKeyParam,
}: {
  pin: string;
  hostKeyParam: string;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);

  const [players, setPlayers] = useState<Player[]>([]);
  const [wsStatus, setWsStatus] = useState<"connecting" | "connected" | "error">(
    "connecting",
  );
  const [hostWsError, setHostWsError] = useState<string | null>(null);
  const [question, setQuestion] = useState<{
    questionIndex: number;
    totalQuestions: number;
    text: string;
    choices?: [string, string, string, string];
    endsAt: number;
  } | null>(null);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ id: string; nickname: string; score: number }> | null
  >(null);
  const [leaderboardTitle, setLeaderboardTitle] = useState<string | null>(null);
  const [nextQuestionAt, setNextQuestionAt] = useState<number | null>(null);
  const [gameStartsAt, setGameStartsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [starting, setStarting] = useState(false);

  const hostKey = useMemo(() => hostKeyParam.trim(), [hostKeyParam]);

  const { containerRef: leaderboardRef } = useFlipList(
    leaderboard ?? [],
    (p) => p.id,
    { durationMs: 3600 },
  );

  const wsRef = useRef<WebSocket | null>(null);
  const prevScoresRef = useRef<Map<string, number>>(new Map());
  const serverOffsetMsRef = useRef<number>(0);

  useEffect(() => {
    const id = window.setInterval(
      () => setNowMs(Date.now() + serverOffsetMsRef.current),
      200,
    );
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setStatus("loading");
      setError(null);
      try {
        const res = await fetch(
          withBasePath(
            `/api/rooms?pin=${encodeURIComponent(pin)}&hostKey=${encodeURIComponent(hostKey)}`
          ),
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => null)) as
          | { room?: Room; error?: string }
          | null;

        if (!res.ok || !json || !json.room) {
          const msg = json?.error === "NOT_FOUND" ? "Room not found" : "Invalid host key";
          if (!cancelled) {
            setStatus("error");
            setError(msg);
          }
          return;
        }

        if (!cancelled) {
          setRoom(json.room);
          setStatus("ready");
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setError("Failed to load room");
        }
      }
    }

    if (!pin || !hostKey) {
      setStatus("error");
      setError("Missing PIN or host key");
      return;
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [pin, hostKey]);

  useEffect(() => {
    if (status !== "ready") return;
    if (!pin || !hostKey) return;

    setWsStatus("connecting");
    setHostWsError(null);
    setLeaderboard(null);
    setLeaderboardTitle(null);

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "host_join", pin, hostKey }));
    });

    ws.addEventListener("message", (event) => {
      let msg: HostMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (typeof msg.serverNow === "number" && Number.isFinite(msg.serverNow)) {
        serverOffsetMsRef.current = msg.serverNow - Date.now();
        setNowMs(Date.now() + serverOffsetMsRef.current);
      }

      if (msg.type === "host_welcome") {
        setWsStatus("connected");
        setPlayers(msg.players);
        return;
      }

      if (msg.type === "room_update") {
        setPlayers(msg.players.filter((p) => p.nickname !== "(host)"));
        return;
      }

      if (msg.type === "starting") {
        setLeaderboard(null);
        setLeaderboardTitle(null);
        setQuestion(null);
        setNextQuestionAt(null);
        setGameStartsAt(msg.startsAt);
        return;
      }

      if (msg.type === "game_started") {
        setLeaderboard(null);
        setLeaderboardTitle(null);
        setQuestion(null);
        setNextQuestionAt(null);
        setGameStartsAt(null);
        prevScoresRef.current = new Map();
        return;
      }

      if (msg.type === "question") {
        setLeaderboard(null);
        setLeaderboardTitle(null);
        setNextQuestionAt(null);
        setGameStartsAt(null);
        setQuestion({
          questionIndex: msg.questionIndex,
          totalQuestions: msg.totalQuestions,
          text: msg.text,
          choices: msg.choices,
          endsAt: msg.endsAt,
        });
        return;
      }

      if (msg.type === "question_over") {
        setQuestion(null);
        setLeaderboard(msg.leaderboard);
        setLeaderboardTitle(`Ranking (Q${msg.questionIndex + 1})`);
        setNextQuestionAt(msg.nextQuestionAt);
        setGameStartsAt(null);
        return;
      }

      if (msg.type === "game_over") {
        setQuestion(null);
        setLeaderboard(msg.leaderboard);
        setLeaderboardTitle("Final ranking");
        setNextQuestionAt(null);
        setGameStartsAt(null);
        return;
      }

      if (msg.type === "error") {
        setWsStatus("error");
        setHostWsError(msg.message);
      }
    });

    ws.addEventListener("close", () => {
      setWsStatus((prev) => (prev === "error" ? prev : "connecting"));
    });

    ws.addEventListener("error", () => {
      setWsStatus("error");
      setHostWsError("WebSocket connection failed");
    });

    return () => {
      ws.close();
    };
  }, [status, pin, hostKey]);

  const secondsToNext = useMemo(() => {
    if (!leaderboard) return null;
    if (typeof nextQuestionAt !== "number") return null;
    return Math.max(0, Math.ceil((nextQuestionAt - nowMs) / 1000));
  }, [leaderboard, nextQuestionAt, nowMs]);

  const secondsToStart = useMemo(() => {
    if (typeof gameStartsAt !== "number") return null;
    return Math.max(0, Math.ceil((gameStartsAt - nowMs) / 1000));
  }, [gameStartsAt, nowMs]);

  useEffect(() => {
    if (!leaderboard) return;
    const next = new Map(prevScoresRef.current);
    for (const p of leaderboard) next.set(p.id, p.score);
    prevScoresRef.current = next;
  }, [leaderboard]);

  const secondsLeft = useMemo(() => {
    if (!question) return null;
    return Math.max(0, Math.ceil((question.endsAt - nowMs) / 1000));
  }, [question, nowMs]);

  async function onStart() {
    setStarting(true);
    try {
      wsRef.current?.send(JSON.stringify({ type: "host_start", pin }));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
        <header className="mb-8">
          <div className="text-sm text-foreground/70">Hosting PIN</div>
          <div className="text-3xl font-semibold tracking-tight">{pin}</div>
          <div className="mt-2 text-foreground/70">{room?.title ?? ""}</div>
        </header>

        <section className="rounded-2xl border border-foreground/10 bg-background p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-foreground/70">Status</div>
              <div className="mt-1 text-sm font-medium">
                {status === "loading" && "Loading…"}
                {status === "ready" && "Ready"}
                {status === "error" && "Error"}
                {status === "ready" && wsStatus === "connecting" && " (WS connecting…)"}
                {status === "ready" && wsStatus === "connected" && " (WS connected)"}
              </div>
            </div>

            <button
              type="button"
              className="h-11 rounded-xl bg-foreground px-4 text-sm text-background disabled:opacity-50"
              onClick={onStart}
              disabled={
                status !== "ready" ||
                wsStatus !== "connected" ||
                starting ||
                secondsToStart !== null
              }
            >
              {starting ? "Starting…" : "Start"}
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-xl border border-foreground/10 bg-background p-4 text-sm">
              <div className="font-medium">{error}</div>
              <div className="mt-2">
                <Link className="underline" href="/host">
                  Back
                </Link>
              </div>
            </div>
          ) : null}

          {hostWsError ? (
            <div className="mt-4 rounded-xl border border-foreground/10 bg-background p-4 text-sm">
              <div className="font-medium">{hostWsError}</div>
            </div>
          ) : null}

          {status === "ready" ? (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-foreground/70">Waiting list</div>
                <div className="text-sm font-medium">{players.length}</div>
              </div>

              <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {players.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-foreground/10 px-3 py-2 text-sm"
                  >
                    {p.nickname}
                  </li>
                ))}
              </ul>

              <div className="mt-6 text-sm text-foreground/70">
                Questions: {room?.quiz?.questions?.length ?? 0}
              </div>

              {question ? (
                <div className="mt-6 rounded-2xl border border-foreground/10 bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm text-foreground/70">
                      Question {question.questionIndex + 1} / {question.totalQuestions}
                    </div>
                    <div className="text-sm font-semibold">
                      {secondsLeft ?? "—"}s
                    </div>
                  </div>
                  <div className="mt-2 text-base font-semibold">{question.text}</div>

                  <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {(question.choices ?? ["", "", "", ""]).map((choice, idx) => (
                      <div
                        key={idx}
                        className="rounded-xl border border-foreground/10 bg-background px-3 py-2 text-sm"
                      >
                        <span className="mr-2 font-mono text-foreground/70">
                          {String.fromCharCode(65 + idx)}
                        </span>
                        {choice}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}

              {secondsToStart !== null ? (
                <div className="mt-6 rounded-2xl border border-foreground/10 bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold">Starting…</div>
                    <div className="text-sm font-semibold">{secondsToStart}s</div>
                  </div>
                  <div className="mt-2 text-sm text-foreground/70">
                    Get ready for the first question
                  </div>
                </div>
              ) : null}

              {leaderboard ? (
                <div className="mt-6 rounded-2xl border border-foreground/10 bg-background p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="text-sm font-semibold">
                      {leaderboardTitle ?? "Ranking"}
                    </div>
                    <div className="text-xs text-foreground/60">
                      {secondsToNext !== null ? `Next question in ${secondsToNext}s` : ""}
                    </div>
                  </div>

                  <div className="mt-3 fireworks">
                    <div className="firework" />
                    <div className="firework" />
                    <div className="firework" />
                    <div className="firework" />
                    <div className="firework" />
                    <div className="firework" />
                  </div>

                  <div ref={leaderboardRef} className="mt-3 grid grid-cols-1 gap-2">
                    {leaderboard.map((p, idx) => (
                      <div
                        key={p.id}
                        data-flip-id={p.id}
                        className={`flex items-center justify-between rounded-xl border border-foreground/10 px-3 py-2 text-sm transition-all ${
                          idx === 0
                            ? "slow-bounce"
                            : idx === 1
                              ? "slow-pulse"
                              : idx === 2
                                ? "slow-pulse"
                                : ""
                        }`}
                      >
                        <div className="font-medium">
                          #{idx + 1} {p.nickname}
                        </div>
                        <div className="font-mono">
                          <AnimatedNumber
                            value={p.score}
                            from={prevScoresRef.current.get(p.id) ?? 0}
                            durationMs={2000}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
