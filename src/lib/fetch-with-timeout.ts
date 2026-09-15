/**
 * fetch с таймаутом.
 *
 * Мотивация: через Cloudflare-туннель и/или мобильную сеть запрос может
 * «зависнуть» — сервер (или промежуточный прокси) не отвечает и не
 * закрывает соединение. У обычного fetch нет таймаута: промис не
 * резолвится и не реджектится, а кнопка «Входим…» крутится бесконечно.
 * AbortController превращает зависание в обычную ошибку сети, которую
 * можно показать пользователю.
 */
export async function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = 20_000
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}
