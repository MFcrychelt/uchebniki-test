import { NextResponse } from "next/server";
import { db } from "@/lib/prisma";
import { staffUser } from "@/lib/auth";
import { availabilityOf } from "@/lib/availability";
import { withLoanWriteLock } from "@/lib/loan-writes";

/**
 * Пакетная выдача: «класс пришёл целиком, карточки не сканируем».
 *
 * Почему один запрос: одиночная выдача (POST /api/loans) — это проверка и
 * запись, и «выдать всё» на ученика стоило N round-trip'ов. На классе из
 * 25 человек с 11 учебниками это 275 запросов, 4–5 минут тишины в очереди
 * и на каждом шаге этого цикла — шанс поймать оборванный ответ. Здесь обход
 * один, на сервере, внутри ОДНОЙ транзакции и под блокировками всех затронутых
 * книг: либо выдан весь класс, либо ничего (середина пачки не остаётся в
 * журнале), а «последний экземпляр» не уходит двоим.
 *
 * Права — как у одиночной выдачи (`staffUser`): отметить выдачу может и
 * классный руководитель.
 *
 * Ответ не «ok/не ok», а счётчики + список исключений: выдача классу почти
 * всегда проходит не целиком (кто-то уже получил, книги кончились), и
 * сотруднику нужны именно эти строки, а не зелёная галочка.
 */
type Reason = "no_stock" | "not_in_set";

/** Потолок пачки: 2000 строк — это ~4 с вставки; больше никто не просил. */
const MAX_ROWS = 2000;

/** Учебник так, как его видит пачка. */
interface BookRow {
  id: string;
  title: string;
  grade: number | null;
  copies: number;
}

