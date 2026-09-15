/**
 * Замена `@serwist/next/window/internal` (см. sw-client.ts): единственный
 * используемый в sw-entry.mjs экспорт.
 *
 * Семантика обязана совпадать с оригиналом из @serwist/window: scope ("/")
 * резолвится против baseURI, и проверяется ПУТЬ текущей страницы. Версия
 * «window.location.href.startsWith(scope)» была всегда false для scope "/"
 * → sw-entry считал каждую страницу «вне scope» и не вызывал register():
 * service worker (а с ним весь офлайн-PWA) молча не работал в проде.
 */
export function isCurrentPageOutOfScope(scope: string): boolean {
  if (typeof window === "undefined") return true;
  const scopeURL = new URL(scope, document.baseURI);
  const scopeURLBasePath = new URL("./", scopeURL.href).pathname;
  return !window.location.pathname.startsWith(scopeURLBasePath);
}
