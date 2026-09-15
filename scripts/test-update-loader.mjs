// Loader-хук: разрешает относительные импорты без расширения как .ts
// (нужно, чтобы Node --experimental-strip-types мог грузить src/*.ts
// с импортами в стиле bundler).
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (e) {
    if (
      e.code === "ERR_MODULE_NOT_FOUND" &&
      specifier.startsWith(".") &&
      !specifier.endsWith(".ts")
    ) {
      return nextResolve(specifier + ".ts", context);
    }
    throw e;
  }
}
