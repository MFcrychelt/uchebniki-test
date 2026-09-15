import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

/**
 * Хранение пароля ученика в обратимом виде: AES-256-GCM.
 *
 * Пароль ученика живёт в базе дважды: хеш (scrypt) — для проверки входа, и
 * шифрованный текст `users.password_enc` — чтобы ученик мог посмотреть свой
 * пароль в кабинете (его печатают на карточке, дети его теряют).
 *
 * Почему отдельный модуль и отдельный ключ:
 *  · раньше ключ выводился из SESSION_SECRET. Это связывало две разные тайны:
 *    утёк env — и поддельные сессии, и все пароли учеников разом; а ротация
 *    SESSION_SECRET (то, что советуют после утечки) делала `password_enc`
 *    нечитаемым;
 *  · теперь есть PASSWORD_ENC_KEY:
 *      есть (не короче 32 символов) → новые записи шифруются им и помечаются
 *      префиксом `k2:`;
 *      его ещё не завели → шифруем по-старому (от SESSION_SECRET), чтобы
 *      уже работающей школе не пришлось перегенерировать всю базу из-за
 *      обновления;
 *      при расшифровке смотрим на префикс, поэтому старые строки читаются
 *      всегда — и после того, как ключ завели.
 *
 * Тесты: npm run test:crypto (чистый node, без Next).
 */

/** Пометка «зашифровано отдельным PASSWORD_ENC_KEY». */
const NEW_KEY_PREFIX = "k2:";

const DEV_FALLBACK = "dev-only-insecure-session-secret-0123456789abcdef";

function deriveKey(secret: string, info: string): Buffer {
  return createHash("sha256").update(`${secret}:${info}`).digest();
}

/** Есть ли полноценный отдельный ключ. */
export function hasDedicatedKey(): boolean {
  return (process.env.PASSWORD_ENC_KEY ?? "").length >= 32;
}

function keyFor(kind: "new" | "legacy"): Buffer {
  return kind === "new"
    ? deriveKey(process.env.PASSWORD_ENC_KEY ?? "", "password-enc-key")
    : deriveKey(process.env.SESSION_SECRET ?? DEV_FALLBACK, "student-password");
}

/** Формат записи: [k2:]ivBase64.tagBase64.cipherBase64 */
export function encryptPassword(plain: string): string {
  const useNew = hasDedicatedKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(
    "aes-256-gcm",
    keyFor(useNew ? "new" : "legacy"),
    iv
  );
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const body = `${iv.toString("base64")}.${cipher
    .getAuthTag()
    .toString("base64")}.${enc.toString("base64")}`;
  return useNew ? NEW_KEY_PREFIX + body : body;
}

function decryptWith(stored: string, kind: "new" | "legacy"): string | null {
  try {
    const [ivB64, tagB64, dataB64] = stored.split(".");
    if (!ivB64 || !tagB64 || !dataB64) return null;
    const decipher = createDecipheriv(
      "aes-256-gcm",
      keyFor(kind),
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

/**
 * Открытый пароль ученика или null — ключ не подошёл / запись повреждена.
 * null наружу не бросается: показ пароля не должен ронять кабинет, если
 * настройки сервера менялись.
 */
export function decryptPassword(stored: string): string | null {
  if (typeof stored !== "string" || stored.length === 0) return null;
  if (stored.startsWith(NEW_KEY_PREFIX)) {
    const body = stored.slice(NEW_KEY_PREFIX.length);
    return hasDedicatedKey() ? decryptWith(body, "new") : null;
  }
  // Строка без префикса — наследие до PASSWORD_ENC_KEY.
  return (
    decryptWith(stored, "legacy") ??
    (hasDedicatedKey() ? decryptWith(stored, "new") : null)
  );
}
