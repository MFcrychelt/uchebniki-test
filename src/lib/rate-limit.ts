/**
 * Оконный лимитер «в памяти процесса» — для входов и для подбора токенов.
 *
 * Зачем: `/api/auth/login`, `/api/auth/student/login` и оба «секретных»
 * пути по токену (QR ученика, magic-ссылка) раньше отвечали на любое число
 * запросов. scrypt делает каждый неверный пароль дорогим — из этого следует
 * и то, что перебор медленный (плюс), и то, что несколько десятков
 * параллельных «неверный пароль» грузят школьный сервер сильнее, чем весь
 * рабочий день библиотеки (минус).
 *
 * Честные границы решения:
 *  - состояние живёт в памяти одного процесса. Школьный сервер — один
 *    процесс Node (см. README: `npm start` на той же машине, что и БД);
 *    если приложение когда-нибудь запустят в нескольких копиях, счётчики
 *    надо выносить в БД/Redis, а не делать вид, что они глобальные;
 *  - после рестарта окна обнуляются (для «защиты от перебора» это приемлемо,
 *    для анти-фрода — нет);
 *  - IP берётся из `X-Forwarded-For`, который пишет nginx. Если сервер
 *    смотрит наружу напрямую, доверять заголовку нельзя — тогда берём его
 *    только у `TRUST_PROXY=1`.
 *
 * Что считаем успехом «заблокировано»: 429 + `Retry-After`. Клиенты (в т.ч.
 * форму на `/login`) показывают текст ошибки как есть, поэтому в ответе —
 * человеческая строка, а не «Too Many Requests».
 */

export interface LimitRule {
  /** Максимум разрешённых событий в окне. */
  limit: number;
  /** Размер окна, мс. */
  windowMs: number;
}

export interface Decision {
  allowed: boolean;
  /** Сколько событий ещё пройдёт в текущем окне. */
  remaining: number;
  /** Через сколько секунд можно повторить (0, если разрешено). */
  retryAfterSec: number;
}

export interface Limiter {
  /** Разрешено ли событие (считает его, когда разрешает). */
  check(key: string, rule: LimitRule): Decision;
  /**
   * Зарегистрировать неудачу (для путей, где успешные обращения считать
   * нельзя: кабинет ученика открывается по QR часто и это нормально).
   */
  recordFailure(key: string, rule: LimitRule): Decision;
  /** Есть ли уже перебор по ключу (проверка ДО работы). */
  blocked(key: string, rule: LimitRule): Decision;
  reset(): void;
  /** Число активных ключей — только для тестов/диагностики. */
  size(): number;
}

/** Окна, протухшие дольше этого срока, вычищаются (защита от разрастания). */
const SWEEP_GRACE_MS = 60_000;

export function createLimiter(opts: { now?: () => number } = {}): Limiter {
  const now = opts.now ?? (() => Date.now());
  const buckets = new Map<string, { count: number; resetAt: number }>();
  let lastSweep = 0;

  const sweep = (t: number) => {
    // Линейный проход по Map — дёшево (записей единицы тысяч) и не требует
    // таймера, который жил бы между hot-reload'ами в dev.
    if (t - lastSweep < SWEEP_GRACE_MS) return;
    lastSweep = t;
    for (const [key, b] of buckets) {
      if (b.resetAt + SWEEP_GRACE_MS < t) buckets.delete(key);
    }
  };

  const evaluate = (key: string, rule: LimitRule, countIt: boolean): Decision => {
    const t = now();
    sweep(t);
    const b = buckets.get(key);
    if (!b || b.resetAt <= t) {
      if (countIt) buckets.set(key, { count: 1, resetAt: t + rule.windowMs });
      else if (b && b.resetAt <= t) buckets.delete(key);
      return { allowed: true, remaining: Math.max(0, rule.limit - 1), retryAfterSec: 0 };
    }
    if (b.count >= rule.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((b.resetAt - t) / 1000)),
      };
    }
    if (countIt) b.count += 1;
    return {
      allowed: true,
      remaining: rule.limit - b.count,
      retryAfterSec: 0,
    };
  };

  return {
    check: (key, rule) => evaluate(key, rule, true),
    recordFailure: (key, rule) => evaluate(key, rule, true),
    blocked: (key, rule) => evaluate(key, rule, false),
    reset: () => buckets.clear(),
    size: () => buckets.size,
  };
}

/** Общий лимитер процесса (в dev переживает hot-reload благодаря globalThis). */
const globalScope = globalThis as unknown as { __authLimiter?: Limiter };
export const authLimiter: Limiter = (globalScope.__authLimiter ??= createLimiter());

// --- Правила (одно место, чтобы их было видно глазами) -------------------

