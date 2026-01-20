export type QuizQuestion = {
  id: string;
  text: string;
  choices: [string, string, string, string];
  correctIndex: 0 | 1 | 2 | 3;
  timerSeconds: number;
};

export type QuizDraft = {
  topic: string;
  questions: QuizQuestion[];
};

export function createQuestionSeed(): QuizQuestion {
  return {
    id: crypto.randomUUID(),
    text: "",
    choices: ["", "", "", ""],
    correctIndex: 0,
    timerSeconds: 10,
  };
}

export function clampTimerSeconds(value: number): number {
  if (!Number.isFinite(value)) return 10;
  const rounded = Math.round(value);
  return Math.min(300, Math.max(5, rounded));
}

export function normalizeQuestion(input: QuizQuestion): QuizQuestion {
  return {
    ...input,
    text: input.text.trim().slice(0, 200),
    choices: [
      input.choices[0].trim().slice(0, 80),
      input.choices[1].trim().slice(0, 80),
      input.choices[2].trim().slice(0, 80),
      input.choices[3].trim().slice(0, 80),
    ],
    timerSeconds: clampTimerSeconds(input.timerSeconds),
  };
}

export function validateQuestion(input: QuizQuestion): string | null {
  const q = normalizeQuestion(input);
  if (!q.text) return "Question text is required";
  if (q.choices.some((c) => !c)) return "All 4 choices are required";
  if (![0, 1, 2, 3].includes(q.correctIndex)) return "Select a correct choice";
  if (q.timerSeconds < 5 || q.timerSeconds > 300) return "Timer must be 5–300s";
  return null;
}

export function normalizeQuizDraft(input: QuizDraft): QuizDraft {
  return {
    topic: input.topic.trim().slice(0, 80),
    questions: (input.questions ?? []).map((q) => normalizeQuestion(q)),
  };
}

export function validateQuizDraft(input: QuizDraft): string | null {
  const draft = normalizeQuizDraft(input);
  if (!draft.topic) return "Topic is required";
  if (!draft.questions.length) return "At least 1 question is required";
  for (const q of draft.questions) {
    const err = validateQuestion(q);
    if (err) return err;
  }
  return null;
}
