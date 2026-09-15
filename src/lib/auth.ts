import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import {
  createHmac,
  randomBytes,
  scryptSync,
  timingSafeEqual,
} from "node:crypto";
import { db } from "@/lib/prisma";

/**
 * Аутентификация персонала (библиотекари).
 *
 * Сессия — подписанный HMAC-SHA256 токен в httpOnly-cookie `session`:
 *   base64url(JSON{uid, role, exp}) . base64url(HMAC(secret, payload))
 * Stateless: проверять можно в любом серверном обработчике, сессий в БД нет.
 * Ученики не авторизуются — они работают по личному QR-коду.
 */

export const SESSION_COOKIE = "session";
export const STAFF_SESSION_COOKIE = "staff_session";
export const STUDENT_SESSION_COOKIE = "student_session";
export const SESSION_TTL_SEC = 12 * 60 * 60; // 12 часов (персонал — смена)
// Ученик «заходит один раз по ссылке от учителя и забывает про вход»:
// сессия живёт 30 дней, пока не нажмёт «Выйти».
export const STUDENT_SESSION_TTL_SEC = 30 * 24 * 60 * 60;

/** Срок сессии по роли. */
export function sessionTtlSec(role: SessionUser["role"]): number {
  return role === "STUDENT" ? STUDENT_SESSION_TTL_SEC : SESSION_TTL_SEC;
}

const DEV_FALLBACK_SECRET = "dev-only-insecure-session-secret-0123456789abcdef";

function secret(): string {
  const raw = process.env.SESSION_SECRET ?? "";
  // Заглушка из .env.example и всё, что короче 32 символов, — не секрет:
  // подпись cookie воспроизводится по публичному репозиторию, а это
  // поддельная сессия ADMIN с любым uid. В проде на такое не соглашаемся;
  // в dev остаётся тихий fallback, чтобы локальный старт не падал.
  const insecure = raw.length < 32 || raw.startsWith("change-me-to-a-long");
  if (!insecure) return raw;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "SESSION_SECRET: подставьте случайный секрет от 32 символов — " +
        'node -e "console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))"'
    );
  }
  return DEV_FALLBACK_SECRET;
}

// --- Пароли (scrypt, соль в хеше) ---

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, "hex");
  return (
    check.length === expected.length && timingSafeEqual(check, expected)
  );
}

// --- Токен сессии ---

const b64url = (buf: Buffer) =>
  buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export interface SessionUser {
  id: string;
  role: "ADMIN" | "LIBRARIAN" | "STUDENT";
  lastName: string;
  firstName: string;
}

export function signSessionToken(user: SessionUser): string {
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        uid: user.id,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + sessionTtlSec(user.role),
      })
    )
  );
  const sig = b64url(createHmac("sha256", secret()).update(payload).digest());
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { uid: string } | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = b64url(createHmac("sha256", secret()).update(payload).digest());
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(
      Buffer.from(payload.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString()
    ) as { uid: string; exp: number };
    if (!data.uid || data.exp < Math.floor(Date.now() / 1000)) return null;
    return { uid: data.uid };
  } catch {
    return null;
  }
}

// --- Доступ из обработчиков ---

/** Токен сессии из cookie запроса (null, если нет/невалиден). */
export async function sessionToken(): Promise<string | null> {
  const store = await cookies();
  // Проверяем cookie с именем, соответствующим роли (staff_session / student_session),
  // чтобы кабинеты не конфликтовали при открытии в разных вкладках.
  const staff = store.get(STAFF_SESSION_COOKIE)?.value;
  const student = store.get(STUDENT_SESSION_COOKIE)?.value;
  // Возвращаем ту, что валидна (приоритет — staff, потом student).
  if (staff) return staff;
  if (student) return student;
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Текущий пользователь по сессии (null, если не авторизован). */
export async function currentUser(): Promise<SessionUser | null> {
  const token = await sessionToken();
  if (!token) return null;
  const checked = verifySessionToken(token);
  if (!checked) return null;
  const user = await db.orm.public.User.where({ id: checked.uid }).first();
  if (!user) return null;
  return {
    id: user.id,
    role: user.role,
    lastName: user.lastName,
    firstName: user.firstName,
  };
}

/**
 * Для server-компонентов защищённых страниц:
 * возвращает пользователя или редиректит на /login.
 */
export async function requireStaff(from?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user || user.role === "STUDENT") {
    redirect(from ? `/login?from=${from}` : "/login");
  }
  // Администраторов пускаем только в /admin — иначе они попадают
  // в кабинет библиотекаря и теряются (баг: from=/librarian по умолчанию).
  if (user!.role === "ADMIN") {
    redirect("/admin");
  }
  return user!;
}

/**
 * Для страниц администратора: только роль ADMIN.
 * Персонал без прав попадает в свою панель (/librarian).
 */
export async function requireAdmin(from?: string): Promise<SessionUser> {
  const user = await currentUser();
  if (!user || user.role === "STUDENT") {
    redirect(from ? `/login?from=${from}` : "/login");
  }
  if (user.role !== "ADMIN") {
    redirect("/librarian");
  }
  return user;
}

/**
 * Для API-роутов: возвращает пользователя-персонал или null
 * (роут отвечает 401 сам).
 */
export async function staffUser(): Promise<SessionUser | null> {
  const user = await currentUser();
  return user && user.role !== "STUDENT" ? user : null;
}

/**
 * Для API-роутов кабинета ученика: возвращает ученика по cookie-сессии
 * (после magic link или входа по логину/паролю) или null.
 */
export async function studentUser(): Promise<SessionUser | null> {
  const user = await currentUser();
  return user && user.role === "STUDENT" ? user : null;
}

/**
 * Для API-роутов, требующих роль ADMIN:
 * 401-ответ — если не вошёл, 403 — если вошёл, но не администратор.
 */
export async function adminGuard(): Promise<
  | { user: SessionUser }
  | { error: NextResponse }
> {
  const user = await currentUser();
  if (!user || user.role === "STUDENT") {
    return {
      error: NextResponse.json({ error: "Требуется вход" }, { status: 401 }),
    };
  }
  if (user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { error: "Недостаточно прав: нужен администратор" },
        { status: 403 }
      ),
    };
  }
  return { user };
}

const COOKIE_BASE = {
  httpOnly: true,
  sameSite: "lax" as const,
  // Не ставим Secure: приложение живёт во внутренней сети школы,
  // а локальный npm start работает по HTTP. Токен и так подписан HMAC.
  secure: false,
  path: "/",
};

export function sessionCookieValue(
  token: string,
  maxAge: number = SESSION_TTL_SEC
): {
  value: string;
  options: Record<string, unknown>;
} {
  return {
    value: token,
    options: { ...COOKIE_BASE, maxAge },
  };
}

/** Сбросить все cookie сессии (старое имя `session` тоже — иначе «Выйти» не выходит). */
export function clearSessionCookies(res: NextResponse) {
  const gone = { ...COOKIE_BASE, maxAge: 0, expires: new Date(0) };
  for (const name of [
    STAFF_SESSION_COOKIE,
    STUDENT_SESSION_COOKIE,
    SESSION_COOKIE,
  ]) {
    res.cookies.set(name, "", gone);
    res.cookies.delete(name);
  }
}

export function newSecret(): string {
  return randomBytes(32).toString("hex");
}
