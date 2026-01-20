"use client";

import { useMemo, useState } from "react";
import {
  clampTimerSeconds,
  createQuestionSeed,
  normalizeQuestion,
  type QuizQuestion,
  validateQuizDraft,
} from "@/lib/quiz";
import { withBasePath } from "@/lib/public-base-path";

function QuestionRow({
  label,
  selected,
  onSelect,
  onDelete,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm ${
        selected
          ? "border-foreground/30 bg-foreground/5"
          : "border-foreground/10"
      }`}
    >
      <button type="button" className="flex-1 text-left" onClick={onSelect}>
        {label}
      </button>
      <button
        type="button"
        className="rounded-lg px-2 py-1 text-xs hover:bg-foreground/5"
        onClick={onDelete}
      >
        Delete
      </button>
    </div>
  );
}

export default function CreateQuizPage() {
  const [topic, setTopic] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([createQuestionSeed()]);
  const [selectedId, setSelectedId] = useState<string>(questions[0]!.id);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedPin, setSavedPin] = useState<string | null>(null);
  const [savedHostKey, setSavedHostKey] = useState<string | null>(null);

  const selected = useMemo(
    () => questions.find((q) => q.id === selectedId) ?? null,
    [questions, selectedId],
  );

  const selectedIndex = useMemo(
    () => questions.findIndex((q) => q.id === selectedId),
    [questions, selectedId],
  );

  const validationError = useMemo(() => {
    return validateQuizDraft({ topic, questions });
  }, [topic, questions]);

  function updateSelected(patch: Partial<QuizQuestion>) {
    if (!selected) return;
    setQuestions((prev) =>
      prev.map((q) => (q.id === selected.id ? ({ ...q, ...patch } as QuizQuestion) : q)),
    );
  }

  function onAddQuestion() {
    const next = createQuestionSeed();
    setQuestions((prev) => [...prev, next]);
    setSelectedId(next.id);
  }

  function onDeleteQuestion(id: string) {
    setQuestions((prev) => {
      const next = prev.filter((q) => q.id !== id);
      const fallback = next[0]?.id;
      setSelectedId((current) => {
        if (current !== id) return current;
        return fallback ?? "";
      });
      return next.length > 0 ? next : [createQuestionSeed()];
    });
  }

  function onNormalizeSelected() {
    if (!selected) return;
    const normalized = normalizeQuestion(selected);
    setQuestions((prev) => prev.map((q) => (q.id === selected.id ? normalized : q)));
  }

  async function onSave() {
    setSaveError(null);

    const draft = { topic, questions: questions.map((q) => normalizeQuestion(q)) };
    const err = validateQuizDraft(draft);
    if (err) {
      setSaveError(err);
      return;
    }

    setSaving(true);
    try {
      const res = await fetch(withBasePath("/api/rooms"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: draft.topic,
          quiz: draft,
        }),
      });
      const json = (await res.json().catch(() => null)) as
        | { ok: true; pin: string; hostKey: string; title: string }
        | { ok?: false; error?: string }
        | null;

      if (!res.ok || !json || ("ok" in json && json.ok === false)) {
        setSaveError((json && "error" in json && json.error) || "Save failed");
        return;
      }

      if ("pin" in json && "hostKey" in json) {
        setSavedPin(json.pin);
        setSavedHostKey(json.hostKey);
      }
    } catch {
      setSaveError("Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] bg-background text-foreground">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-6 px-6 py-6 md:grid-cols-[280px_1fr]">
        <aside className="rounded-2xl border border-foreground/10 bg-background p-4">
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Questions</div>
            <button
              type="button"
              className="rounded-lg bg-foreground px-3 py-2 text-xs text-background"
              onClick={onAddQuestion}
            >
              Add
            </button>
          </div>

          <div className="mt-3 space-y-2">
            {questions.map((q, idx) => (
              <QuestionRow
                key={q.id}
                label={q.text ? `${idx + 1}. ${q.text}` : `${idx + 1}. (untitled)`}
                selected={q.id === selectedId}
                onSelect={() => setSelectedId(q.id)}
                onDelete={() => onDeleteQuestion(q.id)}
              />
            ))}
          </div>
        </aside>

        <section className="rounded-2xl border border-foreground/10 bg-background p-5">
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
              <label className="block w-full">
                <span className="text-sm text-foreground/70">Topic</span>
                <input
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-base outline-none focus:border-foreground/30"
                />
              </label>
              <button
                type="button"
                className="h-11 shrink-0 rounded-xl bg-foreground px-4 text-sm text-background disabled:opacity-50"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>

            {savedPin && savedHostKey ? (
              <div className="rounded-2xl border border-foreground/10 bg-background p-4 text-sm">
                <div className="font-semibold">Saved</div>
                <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                  <div>
                    <div className="text-xs text-foreground/70">PIN (players)</div>
                    <div className="mt-1 font-mono text-base">{savedPin}</div>
                  </div>
                  <div>
                    <div className="text-xs text-foreground/70">Host key</div>
                    <div className="mt-1 font-mono text-base">{savedHostKey}</div>
                  </div>
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <label className="block">
                <span className="text-sm text-foreground/70">Timer (seconds)</span>
                <input
                  type="number"
                  min={5}
                  max={300}
                  value={selected?.timerSeconds ?? 10}
                  onChange={(e) =>
                    updateSelected({
                      timerSeconds: clampTimerSeconds(Number(e.target.value)),
                    })
                  }
                  className="mt-2 w-full rounded-xl border border-foreground/10 bg-background px-4 py-3 text-base outline-none focus:border-foreground/30"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm text-foreground/70">Question</span>
              <textarea
                value={selected?.text ?? ""}
                onChange={(e) => updateSelected({ text: e.target.value })}
                rows={3}
                className="mt-2 w-full resize-none rounded-xl border border-foreground/10 bg-background px-4 py-3 text-base outline-none focus:border-foreground/30"
              />
            </label>

            <div>
              <div className="text-sm text-foreground/70">Choices</div>
              <div className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
                {(selected?.choices ?? ["", "", "", ""]).map((choice, idx) => (
                  <label
                    key={idx}
                    className="flex items-center gap-3 rounded-xl border border-foreground/10 px-3 py-2"
                  >
                    <input
                      type="radio"
                      name="correct"
                      checked={(selected?.correctIndex ?? 0) === idx}
                      onChange={() =>
                        updateSelected({
                          correctIndex: idx as 0 | 1 | 2 | 3,
                        })
                      }
                    />
                    <input
                      value={choice}
                      onChange={(e) => {
                        const next = [...(selected?.choices ?? ["", "", "", ""])];
                        next[idx] = e.target.value;
                        updateSelected({
                          choices: next as [string, string, string, string],
                        });
                      }}
                      placeholder={`Choice ${idx + 1}`}
                      className="w-full bg-transparent py-2 text-sm outline-none"
                    />
                  </label>
                ))}
              </div>
            </div>

            {saveError || validationError ? (
              <div className="rounded-xl border border-foreground/10 px-4 py-3 text-sm">
                {saveError ?? validationError}
              </div>
            ) : null}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-foreground/60">
                Selected: {selectedIndex >= 0 ? selectedIndex + 1 : "-"} / {questions.length}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="h-11 rounded-xl border border-foreground/10 px-4 text-sm hover:bg-foreground/5"
                  onClick={onNormalizeSelected}
                >
                  Normalize
                </button>
                <button
                  type="button"
                  className="h-11 rounded-xl bg-foreground px-4 text-sm text-background disabled:opacity-50"
                  onClick={onAddQuestion}
                >
                  Add question
                </button>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
