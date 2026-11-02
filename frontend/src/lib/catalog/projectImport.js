import { comunasMvp } from "../../constants/comunas";
import { estadoProyectoLabels, tipoProyectoLabels } from "../../constants/proyectos";
import { validateProject } from "../../services/projectValidation";

// HU 25 — carga masiva del catálogo desde CSV o Excel. Lógica pura: recibe las
// filas del archivo y pasa cada una por validateProject(), la misma regla del
// formulario, para que el archivo no sea una puerta trasera. Decisiones en
// docs/stories/HU25-carga-masiva-proyectos/PLAN.md.

// Tope del plan (Local logic); la función importar_proyectos() aplica el mismo.
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1_000_000;

// `ayuda` y `ejemplo` los muestran el modal y la hoja de instrucciones de la plantilla Excel.
export const IMPORT_COLUMNS = [
  { key: "nombre", required: true, ayuda: "Nombre del proyecto. Si ya existe en tu catálogo, la fila lo actualiza.", ejemplo: "Parque Ñuñoa" },
  { key: "comuna", required: true, ayuda: "Una comuna del catálogo de la Región Metropolitana.", ejemplo: "Ñuñoa" },
  { key: "tipo", required: true, ayuda: "departamento o casa.", ejemplo: "departamento" },
  { key: "precio_min_uf", required: true, ayuda: "Precio en UF de la unidad más barata, mayor que 0. El punto separa miles y la coma decimales.", ejemplo: "3.200" },
  { key: "precio_max_uf", required: true, ayuda: "Precio en UF de la unidad más cara, igual o mayor que el mínimo.", ejemplo: "4.850,5" },
  { key: "estado", required: true, ayuda: "disponible, en_construccion o agotado.", ejemplo: "disponible" },
  { key: "descripcion", required: false, ayuda: "Texto para la vitrina, hasta 500 caracteres.", ejemplo: "A pasos del metro" },
  { key: "entrega_estimada", required: false, ayuda: "Mes de entrega en formato AAAA-MM.", ejemplo: "2027-06" },
];

const COLUMN_KEYS = IMPORT_COLUMNS.map((column) => column.key);
const PRICE_KEYS = ["precio_min_uf", "precio_max_uf"];

// Separador y BOM que Excel en configuración chilena abre en columnas y con tildes.
export function buildImportTemplate() {
  return `﻿${COLUMN_KEYS.join(";")}\r\n`;
}

// "CSV (delimitado por comas)" de Excel en Windows se guarda en Windows-1252,
// no en UTF-8; leerlo como UTF-8 rompería cada tilde y cada Ñ.
export function decodeImportFile(buffer) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder("windows-1252").decode(buffer);
  }
}

function fold(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function foldKey(value) {
  return fold(value).replace(/\s+/g, "_");
}

// Igual que lower(btrim(nombre)) en la base: es la identidad del proyecto.
function nameKey(value) {
  return String(value ?? "").trim().toLowerCase();
}

function detectDelimiter(text) {
  let semicolons = 0;
  let commas = 0;
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char === ";") semicolons += 1;
    else if (!quoted && char === ",") commas += 1;
  }
  return commas > semicolons ? "," : ";";
}

// RFC 4180. Cada registro es una fila de la planilla: un salto de línea dentro
// de comillas no abre fila nueva, igual que en Excel.
export function parseCsv(input) {
  const text = String(input ?? "").replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const records = [];
  let cells = [];
  let cell = "";
  let quoted = false;

  const endCell = () => {
    cells.push(cell);
    cell = "";
  };
  const endRecord = () => {
    endCell();
    records.push(cells);
    cells = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      endCell();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      endRecord();
    } else {
      cell += char;
    }
  }
  if (cell !== "" || cells.length) endRecord();

  return { delimiter, records };
}

