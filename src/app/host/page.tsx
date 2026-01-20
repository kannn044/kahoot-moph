"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function HostEntryPage() {
  const router = useRouter();
  const [pin, setPin] = useState("");
  const [hostKey, setHostKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);

    const normalizedPin = pin.replace(/\s+/g, "").slice(0, 12);
    const normalizedHostKey = hostKey.trim().slice(0, 64);

    if (!normalizedPin) {
      setError("Enter game PIN");
      return;
    }
    if (!normalizedHostKey) {
      setError("Enter host key");
      return;
    }

    router.push(
      `/host/${encodeURIComponent(normalizedPin)}?hostKey=${encodeURIComponent(
        normalizedHostKey,
      )}`,
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
        <h1 className="text-center text-3xl font-semibold tracking-tight">
          Host
        </h1>
        <p className="mt-2 text-center text-sm text-foreground/70">
          Enter PIN and host key.
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
              placeholder="123456"
              className="mt-2 w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-base outline-none focus:border-foreground/30"
            />
          </label>

          <label className="mt-4 block">
            <span className="text-sm text-foreground/70">Host key</span>
            <input
              value={hostKey}
              onChange={(e) => setHostKey(e.target.value)}
              placeholder="(from Save)"
              className="mt-2 w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 font-mono text-sm outline-none focus:border-foreground/30"
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
            Continue
          </button>
        </form>
      </main>
    </div>
  );
}
