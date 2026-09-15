import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { hashPassword } from "@/lib/auth";
import { db } from "@/lib/prisma";

/**
 * Ученические креденшелы (magic links, M23).
 *
 * Логин — фамилия в латинице + случайный суффикс (ivanov-8k2m),
 * пароль — 8 случайных символов. Ученик не придумывает их сам:
 * система создаёт при импорте класса (или «Создать для всех» в
 * разделе «Ссылки»), логин и пароль постоянно видны в кабинете.
 * Пароль в БД хранится зашифрованным (AES-256-GCM), чтобы его можно
 * было показать ученику в кабинете.
 */

// --- Транслитерация (кириллица → латиница) ---

const RU_LATIN: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts",
  ч: "ch", ш: "sh", щ: "shch", ъ: "", ь: "", э: "e", ю: "yu", я: "ya",
};

export function translitRu(name: string): string {
  return name
    .toLowerCase()
    .split("")
    .map((ch) => RU_LATIN[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]/g, "");
}

// Неоднозначные символы исключены (нет i, l, o, 0, 1).
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

function randChars(n: number): string {
  const bytes = randomBytes(n);
  let s = "";
  for (let i = 0; i < n; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return s;
}

/** Логин ученика: фамилия в латинице + 4 случайных символа. */
export function generateStudentLogin(lastName: string, taken: Set<string>): string {
  const base = translitRu(lastName) || "student";
  for (;;) {
    const login = `${base}-${randChars(4)}`;
    if (!taken.has(login)) {
      taken.add(login);
      return login;
    }
  }
}

export function generateStudentPassword(): string {
  return randChars(8);
}

// --- Хранение пароля: AES-256-GCM (ключ от SESSION_SECRET) ---

function pwKey(): Buffer {
  const s =
    process.env.SESSION_SECRET ??
    "dev-only-insecure-session-secret-0123456789abcdef";
  return createHash("sha256").update(`${s}:student-password`).digest();
}

/** Формат: ivBase64.tagBase64.cipherBase64 */
export function encryptPassword(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", pwKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return `${iv.toString("base64")}.${cipher.getAuthTag().toString("base64")}.${enc.toString("base64")}`;
}

export function decryptPassword(stored: string): string | null {
  try {
    const [ivB64, tagB64, dataB64] = stored.split(".");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      pwKey(),
      Buffer.from(ivB64, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}

// --- Создание/дополнение креденшелов ---

export interface StudentCredentials {
  login: string;
  /** Открытый пароль — нужен раз (при создании); дальше decryptPassword. */
  password: string;
  inviteToken: string;
}

/** Собрать недостающие поля креденшелов (без записи в БД). */
export function buildStudentCredentials(
  lastName: string,
  takenLogins: Set<string>,
  existing?: { login?: string | null; passwordHash?: string | null }
): {
  login?: string;
  password?: string;
  passwordHash?: string;
  passwordEnc?: string;
  inviteToken?: string;
} {
  const out: {
    login?: string;
    password?: string;
    passwordHash?: string;
    passwordEnc?: string;
    inviteToken?: string;
  } = { inviteToken: crypto.randomUUID() };

  if (!existing?.login) {
    const login = generateStudentLogin(lastName, takenLogins);
    const password = generateStudentPassword();
    out.login = login;
    out.password = password;
    out.passwordHash = hashPassword(password);
    out.passwordEnc = encryptPassword(password);
  }
  return out;
}

/**
 * Создать ученика с полными креденшелами (логин/пароль/QR/magic link).
 * Возвращает открытую пару login+password (для логов/проверок) —
 * в кабинете пароль берётся из decryptPassword.
 */
export async function createStudentWithCredentials(opts: {
  lastName: string;
  firstName: string;
  classId: string | null;
  takenLogins: Set<string>;
}): Promise<{ id: string; login: string; password: string }> {
  const cred = buildStudentCredentials(opts.lastName, opts.takenLogins);
  const student = await db.orm.public.User.create({
    role: "STUDENT",
    lastName: opts.lastName,
    firstName: opts.firstName,
    classId: opts.classId,
    qrToken: crypto.randomUUID(),
    login: cred.login!,
    passwordHash: cred.passwordHash!,
    passwordEnc: cred.passwordEnc!,
    inviteToken: cred.inviteToken!,
  });
  return { id: student.id, login: cred.login!, password: cred.password! };
}

/**
 * У ученика уже есть профиль, но нет креденшелов (импорт до M23) —
 * дополнить логином/паролем и magic link. Возвращает, что создано.
 */
export async function ensureStudentCredentials(
  userId: string,
  lastName: string,
  takenLogins: Set<string>
): Promise<StudentCredentials | null> {
  const user = await db.orm.public.User.where({ id: userId }).first();
  if (!user || user.role !== "STUDENT") return null;

  const needLogin = !user.login || !user.passwordHash;
  const needInvite = !user.inviteToken;
  if (!needLogin && !needInvite) return null;

  const cred = buildStudentCredentials(lastName, takenLogins, user);
  await db.orm.public.User.where({ id: userId }).update({
    ...(cred.login ? { login: cred.login } : {}),
    ...(cred.passwordHash ? { passwordHash: cred.passwordHash } : {}),
    ...(cred.passwordEnc ? { passwordEnc: cred.passwordEnc } : {}),
    ...(cred.inviteToken ? { inviteToken: cred.inviteToken } : {}),
  });

  return {
    login: cred.login ?? user.login!,
    // Для существующего логина пароль восстановить нельзя — показываем новый
    // только если создавали сейчас.
    password: cred.password ?? "",
    inviteToken: cred.inviteToken ?? user.inviteToken!,
  };
}