/** Пароль сотрудника: 8 попыток на аккаунт за 5 минут. */
export const RULE_STAFF_LOGIN: LimitRule = { limit: 8, windowMs: 5 * 60_000 };
/** Ученик: ошибается часто (пароль 8 символов с карточки) — 10 за 5 минут. */
export const RULE_STUDENT_LOGIN: LimitRule = { limit: 10, windowMs: 5 * 60_000 };
/**
 * Общий бюджет неудачных входов: 120 за 5 минут на приложение. Это не
 * «антибот для интернета», а потолок CPU: scrypt на каждую проверку стоит
 * десятки миллисекунд, и флуд неверными паролями иначе кладёт сервер, на
 * котором в этот момент идёт выдача учебников.
 */
export const RULE_LOGIN_BUDGET: LimitRule = { limit: 120, windowMs: 5 * 60_000 };
/** Подбор QR-токена / magic-ссылки с конкретного адреса: 20 неудач/10 мин. */
export const RULE_TOKEN_PROBE: LimitRule = { limit: 20, windowMs: 10 * 60_000 };
/**
 * Тот же контроль, когда адреса не видно (без доверенного прокси): общий на
 * приложение мешок. Порог заметно мягче — при начале года полшколы открывают
 * кабинет по QR, и потерянная/перепечатанная карточка даёт «неудачу» на ровном
 * месте; жёсткий общий лимит отрезал бы детей от их же кабинетов.
 */
export const RULE_TOKEN_PROBE_SHARED: LimitRule = { limit: 200, windowMs: 10 * 60_000 };

/**
 * Доверяем ли мы адресам из заголовков. Без явного TRUST_PROXY считать по IP
 * нельзя: `X-Forwarded-For` подставляется любым клиентом, и лимитер
 * обходился бы одной строчкой в curl. Тогда ключ — сам логин (или токен), а
 * не адрес: от перебора по аккаунту это защищает и без прокси.
 */
export function trustsProxy(): boolean {
  return process.env.TRUST_PROXY === "1" || process.env.TRUST_PROXY === "true";
}

/** Адрес клиента — только когда прокси доверяют; иначе null. */
export function attemptIp(request: Request): string | null {
  if (!trustsProxy()) return null;
  const xff = request.headers.get("x-forwarded-for");
  const first = xff?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || null;
}

/**
 * Ключ попытки входа: логин + (если есть прокси) адрес. Нормализация та же,
 * что в роутах: регистр и пробелы не должны давать лишние «счётчики».
 */
export function loginKey(request: Request, scope: "staff" | "student", login: string): string {
  const base = `${scope}:login:${login.trim().toLowerCase()}`;
  const ip = attemptIp(request);
  return ip ? `${base}|ip:${ip}` : base;
}

/** Ключ проверки секрета (QR-токен, magic-ссылка): считаем только неудачи. */
export function tokenProbeKey(request: Request, scope: "qr" | "invite"): string {
  const ip = attemptIp(request);
  return ip ? `${scope}:ip:${ip}` : `${scope}:shared`;
}

/**
 * Контроль подбора секретов (QR ученика, magic-ссылка). Успешные обращения не
 * считаем: кабинет по QR открывается часто и это нормальная работа.
 */
export function tokenProbe(request: Request, scope: "qr" | "invite") {
  const key = tokenProbeKey(request, scope);
  const rule = attemptIp(request) ? RULE_TOKEN_PROBE : RULE_TOKEN_PROBE_SHARED;
  return {
    /** Ответ-заглушка, если уже перебирают; null — работать дальше. */
    gate(): Response | null {
      const d = authLimiter.blocked(key, rule);
      return d.allowed
        ? null
        : tooManyRequests(
            d,
            `Слишком много попыток открыть чужие коды. Подождите ${waitPhrase(d.retryAfterSec || 60)} — так система решает, что их перебирают.`
          );
    },
    /** Неудача (код не найден / ссылка уже израсходована). */
    noteNotFound(): void {
      authLimiter.recordFailure(key, rule);
    },
  };
}

/** Секунды → по-человечески: форма входа показывает это прямо под полями. */
export function waitPhrase(sec: number): string {
  if (sec < 60) return `${sec} с`;
  const min = Math.ceil(sec / 60);
  return `~${min} мин`;
}

/** Ответ «слишком много попыток» — текст читает человек, не скрипт. */
export function tooManyRequests(decision: Decision, message?: string): Response {
  const seconds = decision.retryAfterSec || 60;
  return new Response(
    JSON.stringify({
      error:
        message ??
        `Слишком много попыток входа. Подождите ${waitPhrase(seconds)} — так система решает, что пароли подбирают. Если это вы и вы точно помните пароль, напишите администратору: он сбросит его за минуту.`,
      code: "rate_limited",
      retryAfterSec: seconds,
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": String(seconds),
        "Cache-Control": "no-store",
      },
    }
  );
}
