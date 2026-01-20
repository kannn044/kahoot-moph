"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useFlipList } from "@/lib/useFlipList";
import AnimatedNumber from "@/components/AnimatedNumber";

type Player = { id: string; nickname: string };

type ServerMessage =
  | {
      type: "welcome";
      id: string;
      pin: string;
      nickname: string;
      players: Player[];
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
      type: "answer_result";
      pin: string;
      questionIndex: number;
      correct: boolean;
      delta: number;
      total: number;
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
  | { type: "error"; code?: string; message: string };

function getWsUrl() {
  const envUrl = process.env.NEXT_PUBLIC_WS_URL;
  if (envUrl && envUrl.trim().length > 0) return envUrl.trim();

  if (typeof window === "undefined") return "ws://localhost:3001";
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  return `${protocol}://localhost:3001`;
}

export default function LobbyClient({
  pin,
  nicknameParam,
}: {
  pin: string;
  nicknameParam: string;
}) {
  const [roomTitle, setRoomTitle] = useState<string>("Lobby");
  const [roomLookupError, setRoomLookupError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRoomTitle() {
      try {
        setRoomLookupError(null);
        const res = await fetch(`/api/rooms?pin=${encodeURIComponent(pin)}`);
        if (res.status === 404) {
          if (!cancelled) setRoomLookupError("Invalid game PIN");
          return;
        }
        if (!res.ok) throw new Error("FAILED");
        const data = (await res.json()) as { room?: { title?: string } };
        const title = data.room?.title;
        if (!cancelled && typeof title === "string" && title.trim().length > 0) {
          setRoomTitle(title);
        }
      } catch {
        if (!cancelled) setRoomLookupError(null);
      }
    }

    void loadRoomTitle();
    return () => {
      cancelled = true;
    };
  }, [pin]);

  const joinError = useMemo(() => {
    if (roomLookupError) return roomLookupError;

    const nickname = nicknameParam.trim();
    if (!nickname) return "Missing nickname";

    return null;
  }, [roomLookupError, nicknameParam]);

  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting",
  );
  const [error, setError] = useState<string | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [selfNickname, setSelfNickname] = useState<string>(nicknameParam);

  const [question, setQuestion] = useState<{
    questionIndex: number;
    totalQuestions: number;
    text: string;
    choices: [string, string, string, string];
    endsAt: number;
  } | null>(null);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [answerFeedback, setAnswerFeedback] = useState<string | null>(null);
  const [score, setScore] = useState<number>(0);
  const [leaderboard, setLeaderboard] = useState<
    Array<{ id: string; nickname: string; score: number }> | null
  >(null);
  const [leaderboardTitle, setLeaderboardTitle] = useState<string | null>(null);
  const [nextQuestionAt, setNextQuestionAt] = useState<number | null>(null);
  const [gameStartsAt, setGameStartsAt] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  const { containerRef: leaderboardRef } = useFlipList(
    leaderboard ?? [],
    (p) => p.id,
    { durationMs: 3600 },
  );

  const wsRef = useRef<WebSocket | null>(null);
  const prevScoresRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (joinError) return;

    const nickname = nicknameParam.trim();

    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.addEventListener("open", () => {
      ws.send(JSON.stringify({ type: "join", pin, nickname }));
    });

    ws.addEventListener("message", (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(event.data));
      } catch {
        return;
      }

      if (msg.type === "welcome") {
        setStatus("connected");
        setPlayers(msg.players);
        setSelfNickname(msg.nickname);
        setAnswerFeedback(null);
        setScore(0);
        prevScoresRef.current = new Map();
        return;
      }

      if (msg.type === "room_update") {
        setPlayers(msg.players);
        return;
      }

      if (msg.type === "starting") {
        setQuestion(null);
        setSelectedChoice(null);
        setAnswerFeedback(null);
        setLeaderboard(null);
        setLeaderboardTitle(null);
        setNextQuestionAt(null);
        setGameStartsAt(msg.startsAt);
        return;
      }

      if (msg.type === "game_started") {
        setQuestion(null);
        setSelectedChoice(null);
        setAnswerFeedback(null);
        setLeaderboard(null);
        setLeaderboardTitle(null);
        setNextQuestionAt(null);
        setGameStartsAt(null);
        setScore(0);
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
        setSelectedChoice(null);
        setAnswerFeedback(null);
        return;
      }

      if (msg.type === "answer_result") {
        setScore(msg.total);
        setAnswerFeedback(
          msg.correct ? `Correct (+${msg.delta})` : "Wrong (+0)",
        );
        return;
      }

      if (msg.type === "question_over") {
        setQuestion(null);
        setSelectedChoice(null);
        setAnswerFeedback(null);
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
        setStatus("error");
        setError(msg.message);
      }
    });

    ws.addEventListener("close", () => {
      setStatus((prev) => {
        if (prev === "error") return prev;
        return "connecting";
      });
    });

    ws.addEventListener("error", () => {
      setStatus("error");
      setError("WebSocket connection failed");
    });

    return () => {
      ws.close();
    };
  }, [pin, nicknameParam, joinError]);

  useEffect(() => {
    if (
      !question &&
      !(leaderboard && typeof nextQuestionAt === "number") &&
      !(typeof gameStartsAt === "number")
    )
      return;
    const id = window.setInterval(() => setNowMs(Date.now()), 200);
    return () => window.clearInterval(id);
  }, [question, leaderboard, nextQuestionAt, gameStartsAt]);

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

  function sendAnswer(choiceIndex: number) {
    if (!question) return;
    if (selectedChoice !== null) return;
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    setSelectedChoice(choiceIndex);
    wsRef.current.send(
      JSON.stringify({
        type: "answer",
        pin,
        questionIndex: question.questionIndex,
        choiceIndex,
      }),
    );
  }

  const effectiveStatus = joinError ? "error" : status;
  const effectiveError = joinError ?? error;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col px-6 py-10">
        <header className="mb-8">
          <div className="text-sm text-foreground/70">Game PIN</div>
          <div className="text-3xl font-semibold tracking-tight">{pin}</div>
          <div className="mt-2 text-foreground/70">{roomTitle}</div>
        </header>

        <section className="rounded-2xl border border-foreground/10 bg-background p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-sm text-foreground/70">You are</div>
              <div className="text-lg font-semibold">{selfNickname || "—"}</div>
              <div className="mt-1 text-xs text-foreground/60">Score: {score}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-foreground/70">Status</div>
              <div className="text-sm font-medium">
                {effectiveStatus === "connecting" && "Connecting…"}
                {effectiveStatus === "connected" && "Connected"}
                {effectiveStatus === "error" && "Error"}
              </div>
            </div>
          </div>

          {effectiveError ? (
            <div className="mt-4 rounded-xl border border-foreground/10 bg-background p-4 text-sm">
              <div className="font-medium">{effectiveError}</div>
              <div className="mt-2">
                <Link className="underline" href="/">
                  Back to join
                </Link>
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
          ) : question ? (
            <div className="mt-6">
              <div className="flex items-center justify-between">
                <div className="text-sm text-foreground/70">
                  Question {question.questionIndex + 1} / {question.totalQuestions}
                </div>
                <div className="text-sm font-semibold">{secondsLeft ?? "—"}s</div>
              </div>
              <div className="mt-2 text-base font-semibold">{question.text}</div>

              <div className="mt-4 grid grid-cols-1 gap-2">
                {question.choices.map((c, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendAnswer(idx)}
                    disabled={selectedChoice !== null || (secondsLeft ?? 0) <= 0}
                    className={`rounded-xl border border-foreground/10 px-4 py-3 text-left text-sm transition-colors disabled:opacity-50 ${
                      selectedChoice === idx ? "bg-foreground/5" : "hover:bg-foreground/5"
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {answerFeedback ? (
                <div className="mt-4 rounded-xl border border-foreground/10 px-4 py-3 text-sm">
                  {answerFeedback}
                </div>
              ) : null}
            </div>
          ) : secondsToStart !== null ? (
            <div className="mt-6 rounded-2xl border border-foreground/10 bg-background p-4">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-semibold">Starting…</div>
                <div className="text-sm font-semibold">{secondsToStart}s</div>
              </div>
              <div className="mt-2 text-sm text-foreground/70">
                Get ready for the first question
              </div>
            </div>
          ) : (
            <>
              <div className="mt-6 flex items-center justify-between">
                <div className="text-sm text-foreground/70">Players</div>
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
                Waiting for the host to start…
              </div>
            </>
          )}
        </section>

        <footer className="mt-8 text-center text-xs text-foreground/60">
          Local multiplayer demo
        </footer>
      </main>
    </div>
  );
}