// Montos al estilo chileno: el punto separa miles y la coma, si aparece, separa
// decimales ("51.000", "$51.000,00", "UF 3.250,5"). Por tolerancia también se lee
// un punto decimal que no forma grupos de miles ("9200.5", de planillas en
// inglés). Una celda numérica de Excel ya llega como número. Cualquier otra
// cosa devuelve NaN; nunca lanza.
export function parseImportNumber(raw) {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : NaN;
  if (typeof raw !== "string") return NaN;
  const value = raw
    .replace(/\s+/g, "")
    .replace(/^(\$|uf|clp|u\.f\.)/i, "")
    .replace(/(\$|uf|clp|u\.f\.)$/i, "");
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(value) || /^\d+(,\d+)?$/.test(value)) {
    return Number(value.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d+\.\d+$/.test(value)) return Number(value);
  return NaN;
}

// Excel convierte "2027-06" en una fecha al escribirlo. Se devuelve el mes,
// que es lo único que guarda el catálogo.
function dateToText(date, key) {
  if (Number.isNaN(date.getTime())) return "";
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return key === "entrega_estimada"
    ? `${date.getUTCFullYear()}-${month}`
    : `${date.getUTCFullYear()}-${month}-${day}`;
}

function cellText(value, key) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return dateToText(value, key);
  return String(value).trim();
}

function isBlankRecord(cells) {
  return !cells.some((cell) => cellText(cell) !== "");
}

function matchCanonical(raw, options) {
  const target = foldKey(raw);
  return options.find((option) => foldKey(option.value) === target || foldKey(option.label) === target)?.value;
}

const comunaOptions = comunasMvp.map((comuna) => ({ value: comuna, label: comuna }));
const tipoOptions = Object.entries(tipoProyectoLabels).map(([value, label]) => ({ value, label }));
const estadoOptions = Object.entries(estadoProyectoLabels).map(([value, label]) => ({ value, label }));

function normalizeRow(values, inmobiliariaId) {
  const text = (key) => cellText(values[key], key);
  const canonical = (key, options) => {
    const raw = text(key);
    return raw ? matchCanonical(raw, options) ?? raw : "";
  };
  return {
    inmobiliaria_id: inmobiliariaId,
    nombre: text("nombre"),
    comuna: canonical("comuna", comunaOptions),
    tipo: canonical("tipo", tipoOptions),
    estado: canonical("estado", estadoOptions),
    precio_min_uf: parseImportNumber(values.precio_min_uf),
    precio_max_uf: parseImportNumber(values.precio_max_uf),
    descripcion: text("descripcion"),
    entrega_estimada: text("entrega_estimada"),
  };
}

function rowErrors(values, input) {
  const { errors } = validateProject(input);
  for (const key of PRICE_KEYS) {
    const raw = cellText(values[key], key);
    if (raw && Number.isNaN(input[key])) {
      errors[key] = `«${raw}» no es un monto válido. Escribe solo cifras, por ejemplo 3500, 3.500 o 3.500,5.`;
    }
  }
  return COLUMN_KEYS.filter((key) => errors[key]).map((key) => ({ columna: key, mensaje: errors[key] }));
}

function emptyAnalysis(fileErrors, warnings = []) {
  return {
    fileErrors,
    warnings,
    rows: [],
    summary: { filas: 0, validas: 0, conErrores: 0, crear: 0, actualizar: 0 },
    canImport: false,
  };
}

