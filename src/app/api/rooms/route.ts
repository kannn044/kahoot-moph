import { NextResponse } from "next/server";
import { findRoomByPin, readRoomsFile, upsertRoom } from "@/lib/rooms-store";
import type { QuizDraft } from "@/lib/quiz";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const pin = url.searchParams.get("pin")?.trim() ?? "";
  const hostKey = url.searchParams.get("hostKey")?.trim() ?? "";

  if (!pin) {
    const data = await readRoomsFile();
    return NextResponse.json({ rooms: data.rooms.map(({ pin, title }) => ({ pin, title })) });
  }

  const room = await findRoomByPin(pin);
  if (!room) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  if (hostKey && room.hostKey === hostKey) {
    return NextResponse.json({ room });
  }

  return NextResponse.json({ room: { pin: room.pin, title: room.title } });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | {
        title?: string;
        quiz?: QuizDraft;
        pin?: string;
        hostKey?: string;
      }
    | null;

  if (!body || typeof body.title !== "string") {
    return NextResponse.json({ error: "INVALID_BODY" }, { status: 400 });
  }

  try {
    const result = await upsertRoom({
      title: body.title,
      quiz: body.quiz,
      pin: body.pin,
      hostKey: body.hostKey,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "UNKNOWN";
    const status = message === "HOST_KEY_INVALID" || message === "PIN_NOT_FOUND" ? 403 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
