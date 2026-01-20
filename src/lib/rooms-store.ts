import { promises as fs } from "node:fs";
import path from "node:path";
import type { QuizDraft } from "@/lib/quiz";

export type RoomRecord = {
  pin: string;
  title: string;
  hostKey?: string;
  quiz?: QuizDraft;
  createdAt?: string;
  updatedAt?: string;
};

export type RoomsFile = {
  rooms: RoomRecord[];
};

function roomsFilePath() {
  return path.join(process.cwd(), "src", "data", "rooms.json");
}

export async function readRoomsFile(): Promise<RoomsFile> {
  const filePath = roomsFilePath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as Partial<RoomsFile>;
    const rooms = Array.isArray(parsed.rooms) ? parsed.rooms : [];
    return { rooms: rooms as RoomRecord[] };
  } catch {
    return { rooms: [] };
  }
}

export async function writeRoomsFile(data: RoomsFile): Promise<void> {
  const filePath = roomsFilePath();
  const tmpPath = `${filePath}.tmp`;
  const content = `${JSON.stringify(data, null, 2)}\n`;
  await fs.writeFile(tmpPath, content, "utf8");
  await fs.rename(tmpPath, filePath);
}

export async function findRoomByPin(pin: string): Promise<RoomRecord | null> {
  const { rooms } = await readRoomsFile();
  return rooms.find((r) => r.pin === pin) ?? null;
}

export async function upsertRoom(params: {
  title: string;
  quiz?: QuizDraft;
  pin?: string;
  hostKey?: string;
}): Promise<Required<Pick<RoomRecord, "pin" | "title" | "hostKey">>> {
  const now = new Date().toISOString();
  const data = await readRoomsFile();

  const cleanTitle = params.title.trim().slice(0, 80) || "Untitled quiz";

  if (params.pin) {
    const idx = data.rooms.findIndex((r) => r.pin === params.pin);
    if (idx < 0) throw new Error("PIN_NOT_FOUND");
    const existing = data.rooms[idx]!;
    if (!existing.hostKey || existing.hostKey !== params.hostKey) throw new Error("HOST_KEY_INVALID");

    data.rooms[idx] = {
      ...existing,
      title: cleanTitle,
      quiz: params.quiz ?? existing.quiz,
      updatedAt: now,
    };
    await writeRoomsFile(data);
    return { pin: existing.pin, title: cleanTitle, hostKey: existing.hostKey };
  }

  const used = new Set(data.rooms.map((r) => r.pin));
  let pin = "";
  for (let attempt = 0; attempt < 20; attempt++) {
    const candidate = String(Math.floor(100000 + Math.random() * 900000));
    if (!used.has(candidate)) {
      pin = candidate;
      break;
    }
  }
  if (!pin) throw new Error("PIN_GENERATION_FAILED");

  const hostKey = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

  data.rooms.push({
    pin,
    title: cleanTitle,
    hostKey,
    quiz: params.quiz,
    createdAt: now,
    updatedAt: now,
  });

  await writeRoomsFile(data);
  return { pin, title: cleanTitle, hostKey };
}
