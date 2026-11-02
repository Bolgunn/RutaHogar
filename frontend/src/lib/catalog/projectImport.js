import { comunasMvp } from "../../constants/comunas";
import { estadoProyectoLabels, tipoProyectoLabels } from "../../constants/proyectos";
import { validateProject } from "../../services/projectValidation";

// HU 25 — carga masiva del catálogo desde CSV. Lógica pura: parsea el archivo y
// pasa cada fila por validateProject(), la misma regla del formulario, para que
// el archivo no sea una puerta trasera. Decisiones en
// docs/stories/HU25-carga-masiva-proyectos/PLAN.md.

// Tope del plan (Local logic); la función importar_proyectos() aplica el mismo.
export const IMPORT_MAX_ROWS = 500;
export const IMPORT_MAX_BYTES = 1_000_000;

export const IMPORT_COLUMNS = [
  { key: "nombre", required: true },
  { key: "comuna", required: true },
  { key: "tipo", required: true },
  { key: "precio_min_uf", required: true },
  { key: "precio_max_uf", required: true },
  { key: "estado", required: true },
  { key: "descripcion", required: false },
  { key: "entrega_estimada", required: false },
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

// Formato chileno: "3.500" y "3.500,5" llevan punto de miles; "3500", "3500,5"
// y "3500.5" no. "3,500" se rechaza: puede ser 3,5 o 3.500 y adivinar sería
// un error de mil veces.
export function parseImportNumber(raw) {
  const value = String(raw ?? "").trim().replace(/\s+/g, "");
  if (!value) return NaN;
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(value)) {
    return Number(value.replace(/\./g, "").replace(",", "."));
  }
  if (/^\d+,\d{3}$/.test(value)) return NaN;
  if (/^\d+([.,]\d+)?$/.test(value)) return Number(value.replace(",", "."));
  return NaN;
}

function matchCanonical(raw, options) {
  const target = foldKey(raw);
  return options.find((option) => foldKey(option.value) === target || foldKey(option.label) === target)?.value;
}

const comunaOptions = comunasMvp.map((comuna) => ({ value: comuna, label: comuna }));
const tipoOptions = Object.entries(tipoProyectoLabels).map(([value, label]) => ({ value, label }));
const estadoOptions = Object.entries(estadoProyectoLabels).map(([value, label]) => ({ value, label }));

function normalizeRow(values, inmobiliariaId) {
  const text = (key) => String(values[key] ?? "").trim();
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
    const raw = String(values[key] ?? "").trim();
    if (raw && Number.isNaN(input[key])) {
      errors[key] = `«${raw}» no es un número válido. Escribe solo cifras, por ejemplo 3500 o 3.500,5.`;
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

// La fila de cada resultado es la de la planilla: encabezado = 1, primer
// proyecto = 2. Las filas en blanco se saltan pero se cuentan.
export function analyzeProjectImport(text, { inmobiliariaId, existingProjects = [] } = {}) {
  if (!inmobiliariaId) {
    return emptyAnalysis(["Elige la inmobiliaria donde se cargarán los proyectos."]);
  }

  const { records } = parseCsv(text);
  const [header = [], ...body] = records;
  if (!header.some((cell) => cell.trim())) {
    return emptyAnalysis(["El archivo está vacío. Usa la plantilla y agrega una fila por proyecto."]);
  }

  const fileErrors = [];
  const warnings = [];
  const columnIndex = {};
  header.forEach((cell, index) => {
    const key = foldKey(cell);
    if (!key) return;
    if (!COLUMN_KEYS.includes(key)) {
      warnings.push(
        key === "inmobiliaria_id" || key === "inmobiliaria"
          ? `Se ignoró la columna «${cell.trim()}»: los proyectos siempre se cargan en la inmobiliaria elegida aquí.`
          : `Se ignoró la columna «${cell.trim()}»: no es parte del catálogo.`,
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

  body.forEach((cells, index) => {
    if (!cells.some((cell) => cell.trim())) return;
    const fila = index + 2;
    const values = Object.fromEntries(
      Object.entries(columnIndex).map(([key, position]) => [key, cells[position] ?? ""]),
    );
    const input = normalizeRow(values, inmobiliariaId);
    const errors = rowErrors(values, input);

    if (cells.length > header.length && cells.slice(header.length).some((cell) => cell.trim())) {
      errors.push({
        columna: null,
        mensaje: "La fila tiene más valores que columnas. Si un texto incluye el separador, enciérralo entre comillas.",
      });
    }

    const key = nameKey(input.nombre);
    if (key && firstRowByName.has(key)) {
      errors.push({ columna: "nombre", mensaje: `El nombre se repite: ya está en la fila ${firstRowByName.get(key)}.` });
    } else if (key) {
      firstRowByName.set(key, fila);
    }

    rows.push({ fila, input, errors, accion: existing.has(key) ? "actualizar" : "crear" });
  });

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
