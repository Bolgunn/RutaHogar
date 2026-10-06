export function formatRut(rut) {
  if (!rut) return "";
  
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length === 0) return "";
  
  if (clean.length === 1) return clean;
  
  const dv = clean.slice(-1);
  let rutNumber = clean.slice(0, -1);
  
  rutNumber = rutNumber.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  
  return `${rutNumber}-${dv}`;
}

export function validateRut(rut) {
  if (!rut) return false;
  
  const clean = rut.replace(/[^0-9kK]/g, "").toUpperCase();
  if (clean.length < 8) return false;
  
  const rutNumber = clean.slice(0, -1);
  const dv = clean.slice(-1);
  
  let t = parseInt(rutNumber, 10);
  let m = 0, s = 1;
  for (; t; t = Math.floor(t / 10)) {
    s = (s + t % 10 * (9 - m++ % 6)) % 11;
  }
  const expectedDv = s ? String(s - 1) : "K";
  return expectedDv === dv;
}
