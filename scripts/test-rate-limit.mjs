// Тесты оконного лимитера (чистое ядро, без HTTP). Запуск:
//   node --experimental-strip-types scripts/test-rate-limit.mjs
import {
  createLimiter,
  loginKey,
  tokenProbeKey,
  RULE_STAFF_LOGIN,
} from "../src/lib/rate-limit.ts";

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

/** Часы, которые крутим руками: тест не должен зависеть от реального времени. */
const clock = () => {
  let t = 1_000_000;
  return {
    now: () => t,
    advance: (ms) => {
      t += ms;
    },
  };
};

console.log("1. До порога пускаем, после — нет");
{
  const c = clock();
  const l = createLimiter({ now: c.now });
  const rule = { limit: 3, windowMs: 60_000 };
  ok(l.check("k", rule).allowed, "1-я попытка разрешена");
  ok(l.check("k", rule).allowed, "2-я попытка разрешена");
  const d3 = l.check("k", rule);
  ok(d3.allowed && d3.remaining === 0, "3-я — последняя, остаток 0");
  const d4 = l.check("k", rule);
  ok(!d4.allowed, "4-я заблокирована");
  ok(d4.retryAfterSec === 60, "retryAfter = остаток окна (60 с)");
}

console.log("2. Окно прошло — пускаем снова");
{
  const c = clock();
  const l = createLimiter({ now: c.now });
  const rule = { limit: 2, windowMs: 60_000 };
  l.check("k", rule);
  l.check("k", rule);
  ok(!l.check("k", rule).allowed, "заблокировано до истечения окна");
  c.advance(60_001);
  ok(l.check("k", rule).allowed, "разрешено после истечения окна");
}

console.log("3. Ключи независимы");
{
  const c = clock();
  const l = createLimiter({ now: c.now });
  const rule = { limit: 1, windowMs: 60_000 };
  ok(l.check("ivanov", rule).allowed, "ivanov: первая");
  ok(!l.check("ivanov", rule).allowed, "ivanov: вторая уже нет");
  ok(l.check("petrov", rule).allowed, "petrov: своя первая (чужие попытки не мешают)");
}

console.log("4. blocked() не сжигает попытки");
{
  const c = clock();
  const l = createLimiter({ now: c.now });
  const rule = { limit: 5, windowMs: 60_000 };
  let allowed = true;
  for (let i = 0; i < 50; i++) allowed = allowed && l.blocked("k", rule).allowed;
  ok(allowed, "50 проверок без записи — всё ещё разрешено");
  for (let i = 0; i < 5; i++) l.recordFailure("k", rule);
  ok(!l.blocked("k", rule).allowed, "после 5 неудач заблокировано");
  ok(l.size() === 1, "в памяти один ключ на одну пару (ключ, окно)");
}

console.log("5. Протухшие окна вычищаются (память не растёт со сменой)");
{
  const c = clock();
  const l = createLimiter({ now: c.now });
  const rule = { limit: 1, windowMs: 60_000 };
  for (let i = 0; i < 200; i++) l.check(`login-${i}`, rule);
  ok(l.size() === 200, "накоплено 200 ключей");
  c.advance(180_000);
  l.check("свежий", rule); // любой вызов запускает sweep
  ok(l.size() === 1, "старые окна удалены, остался только свежий ключ");
}

console.log("6. Ключ попытки: нормализация и адрес");
{
  const req = (ip) =>
    new Request("http://x/api/auth/login", { headers: ip ? { "x-forwarded-for": ip } : {} });
  const a = loginKey(req("203.0.113.7"), "staff", "  Admin ");
  const b = loginKey(req("203.0.113.7"), "staff", "admin");
  ok(a === b, "регистр и пробелы не плодят отдельные счётчики");
  ok(!a.includes("203.0.113.7"), "без TRUST_PROXY заголовок игнорируется (его подставляет любой curl)");

  process.env.TRUST_PROXY = "1";
  const one = loginKey(req("203.0.113.7"), "staff", "admin");
  const two = loginKey(req("203.0.113.8"), "staff", "admin");
  ok(one.includes("ip:203.0.113.7"), "с доверенным прокси адрес входит в ключ");
  ok(one !== two, "…и два адреса считаются раздельно");
  delete process.env.TRUST_PROXY;
  ok(tokenProbeKey(req(null), "qr") === "qr:shared", "без адреса — общий ключ (мягкий порог)");
  ok(RULE_STAFF_LOGIN.limit === 8, "базовый порог виден: 8 попыток");
}

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed === 0 ? 0 : 1);
