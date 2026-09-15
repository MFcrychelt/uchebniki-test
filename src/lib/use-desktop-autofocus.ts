"use client";

import { useEffect, useRef } from "react";

/**
 * Есть ли на устройстве физическая клавиатура (и, значит, полезен ли
 * автофокус в поле ввода).
 *
 * Зачем это отдельно: `autoFocus` на телефоне открывает клавиатуру ещё до
 * того, как человек посмотрел на экран. В PWA (standalone) это ломалось
 * вдвойне — viewport пересобирается под клавиатуру
 * (`interactive-widget=resizes-content` в layout.tsx), страница
 * перерисовывается, фокус ставится заново, и экран начинал мигать по
 * кругу. На мониторе библиотекаря автофокус, наоборот, экономит клик:
 * открыл «Вход» — и сразу печатаешь логин.
 *
 * Определяем по указателю, а не по ширине экрана: планшет с клавиатурой и
 * узкое окно браузера на мониторе различаются именно так. `(pointer:
 * coarse)` / отсутствие `(hover: hover)` — это тач-экран.
 */
export function hasHardwareKeyboard(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  const touch =
    window.matchMedia("(pointer: coarse)").matches ||
    !window.matchMedia("(hover: hover)").matches;
  return !touch;
}

/**
 * Ref для поля, в которое ставим фокус только на «клавиатурных»
 * устройствах. На телефоне поле остаётся пустым — клавиатура появится,
 * когда человек сам по нему тапнет.
 */
export function useDesktopAutoFocus<T extends HTMLElement>(active = true) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    if (!hasHardwareKeyboard()) return;
    // preventScroll: фокус не должен прокручивать страницу — форма и так
    // на экране, а лишний скролл на входе читается как «прыгнуло».
    ref.current?.focus({ preventScroll: true });
  }, [active]);

  return ref;
}
