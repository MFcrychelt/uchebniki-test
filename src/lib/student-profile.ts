import { db } from "@/lib/prisma";
import {
  bookAvailabilityMap,
  type BookAvailability,
} from "@/lib/availability";

/**
 * Профиль ученика для экрана выдачи: сам ученик, чек-лист его класса,
 * его выдачи и остатки по книгам.
 *
 * Живёт отдельным модулем, потому что источников у профиля два:
 *  - личный QR-ключ (`/api/student/qr/:token`) — доступ по секретному
 *    токену с карточки, сессия не нужна;
 *  - id ученика (`/api/student/:id`) — только персонал; нужен, когда
 *    карточку не печатали или потеряли (режим «класс пришёл целиком»).
 * Две копии сборки профиля расходятся всегда незаметно: через полгода UI
 * начинает читать `undefined` в одном из двух полей.
 *
 * Поля паролей (passwordHash / passwordEnc / inviteToken) не выбираются
 * вовсе: токен QR не даёт права на их чтение.
 */
export async function buildStudentProfile(
  where: { id: string } | { qrToken: string }
) {
  const student = await db.orm.public.User.where(where)
    .select(
      "id",
      "role",
      "lastName",
      "firstName",
      "classId",
      "login",
      "qrToken",
      "createdAt"
    )
    .include("class")
    .first();

  if (!student) return null;

  // Чек-лист класса: только учебники из наборов сезона. Архивные
  // (прошлогодние издания) не показываются; выданные копии видны в loans.
  const allClassBooks = student.classId
    ? await db.orm.public.ClassBook.where((cb) => cb.classId.eq(student.classId!))
        .include("book")
        .all()
    : [];
  const classBooks = allClassBooks.filter(
    (cb) => (cb.book as { grade?: number | null } | null)?.grade != null
  );

  const loans = await db.orm.public.Loan.where((l) =>
    l.studentId.eq(student.id)
  )
    .include("book")
    .orderBy((l) => l.issuedAt.desc())
    .all();

  // Остатки по учебникам класса: сколько ещё можно выдать.
  const classBookIds = classBooks
    .map((cb) => (cb.book as { id: string } | null)?.id ?? "")
    .filter(Boolean);
  const availabilityMap = await bookAvailabilityMap(classBookIds);
  const availability: Record<string, BookAvailability> = {};
  for (const [id, a] of availabilityMap) availability[id] = a;

  return { student, classBooks, loans, availability };
}

export type StudentProfile = NonNullable<Awaited<ReturnType<typeof buildStudentProfile>>>;
