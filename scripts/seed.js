// Сид демо-данных: npm run seed
// Идемпотентен: если в БД уже есть пользователи — ничего не создаёт.
import "dotenv/config";
import { Temporal } from "@js-temporal/polyfill";
if (!globalThis.Temporal) globalThis.Temporal = Temporal; // Prisma 8 требует Temporal (Node 22)
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "@prisma/orm-postgres/runtime";
import contractJson from "../prisma/schema.json" with { type: "json" };

// scrypt-хеш пароля (соли в значении), как в src/lib/auth.ts
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

const DEMO_LIB_LOGIN = "librarian";
const DEMO_LIB_PASSWORD = "lib123";

const db = postgres({
  contractJson,
  url: process.env.DATABASE_URL,
});

try {
  const existing = await db.orm.public.User
    .where((u) => u.role.eq("STUDENT"))
    .first();

  if (existing) {
    console.log("Сид пропущен: в БД уже есть ученики.");
  } else {
    // --- Классы ---
    const cls8A = await db.orm.public.Class.create({ name: "8-А" });
    const cls8B = await db.orm.public.Class.create({ name: "8-Б" });
    const cls9A = await db.orm.public.Class.create({ name: "9-А" });

    // --- Каталог учебников (copies — экземпляры в фонде;
    //     математики 8-А 4 шт., т.к. в сиде выдана сразу троим) ---
    const books = [
      { isbn: "9785377058562", title: "Математика, 8 класс (Атанасян)", subject: "Математика", copies: 4 },
      { isbn: "9785070661144", title: "Алгебра, 8 класс (Макарычев)", subject: "Математика", copies: 2 },
      { isbn: "9785377059309", title: "Геометрия, 8 класс (Атанасян)", subject: "Математика", copies: 2 },
      { isbn: "9785070971193", title: "Русский язык, 8 класс (Баранов)", subject: "Русский язык", copies: 2 },
      { isbn: "9785346030410", title: "Литература, 8 класс", subject: "Литература", copies: 2 },
      { isbn: "9785377018619", title: "Физика, 8 класс (Перышкин)", subject: "Физика", copies: 2 },
      { isbn: "9785090378843", title: "Биология, 8 класс (Кроник)", subject: "Биология", copies: 2 },
      { isbn: "9785346024204", title: "История, 8 класс (Агафонова)", subject: "История", copies: 2 },
      { isbn: "9785090304550", title: "География, 8 класс (Алексеев)", subject: "География", copies: 2 },
      { isbn: "9785020309790", title: "Английский язык, 8 класс (Spotlight)", subject: "Английский язык", copies: 2 },
      { isbn: "9785070489241", title: "Информатика, 8 класс (Бос)", subject: "Информатика", copies: 2 },
      { isbn: "9785377061555", title: "Математика, 9 класс (Атанасян)", subject: "Математика", copies: 2 },
      { isbn: "9785070941505", title: "Русский язык, 9 класс (Баранов)", subject: "Русский язык", copies: 2 },
      { isbn: "9785377026301", title: "Физика, 9 класс (Перышкин)", subject: "Физика", copies: 2 },
      { isbn: "9785346029308", title: "История, 9 класс (Агафонова)", subject: "История", copies: 2 },
      { isbn: "9785090371318", title: "Биология, 9 класс (Кроник)", subject: "Биология", copies: 2 },
    ];
    const createdBooks = [];
    for (const b of books) {
      // Номер набора сезона — из названия («Физика, 8 класс» → 8).
      const m = /(\d{1,2})\s*[-–—]?\s*класс/i.exec(b.title);
      const n = m ? Number(m[1]) : null;
      const grade = n !== null && n >= 1 && n <= 11 ? n : null;
      createdBooks.push(await db.orm.public.Book.create({ ...b, grade }));
    }
    const [
      math8, alg8, geo8, rus8, lit8, phys8, bio8, hist8, geo8g, eng8, inf8,
      math9, rus9, phys9, hist9, bio9,
    ] = createdBooks;

    // --- Привязки к классам ---
    const links8A = [math8, alg8, geo8, rus8, lit8, phys8, bio8, hist8, geo8g, eng8, inf8];
    const links8B = [math8, rus8, phys8, bio8, hist8, geo8g];
    const links9A = [math9, rus9, phys9, hist9, bio9];

    for (const b of links8A) await db.orm.public.ClassBook.create({ classId: cls8A.id, bookId: b.id });
    for (const b of links8B) await db.orm.public.ClassBook.create({ classId: cls8B.id, bookId: b.id });
    for (const b of links9A) await db.orm.public.ClassBook.create({ classId: cls9A.id, bookId: b.id });

    // --- Ученики ---
    const mkStudent = (lastName, firstName, classId) =>
      db.orm.public.User.create({
        role: "STUDENT",
        lastName,
        firstName,
        classId,
        qrToken: crypto.randomUUID(),
      });

    const ivanov = await mkStudent("Иванов", "Иван", cls8A.id);
    const petrov = await mkStudent("Петров", "Пётр", cls8A.id);
    const sidorova = await mkStudent("Сидорова", "Анна", cls8A.id);
    const kuznetsova = await mkStudent("Кузнецова", "Ольга", cls8A.id);
    const smirnov = await mkStudent("Смирнов", "Дмитрий", cls8A.id);
    await mkStudent("Волкова", "Екатерина", cls8A.id);
    await mkStudent("Морозов", "Алексей", cls8B.id);
    await mkStudent("Соколова", "Дарья", cls8B.id);
    await mkStudent("Лебедев", "Никита", cls9A.id);

    await db.orm.public.User.create({
      role: "LIBRARIAN",
      lastName: "Петрова",
      firstName: "Мария",
      classId: null,
      qrToken: null,
      login: DEMO_LIB_LOGIN,
      passwordHash: hashPassword(DEMO_LIB_PASSWORD),
    });

    // --- Выдачи (как в user-story: Иванов — математика и физика) ---
    const issue = (studentId, bookId) =>
      db.orm.public.Loan.create({ studentId, bookId, status: "ISSUED" });

    await issue(ivanov.id, math8.id);
    await issue(ivanov.id, phys8.id);

    for (const b of links8A) await issue(petrov.id, b.id);

    const sidorovaMath = await issue(sidorova.id, math8.id);
    const sidorovaRus = await issue(sidorova.id, rus8.id);
    await db.orm.public.Loan
      .where({ id: sidorovaRus.id })
      .update({ status: "RETURNED", returnedAt: Temporal.Now.instant() });

    // Демо-списание: у Петрова «Литература, 8 класс» утрачена (LOST).
    // Копия не вернётся в фонд — остаток по этой книге учитывает списание.
    const petrovLit = await db.orm.public.Loan
      .where((l) => l.studentId.eq(petrov.id))
      .where((l) => l.bookId.eq(lit8.id))
      .where((l) => l.status.eq("ISSUED"))
      .first();
    if (petrovLit) {
      await db.orm.public.Loan
        .where({ id: petrovLit.id })
        .update({ status: "LOST", lostAt: Temporal.Now.instant() });
    }

    console.log(
      "Сид выполнен: 3 класса, 16 учебников, 9 учеников, библиотекарь, 15 выдач (13 ISSUED + 1 RETURNED + 1 LOST)."
    );
  }

  // --- Демо-доступ библиотекаря (идемпотентно: чинит и старые БД) ---
  const librarian = await db.orm.public.User
    .where((u) => u.role.eq("LIBRARIAN"))
    .first();
  if (librarian) {
    const hashOk =
      typeof librarian.passwordHash === "string" &&
      librarian.passwordHash.split(":").length === 2;
    if (!librarian.login || !hashOk) {
      await db.orm.public.User
        .where({ id: librarian.id })
        .update({
          login: DEMO_LIB_LOGIN,
          passwordHash: hashPassword(DEMO_LIB_PASSWORD),
        });
      console.log(
        `Демо-доступ установлен: ${DEMO_LIB_LOGIN} / ${DEMO_LIB_PASSWORD}`
      );
    }
  }

  // --- Демо-доступ администратора (идемпотентно) ---
  const DEMO_ADMIN_LOGIN = "admin";
  const DEMO_ADMIN_PASSWORD = "admin123";
  const admin = await db.orm.public.User
    .where((u) => u.role.eq("ADMIN"))
    .first();
  if (admin) {
    const hashOk =
      typeof admin.passwordHash === "string" &&
      admin.passwordHash.split(":").length === 2;
    if (!admin.login || !hashOk) {
      await db.orm.public.User
        .where({ id: admin.id })
        .update({
          login: DEMO_ADMIN_LOGIN,
          passwordHash: hashPassword(DEMO_ADMIN_PASSWORD),
        });
      console.log(
        `Демо-доступ администратора обновлён: ${DEMO_ADMIN_LOGIN} / ${DEMO_ADMIN_PASSWORD}`
      );
    }
  } else {
    await db.orm.public.User.create({
      role: "ADMIN",
      lastName: "Соколова",
      firstName: "Ирина",
      classId: null,
      qrToken: null,
      login: DEMO_ADMIN_LOGIN,
      passwordHash: hashPassword(DEMO_ADMIN_PASSWORD),
    });
    console.log(
      `Демо-доступ администратора создан: ${DEMO_ADMIN_LOGIN} / ${DEMO_ADMIN_PASSWORD}`
    );
  }
} finally {
  await db.close();
}
