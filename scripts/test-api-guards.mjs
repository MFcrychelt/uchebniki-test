// Проверка «кто имеет право читать эти данные» — без запуска сервера.
// Запуск: node --experimental-strip-types scripts/test-api-guards.mjs
//
// Зачем: API этого проекта защищено вызовом guard'а внутри роут-хендлера
// (`staffUser()` / `adminGuard()` / `studentUser()`). Такой порядок легко
// нарушить одним незакрытым GET — и он уже нарушался: `/api/classes` и
// `/api/books` отдавали классы, тиражи и остатки анонимам, а по `classId` от
// туда становился доступен печатный список класса. Тесты логики этого поймать
// не могли: они не про права.
//
// Тест статический и сознательно грубый: он не проверяет, что guard «правильный»,
// он не даёт молча появиться методу без проверки доступа и не даёт протухнуть
// списку «публично по замыслу».
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const APP = join(ROOT, "src", "app");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "node_modules" || name === ".next") continue;
      walk(p, out);
    } else {
      out.push(p);
    }
  }
  return out;
}

const rel = (p) => relative(APP, p).split(sep).join("/");
/** Путь роута для человекочитаемого имени проверки: api/books/[id] → /api/books/:id */
const routeName = (key) =>
  "/" +
  key
    .replace(/\/route\.ts$/, "")
    .split("/")
    .map((seg) => (seg.startsWith("[") ? ":" + seg.slice(1, -1) : seg))
    .join("/");

/** Вызовы, которые реально требуют сессию нужной роли. */
const REAL_GUARD = /\b(staffUser|adminGuard|studentUser|requireStaff|requireAdmin)\s*\(/;

/**
 * Публичные по замыслу методы. Причина обязательна и видна в code review —
 * «просто добавить в список» незаметно не получится.
 */
const PUBLIC_ALLOWLIST = {
  "api/auth/login/route.ts": {
    POST: "вход персонала: анонимный по смыслу; перебор паролей закрыт лимитером (src/lib/rate-limit.ts)",
  },
  "api/auth/student/login/route.ts": {
    POST: "вход ученика: то же; логин и пароль выдаёт система",
  },
  "api/auth/logout/route.ts": {
    POST: "сброс cookie: идемпотентен и ничего не отдаёт",
  },
  "api/auth/me/route.ts": {
    GET: "отвечает только «кто вошёл»; без сессии — authenticated:false",
  },
  "api/version/route.ts": {
    GET: "короткий sha для подвала и вкладки обновлений; персональных данных нет",
  },
  "api/invite/[token]/route.ts": {
    GET: "magic-ссылка: доступ по одноразовому uuid-токену; неудачи считает лимитер",
  },
  "api/student/qr/[token]/route.ts": {
    GET: "кабинет ученика по личному QR-ключу; секреты не выбираются (select в student-profile.ts)",
  },
  "api/student/qr/[token]/requests/route.ts": {
    GET: "заявки своего ученика — по тому же ключу",
    POST: "создать заявку — по тому же ключу",
  },
  "api/student/qr/[token]/requests/[id]/route.ts": {
    DELETE: "отозвать свою заявку — id проверяется вместе с токеном",
  },
};

/** Разбор роут-файла на методы и их тела (до следующего top-level export). */
function methodsOf(src) {
  const out = [];
  const re = /^export async function (GET|POST|PATCH|PUT|DELETE)\b/gm;
  let m;
  while ((m = re.exec(src))) {
    const rest = src.slice(m.index + m[0].length);
    const next = rest.search(/^export /m);
    out.push({
      method: m[1],
      body: next < 0 ? rest : rest.slice(0, next),
    });
  }
  return out;
}

let passed = 0;
const failures = [];
const ok = (cond, name) => {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failures.push(name);
    console.error("  ✗", name);
  }
};

console.log("1. Каждый метод API — либо под guard'ом, либо в allow-list с причиной");
const routeFiles = walk(APP).filter((p) => p.endsWith("route.ts") && rel(p).startsWith("api/"));
let checkedMethods = 0;
for (const file of routeFiles) {
  const key = rel(file);
  const src = readFileSync(file, "utf8");
  for (const { method, body } of methodsOf(src)) {
    checkedMethods++;
    const guarded = REAL_GUARD.test(body);
    const reason = PUBLIC_ALLOWLIST[key]?.[method];
    if (guarded) {
      ok(true, `${method} ${routeName(key)} — проверка доступа есть`);
      continue;
    }
    if (!reason) {
      ok(false, `${method} ${routeName(key)} — НЕТ проверки доступа`);
      continue;
    }
    ok(
      typeof reason === "string" && reason.length > 24,
      `${method} ${routeName(key)} — публично по причине: ${reason.slice(0, 48)}…`
    );
  }
}

console.log("2. Allow-list не протух (файл и метод существуют, guard не появился зря)");
for (const [file, methods] of Object.entries(PUBLIC_ALLOWLIST)) {
  const path = join(APP, file);
  if (!existsSync(path)) {
    ok(false, `allow-list ссылается на несуществующий файл ${file}`);
    continue;
  }
  const found = methodsOf(readFileSync(path, "utf8"));
  for (const method of Object.keys(methods)) {
    const entry = found.find((m) => m.method === method);
    ok(!!entry, `${method} ${routeName(file)} — метод на месте`);
    if (entry) {
      ok(
        !REAL_GUARD.test(entry.body),
        `${method} ${routeName(file)} — всё ещё без guard'а (появился — уберите из allow-list)`
      );
    }
  }
}

console.log("3. Страницы, читающие БД напрямую, проверяют сессию");
const serverPages = walk(APP)
  .filter((p) => p.endsWith("page.tsx"))
  .map((p) => ({ p, src: readFileSync(p, "utf8") }))
  .filter(({ src }) => !src.includes('"use client"') && src.includes("db.orm"));
for (const { p, src } of serverPages) {
  ok(
    /requireStaff|requireAdmin|currentUser/.test(src),
    `${rel(p).replace(/\/page\.tsx$/, "")} — сессия проверена`
  );
}
if (serverPages.length === 0) {
  console.log("  (ни одна server-страница не читает БД напрямую — проверять нечего)");
}

console.log("\nИтого");
console.log(`  методов API: ${checkedMethods}; пройдено проверок: ${passed}, провалов: ${failures.length}`);
if (failures.length > 0) {
  console.error(
    "\nПровал — это дыра в доступе либо устаревший allow-list.\n" +
      "Лечится как уже чинилось в проекте: guard в роут-хендлере (staffUser/adminGuard)\n" +
      "или requireStaff() в server-компоненте, который читает БД сам."
  );
}
process.exit(failures.length === 0 ? 0 : 1);
