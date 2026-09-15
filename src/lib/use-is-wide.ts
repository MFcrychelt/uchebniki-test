"use client";

import { useEffect, useState } from "react";

/**
 * Ловушка на matchMedia: где начинается «широкий экран».
 *
 * Нужен не только для CSS-сеток, а для поведения: один и тот же
 * предпросмотр учебника на мониторе живёт в правой колонке, а на телефоне
 * открывается шторкой и блокирует прокрутку страницы. Держать это в двух
 * местах (media-запрос в классах + `window.innerWidth` в JS) — значит
 * однажды разойтись с брейкпоинтом Tailwind, поэтому порог один: 1024px = lg.
 */
export function useIsWide(query = "(min-width: 1024px)") {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(query);
    setWide(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setWide(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [query]);
  return wide;
}
