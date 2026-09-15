/**
 * QR-код ученика содержит либо голый токен, либо ссылку
 * `${origin}/student?qr=<токен>` (так он кодируется на карточке, чтобы
 * любой телефон с камерой открывал кабинет по глубокой ссылке).
 * Извлекаем токен из любого из вариантов.
 */
export function extractQrToken(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (trimmed.includes("?")) {
    try {
      const url = new URL(trimmed);
      const qr = url.searchParams.get("qr");
      if (qr) return qr;
    } catch {
      // не URL — пробуем как голый токен
    }
  }
  return trimmed;
}
