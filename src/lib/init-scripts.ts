/**
 * Ключи localStorage и инлайн-скрипты «до первой отрисовки».
 *
 * Модуль намеренно БЕЗ «use client». Раньше обе строки жили в клиентских
 * компонентах (components/theme.tsx, components/accessibility.tsx), а
 * серверный layout импортировал их оттуда. Получалось две независимые
 * копии одной константы — в серверном и в клиентском бандле. Пока значения
 * совпадают, всё молчит; стоит клиентскому чанку устареть (Fast Refresh в
 * dev, прод-сборка поверх работающего dev-сервера, кривой кэш браузера) или
 * расширению браузера править inline-скрипт — и React на гидрации видит в
 * `__html` разницу и печатает «A tree hydrated but some attributes of the
 * server rendered HTML didn't match the client properties».
 *
 * Здесь — единственный источник значений; содержимое этих двух <script>
 * React не сравнивает (suppressHydrationWarning в layout), потому что его
 * правит не React, а сам документ.
 */

/** Выбор темы (светлая/тёмная/системная). */
export const THEME_KEY = "uchebniki:theme";

/** Режим отображения (контраст/дальтонизм) и «лёгкий» режим. */
export const A11Y_KEY = "uchebniki:a11y";
export const PERF_KEY = "uchebniki:perf";

/**
 * Цвет «хрома» мобильного браузера (статус-бар, адресная строка) — по фону
 * приложения, иначе на телефоне сверху видна чужая белая/синяя полоса.
 * Держится в одном месте: отсюда его берут и layout (мета theme-color),
 * и инлайн-скрипт, и переключатель темы.
 *
 * Тёмная тема = фон rgb(3 8 10) из globals.css (карточки — rgb(8 13 15)):
 * хром обязан совпадать ровно с ним, иначе над почти-чёрным экраном
 * висит серая полоса, и на OLED это видно сразу.
 */
export const THEME_COLORS = { light: "#f7f8fa", dark: "#03080a" } as const;

/**
 * Инлайн-скрипт ДО первой отрисовки: без него при тёмной теме страница
 * мигнула бы белым (FOUC). Ставим первым элементом <body> в layout.
 */
export const themeInitScript = `(function(){try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark"&&t!=="system")t="system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);var el=document.documentElement;el.classList.toggle("dark",d);el.style.colorScheme=d?"dark":"light";var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",d?"${THEME_COLORS.dark}":"${THEME_COLORS.light}");}catch(e){}})();`;

/** Тот же приём для режимов доступности — иначе цвета скачут при загрузке. */
export const a11yInitScript = `(function(){try{var d=document.documentElement;var m=localStorage.getItem("${A11Y_KEY}");if(m==="contrast"||m==="daltonism-rg"||m==="daltonism-by")d.setAttribute("data-a11y",m);if(localStorage.getItem("${PERF_KEY}")==="lean")d.setAttribute("data-perf","lean");}catch(e){}})();`;
