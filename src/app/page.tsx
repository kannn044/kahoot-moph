"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type RoomListItem = { pin: string; title: string };

export default function Home() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [nickname, setNickname] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [rooms, setRooms] = useState<RoomListItem[] | null>(null);
  const [roomsError, setRoomsError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadRooms() {
      try {
        setRoomsError(null);
        const res = await fetch("/api/rooms", { cache: "no-store" });
        if (!res.ok) throw new Error("FAILED");
        const data = (await res.json()) as { rooms?: RoomListItem[] };
        const nextRooms = Array.isArray(data.rooms) ? data.rooms : [];
        if (!cancelled) setRooms(nextRooms);
      } catch {
        if (!cancelled) setRoomsError("Failed to load rooms");
      }
    }

    void loadRooms();
    return () => {
      cancelled = true;
    };
  }, []);

  const knownPins = useMemo(
    () => new Set((rooms ?? []).map((r) => r.pin)),
    [rooms],
  );

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const normalizedPin = pin.replace(/\s+/g, "").slice(0, 12);
    const normalizedNickname = nickname.trim().slice(0, 24);

    if (!normalizedPin) {
      setError("Enter game PIN");
      return;
    }

    if (roomsError) {
      setError("Failed to load rooms");
      return;
    }

    if (!rooms) {
      setError("Loading rooms…");
      return;
    }

    if (!knownPins.has(normalizedPin)) {
      setError("Invalid game PIN");
      return;
    }

    if (!normalizedNickname) {
      setError("Enter nickname");
      return;
    }

    router.push(
      `/lobby/${encodeURIComponent(normalizedPin)}?name=${encodeURIComponent(normalizedNickname)}`,
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight">
          Join game
        </h1>
        <p className="mt-2 text-center text-sm text-foreground/70">
          Enter the game PIN and your nickname.
        </p>

        <form
          onSubmit={onSubmit}
          className="mt-8 rounded-2xl border border-foreground/10 bg-background p-5"
        >
          <label className="block">
            <span className="text-sm text-foreground/70">Game PIN</span>
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="123456"
              className="mt-2 w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-base outline-none focus:border-foreground/30"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm text-foreground/70">Nickname</span>
            <input
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              autoComplete="nickname"
              placeholder="Player"
              className="mt-2 w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-base outline-none focus:border-foreground/30"
            />
          </label>

          {error ? (
            <div className="mt-4 rounded-xl border border-foreground/10 px-4 py-3 text-sm">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            className="mt-5 flex h-12 w-full items-center justify-center rounded-xl bg-foreground px-5 text-background"
          >
            Join
          </button>

          <div className="mt-4 text-xs text-foreground/60">
            Demo pins: {rooms ? rooms.map((r) => r.pin).join(", ") : "Loading…"}
          </div>
        </form>
      </main>
    </div>
  );
}
