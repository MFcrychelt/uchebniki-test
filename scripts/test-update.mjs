// Тесты логики саммоуффа (маскирование секретов, статус, разбор ошибок).
// Запуск: node --experimental-strip-types scripts/test-update.mjs
import { register } from "node:module";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

// src/*.ts используют импорты без расширения (bundler) — разрешаем их.
register("./test-update-loader.mjs", import.meta.url);
const { maskSecrets, extractGitError, getUpdateStatus } = await import(
  "../src/lib/update.ts"
);

const pExecFile = promisify(execFile);

let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗", name);
  }
};

console.log("maskSecrets");
ok(
  maskSecrets("https://ghp_abcDEF123@github.com/o/r.git") ===
    "https://••••••••@github.com/o/r.git",
  "токен gh_ в URL маскируется"
);
ok(
  maskSecrets("fatal: unable to access 'https://user:secretpass@github.com/o/r.git/'")
    .includes("secretpass") === false,
  "пароль в URL маскируется"
);
ok(
  maskSecrets("https://github.com/o/r.git") === "https://github.com/o/r.git",
  "публичный URL без учёток не меняется"
);
ok(
  maskSecrets("https://x@github.com/o/r.git") === "https://••••••••@github.com/o/r.git",
  "логин@ в URL маскируется"
);

console.log("extractGitError");
ok(
  extractGitError(new Error("Command failed: git fetch\nfatal: could not read Username for 'https://github.com'")) ===
    "fatal: could not read Username for 'https://github.com'",
  "берёт строку fatal:"
);
ok(
  extractGitError(new Error("Command failed: git pull\nerror: You have local changes"))
    .startsWith("error:"),
  "берёт строку error:"
);
ok(
  extractGitError(new Error("plain message")) === "plain message",
  "обычное сообщение как есть"
);

console.log("getUpdateStatus (репозиторий)");
const [gitShort, gitBranch] = await Promise.all([
  pExecFile("git", ["rev-parse", "--short", "HEAD"]).then((r) => r.stdout.trim()),
  pExecFile("git", ["rev-parse", "--abbrev-ref", "HEAD"]).then((r) => r.stdout.trim()),
]);
const status = await getUpdateStatus(true);
ok(status.version?.short === gitShort, "версия = текущий git HEAD");
// Ветку сравниваем с текущей, а не с зашитым именем: иначе тест падает на
// любой другой ветке (в т.ч. в CI и у школьного админа, который обновляется
// из своей), и это падание заглушает всё, что идёт после него в npm test.
ok(
  typeof status.branch === "string" &&
    status.branch.length > 0 &&
    status.branch === gitBranch,
  `ветка определена (${gitBranch})`
);
ok(
  typeof status.behind === "number" && status.behind >= 0,
  "отставание — число (origin доступен)"
);
ok(
  status.remote === "https://github.com/MFcrychelt/uchebniki-project.git",
  "remote показан (без секретов)"
);
ok(status.job.running === false, "задача не запущена в фоне");
if (typeof status.behind === "number" && status.behind > 0) {
  ok(
    status.newCommits.length > 0 && status.newCommits[0].short.length >= 7,
    "список новых коммитов не пуст"
  );
}

console.log(
  failed === 0
    ? `update: все ${passed} тестов пройдено`
    : `update: ${failed} из ${passed + failed} тестов ПРОВАЛЕНО`
);
process.exit(failed === 0 ? 0 : 1);
