import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";
import {
  COVER_MAX_BYTES,
  fetchCoverByIsbn,
  findCover,
  removeCover,
  saveCover,
} from "@/lib/covers";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  // Только персонал: обложки рисуются в каталоге и в карточке книги
  // (ученикам они не показываются), а ответ и так помечен `private`.
  // `<img src>` отправляет cookie того же происхождения, так что картинка
  // у вошедшего работает как работала.
  if (!(await staffUser())) {
    return new NextResponse(null, { status: 401 });
  }

  const { id } = await params;
  const found = await findCover(id);
  if (!found) {
    return new NextResponse(null, { status: 404 });
  }
  return new NextResponse(new Uint8Array(found.buf), {
    headers: {
      "Content-Type": found.type,
      "Cache-Control": "private, max-age=3600",
    },
  });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  const book = await db.orm.public.Book.where({ id }).first();
  if (!book) {
    return NextResponse.json({ error: "Учебник не найден" }, { status: 404 });
  }

  const ctype = request.headers.get("content-type") ?? "";
  try {
    if (ctype.includes("application/json")) {
      const body = (await request.json().catch(() => null)) as {
        source?: string;
      } | null;
      if (body?.source !== "isbn") {
        return NextResponse.json({ error: "Некорректный запрос" }, { status: 400 });
      }
      const got = await fetchCoverByIsbn(book.isbn);
      if (!got) {
        return NextResponse.json(
          { error: "Обложку по ISBN не нашли" },
          { status: 404 }
        );
      }
      await saveCover(id, got.buf, got.mime);
    } else {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return NextResponse.json({ error: "Выберите файл" }, { status: 400 });
      }
      if (file.size > COVER_MAX_BYTES) {
        return NextResponse.json({ error: "Файл больше 2 МБ" }, { status: 400 });
      }
      const buf = Buffer.from(await file.arrayBuffer());
      await saveCover(id, buf, file.type || "image/jpeg");
    }
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Не удалось сохранить" },
      { status: 400 }
    );
  }

  void logAudit("book.cover", "book", me, id, { title: book.title });
  return NextResponse.json({ ok: true, cover: `/api/books/${id}/cover` });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }
  const { id } = await params;
  await removeCover(id);
  void logAudit("book.cover-delete", "book", me, id);
  return NextResponse.json({ ok: true });
}
