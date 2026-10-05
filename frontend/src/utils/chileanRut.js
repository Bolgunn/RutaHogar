// Canonical RUT representation used by the profile work in origin/develop:
// digits, a hyphen, and an uppercase verification digit (for example 12345678-5).
export function normalizeChileanRut(value) {
  const compact = String(value || "").trim().replace(/[^0-9kK]/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(compact)) return "";

  const number = compact.slice(0, -1);
  const verificationDigit = compact.slice(-1);
  let remainder = 0;
  let multiplier = 2;

  for (let index = number.length - 1; index >= 0; index -= 1) {
    remainder += Number(number[index]) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const expected = 11 - (remainder % 11);
  const expectedDigit = expected === 11 ? "0" : expected === 10 ? "K" : String(expected);
  return verificationDigit === expectedDigit ? `${number}-${verificationDigit}` : "";
}

export function formatChileanRutInput(value) {
  const source = String(value || "");
  const compact = source.replace(/[^0-9kK]/g, "").toUpperCase().slice(0, 9);
  if (!compact) return "";

  const hasExplicitVerificationDigit = !/-\s*$/.test(source)
    && (source.includes("-") || /K$/i.test(compact) || compact.length === 9);
  const body = hasExplicitVerificationDigit ? compact.slice(0, -1) : compact;
  const verificationDigit = hasExplicitVerificationDigit ? compact.slice(-1) : "";
  const formattedBody = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return verificationDigit ? `${formattedBody}-${verificationDigit}` : formattedBody;
}

export function isValidChileanRut(value) {
  return Boolean(normalizeChileanRut(value));
}