// `records` son las filas de la planilla en orden, con las vacías incluidas:
// el registro i es la fila i + 1 de Excel. El encabezado es la primera fila
// con contenido. Cada celda puede ser texto, número, booleano, fecha o null.
export function analyzeProjectRecords(records, { inmobiliariaId, existingProjects = [] } = {}) {
  if (!inmobiliariaId) {
    return emptyAnalysis(["No se pudo determinar la inmobiliaria de tu sesión."]);
  }

  const headerIndex = records.findIndex((cells) => !isBlankRecord(cells));
  if (headerIndex === -1) {
    return emptyAnalysis(["El archivo está vacío. Usa la plantilla y agrega una fila por proyecto."]);
  }
  const header = records[headerIndex].map((cell) => cellText(cell));

  const fileErrors = [];
  const warnings = [];
  const columnIndex = {};
  header.forEach((cell, index) => {
    const key = foldKey(cell);
    if (!key) return;
    if (!COLUMN_KEYS.includes(key)) {
      warnings.push(
        key === "inmobiliaria_id" || key === "inmobiliaria"
          ? `Se ignoró la columna «${cell}»: los proyectos siempre se cargan en la inmobiliaria de tu sesión.`
          : `Se ignoró la columna «${cell}»: no es parte del catálogo.`,
      );
    } else if (key in columnIndex) {
      fileErrors.push(`La columna «${key}» aparece más de una vez en el encabezado.`);
    } else {
      columnIndex[key] = index;
    }
  });
  for (const column of IMPORT_COLUMNS) {
    if (column.required && !(column.key in columnIndex)) {
      fileErrors.push(`Falta la columna obligatoria «${column.key}».`);
    }
  }
  if (fileErrors.length) return emptyAnalysis(fileErrors, warnings);

  const existing = new Set(
    existingProjects
      .filter((project) => project?.inmobiliaria_id === inmobiliariaId)
      .map((project) => nameKey(project.nombre)),
  );
  const firstRowByName = new Map();
  const rows = [];
  const lastHeader = header.reduce((last, cell, position) => (cell ? position : last), -1);

  for (let index = headerIndex + 1; index < records.length; index += 1) {
    const cells = records[index];
    if (isBlankRecord(cells)) continue;
    const fila = index + 1;
    const values = Object.fromEntries(
      Object.entries(columnIndex).map(([key, position]) => [key, cells[position] ?? null]),
    );
    const input = normalizeRow(values, inmobiliariaId);
    const errors = rowErrors(values, input);

    if (cells.slice(lastHeader + 1).some((cell) => cellText(cell) !== "")) {
      errors.push({
        columna: null,
        mensaje: "La fila tiene valores fuera de las columnas del encabezado. Si un texto incluye el separador, enciérralo entre comillas.",
      });
    }

    const key = nameKey(input.nombre);
    if (key && firstRowByName.has(key)) {
      errors.push({ columna: "nombre", mensaje: `El nombre se repite: ya está en la fila ${firstRowByName.get(key)}.` });
    } else if (key) {
      firstRowByName.set(key, fila);
    }

    rows.push({ fila, input, errors, accion: existing.has(key) ? "actualizar" : "crear" });
  }

  if (!rows.length) fileErrors.push("El archivo no tiene filas de proyectos debajo del encabezado.");
  if (rows.length > IMPORT_MAX_ROWS) {
    fileErrors.push(
      `El archivo tiene ${rows.length} proyectos y el máximo por carga es ${IMPORT_MAX_ROWS}. Divídelo en varios archivos.`,
    );
  }

  const valid = rows.filter((row) => !row.errors.length);
  return {
    fileErrors,
    warnings,
    rows,
    summary: {
      filas: rows.length,
      validas: valid.length,
      conErrores: rows.length - valid.length,
      crear: valid.filter((row) => row.accion === "crear").length,
      actualizar: valid.filter((row) => row.accion === "actualizar").length,
    },
    canImport: !fileErrors.length && rows.length > 0 && valid.length === rows.length,
  };
}

export function analyzeProjectImport(text, options) {
  return analyzeProjectRecords(parseCsv(text).records, options);
}

// Lo que recibe importar_proyectos(): los ocho campos del catálogo. El tenant
// no viaja en las filas; lo decide la sesión.
export function toImportPayload(analysis) {
  return analysis.rows.map(({ input }) => ({
    nombre: input.nombre,
    comuna: input.comuna,
    tipo: input.tipo,
    precio_min_uf: input.precio_min_uf,
    precio_max_uf: input.precio_max_uf,
    estado: input.estado,
    descripcion: input.descripcion || null,
    entrega_estimada: input.entrega_estimada || null,
  }));
}
