// Calendario de America/Santiago para los periodos de ALG-18 R7: semana ISO (lunes a lunes,
// rotulada con su año ISO), mes y año calendario. Cada periodo es [desde, hasta) entre
// medianoches locales, emitidas como instantes. El desfase se lee en cada instante (UTC−4 en
// invierno, UTC−3 en verano): un desfase fijo es un defecto.
const TIME_ZONE = "America/Santiago";
const DAY_MS = 86_400_000;

const formatter = new Intl.DateTimeFormat("en-US", {
  timeZone: TIME_ZONE,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

function localParts(ms) {
  const parts = {};
  for (const { type, value } of formatter.formatToParts(new Date(ms))) parts[type] = Number(value);
  return parts;
}

function offsetAt(ms) {
  const p = localParts(ms);
  const wallClock = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return wallClock - Math.floor(ms / 1000) * 1000;
}

function civilDate(year, month, day) {
  const date = new Date(Date.UTC(year, month - 1, day));
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate() };
}

function sameDate(parts, date) {
  return parts.year === date.year && parts.month === date.month && parts.day === date.day;
}

// Primer instante del día local. Si la medianoche no existe (cambio de hora a las 24:00), el día
// empieza en el instante del cambio.
function startOfLocalDay(date) {
  const wallClock = Date.UTC(date.year, date.month - 1, date.day);
  const candidates = [offsetAt(wallClock - DAY_MS / 2), offsetAt(wallClock + DAY_MS / 2)]
    .map((offset) => wallClock - offset)
    .filter((ms) => sameDate(localParts(ms), date))
    .sort((a, b) => a - b);
  return candidates[0];
}

function isoWeekday(date) {
  return new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() || 7;
}

function isoWeek(monday) {
  const thursday = civilDate(monday.year, monday.month, monday.day + 3);
  const firstThursday = civilDate(thursday.year, 1, 4 - isoWeekday(civilDate(thursday.year, 1, 4)) + 4);
  const week = 1 + Math.round((Date.UTC(thursday.year, thursday.month - 1, thursday.day)
    - Date.UTC(firstThursday.year, firstThursday.month - 1, firstThursday.day)) / (7 * DAY_MS));
  return { year: thursday.year, week };
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function bounds(granularidad, ms) {
  const today = localParts(ms);
  if (granularidad === "semana") {
    const monday = civilDate(today.year, today.month, today.day - (isoWeekday(today) - 1));
    const { year, week } = isoWeek(monday);
    return {
      clave: `${year}-W${pad(week)}`,
      start: monday,
      end: civilDate(monday.year, monday.month, monday.day + 7),
    };
  }
  if (granularidad === "mes") {
    return {
      clave: `${today.year}-${pad(today.month)}`,
      start: civilDate(today.year, today.month, 1),
      end: civilDate(today.year, today.month + 1, 1),
    };
  }
  if (granularidad === "año") {
    return {
      clave: String(today.year),
      start: civilDate(today.year, 1, 1),
      end: civilDate(today.year + 1, 1, 1),
    };
  }
  throw new Error(`granularidad desconocida: ${granularidad}`);
}

export function periodOf(instant, granularidad) {
  const { clave, start, end } = bounds(granularidad, Date.parse(instant));
  return {
    clave,
    desde: new Date(startOfLocalDay(start)).toISOString(),
    hasta: new Date(startOfLocalDay(end)).toISOString(),
  };
}

export function periodsBetween(fromInstant, toInstant, granularidad) {
  const last = periodOf(toInstant, granularidad);
  const periods = [];
  let period = periodOf(fromInstant, granularidad);
  while (Date.parse(period.desde) <= Date.parse(last.desde)) {
    periods.push(period);
    period = periodOf(period.hasta, granularidad);
  }
  return periods;
}