export async function POST(request: Request) {
  const me = await staffUser();
  if (!me) {
    return NextResponse.json({ error: "Требуется вход" }, { status: 401 });
  }

  let body: {
    classId?: string;
    studentIds?: string[];
    bookIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Некорректные данные" }, { status: 400 });
  }

  const classId =
    typeof body.classId === "string" && body.classId.trim()
      ? body.classId.trim()
      : null;
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x) : [];
  const studentIds = list(body.studentIds);
  const bookIds = list(body.bookIds);

  // --- Кому выдаём -------------------------------------------------------
  let students: { id: string; lastName: string; firstName: string }[];
  if (studentIds.length > 0) {
    students = await db.orm.public.User.where((u) => u.id.in(studentIds))
      .where((u) => u.role.eq("STUDENT"))
      .select("id", "lastName", "firstName")
      .all();
  } else if (classId) {
    students = await db.orm.public.User.where((u) => u.classId.eq(classId))
      .where((u) => u.role.eq("STUDENT"))
      .select("id", "lastName", "firstName")
      .all();
  } else {
    return NextResponse.json(
      { error: "Нужен класс (classId) или список учеников (studentIds)" },
      { status: 400 }
    );
  }

  if (students.length === 0) {
    return NextResponse.json({ error: "В классе нет учеников" }, { status: 400 });
  }

  // --- Что выдаём: свой список книг или набор сезона класса -------------
  let targetBookIds = bookIds;
  if (targetBookIds.length === 0) {
    if (!classId) {
      return NextResponse.json(
        { error: "Нужен список книг (bookIds) или класс, чтобы взять его набор" },
        { status: 400 }
      );
    }
    targetBookIds = (
      await db.orm.public.ClassBook.where((cb) => cb.classId.eq(classId))
        .select("bookId")
        .all()
    ).map((cb) => cb.bookId);
  }

  let books: BookRow[] = await db.orm.public.Book.where((b) => b.id.in(targetBookIds))
    .select("id", "title", "grade", "copies")
    .all();
  if (books.length !== new Set(targetBookIds).size) {
    // id из запроса могло не найтись (книгу удалили в полёте) — молча
    // пропускаем: пачка не должна падать из-за одной строки.
    books = books.filter((b) => targetBookIds.includes(b.id));
  }
  if (books.length === 0) {
    return NextResponse.json(
      { error: "Нечего выдавать: список книг пуст" },
      { status: 400 }
    );
  }
  if (books.length > 0 && classId && bookIds.length === 0) {
    // Набор класса: архив прошлых лет не выдаём (тот же фильтр, что в
    // профиле ученика — student-profile.ts).
    books = books.filter((b) => b.grade != null);
    if (books.length === 0) {
      return NextResponse.json(
        { error: "В наборе класса на этот год нет учебников" },
        { status: 400 }
      );
    }
  }

  if (students.length * books.length > MAX_ROWS) {
    return NextResponse.json(
      {
        error: `Слишком большая пачка (${students.length} × ${books.length}). Разбейте на части.`,
      },
      { status: 400 }
    );
  }

  const counts = { created: 0, already: 0, noStock: 0, notInSet: 0 };
  const exceptions: {
    studentId: string;
    studentName: string;
    bookId: string;
    bookTitle: string;
    reason: Reason;
  }[] = [];
  let exceptionsTotal = 0;

  // Все книги пачки — под блокировками сразу (по sorted-порядку, иначе две
  // встречные пачки загнали бы друг друга в тупик), и в одной транзакции.
  await withLoanWriteLock(
    books.map((b) => b.id),
    async () =>
      db.transaction(async (tx) => {
        const [heldLoans, activeByBook] = await Promise.all([
          tx.orm.public.Loan.where((l) => l.studentId.in(students.map((s) => s.id)))
            .where((l) => l.status.eq("ISSUED"))
            .select("studentId", "bookId")
            .all(),
          tx.orm.public.Loan.where((l) => l.bookId.in(books.map((b) => b.id)))
            .where((l) => l.status.in(["ISSUED", "LOST"]))
            .select("bookId", "status")
            .all(),
        ]);

        /** Кто уже держит книгу — повторный нажим ничего не удваивает. */
        const held = new Set(heldLoans.map((l) => `${l.studentId}|${l.bookId}`));
        /** Свободные экземпляры на старте пачки, уменьшаются по ходу обхода. */
        const out = new Map<string, number>();
        const lost = new Map<string, number>();
        for (const l of activeByBook) {
          if (l.status === "LOST") lost.set(l.bookId, (lost.get(l.bookId) ?? 0) + 1);
          else out.set(l.bookId, (out.get(l.bookId) ?? 0) + 1);
        }
        const left = new Map(
          books.map((b) => [b.id, availabilityOf(b.copies, out.get(b.id) ?? 0, lost.get(b.id) ?? 0).available])
        );

        for (const s of students) {
          for (const b of books) {
            if (b.grade == null) {
              counts.notInSet++;
              exceptionsTotal++;
              if (exceptions.length < 100) {
                exceptions.push({
                  studentId: s.id,
                  studentName: `${s.lastName} ${s.firstName}`,
                  bookId: b.id,
                  bookTitle: b.title,
                  reason: "not_in_set",
                });
              }
              continue;
            }
            if (held.has(`${s.id}|${b.id}`)) {
              counts.already++;
              continue;
            }
            const free = left.get(b.id) ?? 0;
            if (free <= 0) {
              counts.noStock++;
              exceptionsTotal++;
              if (exceptions.length < 100) {
                exceptions.push({
                  studentId: s.id,
                  studentName: `${s.lastName} ${s.firstName}`,
                  bookId: b.id,
                  bookTitle: b.title,
                  reason: "no_stock",
                });
              }
              continue;
            }
            await tx.orm.public.Loan.create({
              studentId: s.id,
              bookId: b.id,
              librarianId: me.id,
              status: "ISSUED",
            });
            held.add(`${s.id}|${b.id}`);
            left.set(b.id, free - 1);
            counts.created++;
          }
        }
      })
  );

  return NextResponse.json({
    ...counts,
    total: students.length * books.length,
    students: students.length,
    books: books.length,
    exceptions,
    exceptionsTotal,
  });
}
