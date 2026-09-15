import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { logAudit } from "@/lib/audit";

// Переименовать / удалить именованный набор. Доступно любому сотруднику.
// При удалении набора книги не удаляются — только связь (каскад).

function nameError(name: unknown): string | null {
  if (typeof name !== "string" || !name.trim()) return "Введите название";
  if (name.trim().length > 40) return "Не длиннее 40 символов";
  return null;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const name = (body as { name?: unknown })?.name;
  const err = nameError(name);
  if (err) {
    return NextResponse.json({ error: err }, { status: 400 });
  }
  const clean = (name as string).trim();

  const set = await db.orm.public.BookSet.where({ id }).first();
  if (!set) {
    return NextResponse.json({ error: "Набор не найден" }, { status: 404 });
  }
  if (set.name === clean) {
    return NextResponse.json({ ok: true, name: clean });
  }

  const dup = await db.orm.public.BookSet
    .where((s) => s.name.eq(clean))
    .first();
  if (dup) {
    return NextResponse.json(
      { error: "Набор с таким названием уже есть" },
      { status: 409 }
    );
  }

  await db.orm.public.BookSet.where({ id }).update({ name: clean });
  void logAudit("set.rename", "set", me, id, {
    from: set.name,
    to: clean,
  });
  return NextResponse.json({ ok: true, name: clean });
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
  const set = await db.orm.public.BookSet.where({ id }).first();
  if (!set) {
    return NextResponse.json({ error: "Набор не найден" }, { status: 404 });
  }

  const items = await db.orm.public.BookSetItem
    .where((it) => it.setId.eq(id))
    .all();

  await db.orm.public.BookSet.where({ id }).delete();
  void logAudit("set.delete", "set", me, id, {
    name: set.name,
    books: items.length,
  });
  return NextResponse.json({ ok: true });
}
