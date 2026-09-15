// Тесты шифрования паролей учеников (AES-GCM + отдельный ключ). Запуск:
//   node --experimental-strip-types scripts/test-password-crypto.mjs
//
// Проверяется то, на чём обычно и ломаются «безобидные» правки ключей:
// старые строки обязаны читаться, новые — шифроваться отдельным ключом, а
// битый/чужой текст не должен превращаться в исключение наружу.
let passed = 0;
let failed = 0;
const ok = (cond, name) => {
  if (cond) {
    passed++;
    console.log("  ✓", name);
  } else {
    failed++;
    console.error("  ✗", name);
  }
};

process.env.SESSION_SECRET = "s".repeat(64);
delete process.env.PASSWORD_ENC_KEY;

// Модуль без алиасов и без Next — можно импортировать чистым node.
const m = await import("../src/lib/password-crypto.ts");
const { encryptPassword, decryptPassword } = m;
/** Тот же набор символов, что у генератора: 8 штук без i/l/o/0/1. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
const generateStudentPassword = () =>
  Array.from(
    { length: 8 },
    () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  ).join("");

console.log("1. Без PASSWORD_ENC_KEY — режим совместимости (ключ от SESSION_SECRET)");
{
  const pw = generateStudentPassword();
  const enc = encryptPassword(pw);
  ok(!enc.startsWith("k2:"), "строка без префикса нового ключа");
  ok(decryptPassword(enc) === pw, "пароль читается round-trip");
  ok(/^[a-z0-9]{8}$/.test(pw), `сгенерирован 8 символов без неоднозначных (${pw})`);
}

console.log("2. С PASSWORD_ENC_KEY — новые записи помечаются и шифруются им");
{
  process.env.PASSWORD_ENC_KEY = "k".repeat(64);
  const pw = "abcdef23";
  const enc = encryptPassword(pw);
  ok(enc.startsWith("k2:"), "префикс k2 на месте");
  ok(decryptPassword(enc) === pw, "читается новым ключом");
}

console.log("3. Старые строки переживают включение отдельного ключа");
{
  process.env.PASSWORD_ENC_KEY = "";
  const legacyRow = encryptPassword("qwerty23");
  process.env.PASSWORD_ENC_KEY = "k".repeat(64);
  ok(decryptPassword(legacyRow) === "qwerty23", "наследие без префикса расшифровывается по-старому");
}

console.log("4. Ключ пропал — не падаем, а честно говорим «не могу»");
{
  const k2row = encryptPassword("zxcvb234");
  process.env.PASSWORD_ENC_KEY = "";
  ok(decryptPassword(k2row) === null, "k2-строка без ключа → null (не исключение)");
  process.env.PASSWORD_ENC_KEY = "k".repeat(64);
  ok(decryptPassword(k2row) === "zxcvb234", "…и снова читается, когда ключ вернули");
}

console.log("5. Порча текста и чужой ключ");
{
  process.env.PASSWORD_ENC_KEY = "";
  const enc = encryptPassword("mnbvcx12");
  const [iv, tag, data] = enc.split(".");
  const tampered = [iv, tag, Buffer.from("подмена").toString("base64")].join(".");
  ok(decryptPassword(tampered) === null, "GCM-тег не пропускает подменённый текст");
  ok(decryptPassword("не-база-64") === null, "мусор вместо записи → null");
  const otherKey = (() => {
    const before = process.env.SESSION_SECRET;
    process.env.SESSION_SECRET = "иной".repeat(20);
    const v = decryptPassword(enc);
    process.env.SESSION_SECRET = before;
    return v;
  })();
  ok(otherKey === null, "другой SESSION_SECRET не расшифровывает чужую запись");
}

console.log(`\n${passed} прошло, ${failed} упало`);
process.exit(failed === 0 ? 0 : 1);
