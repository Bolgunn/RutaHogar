import { describe, expect, it } from "vitest";
import { validateProject } from "../../../services/projectValidation";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_ROWS,
  analyzeProjectImport,
  buildImportTemplate,
  decodeImportFile,
  parseCsv,
  parseImportNumber,
  toImportPayload,
} from "../projectImport";

const TENANT = "tenant-a";
const HEADER = "nombre;comuna;tipo;precio_min_uf;precio_max_uf;estado;descripcion;entrega_estimada";
const VALID = "Parque Ñuñoa;Ñuñoa;departamento;3200;4850;disponible;Cerca del metro;2027-06";

function analyze(lines, options = {}) {
  return analyzeProjectImport(lines.join("\r\n"), { inmobiliariaId: TENANT, ...options });
}

function errorsOf(analysis, fila) {
  return analysis.rows.find((row) => row.fila === fila)?.errors ?? [];
}

describe("template", () => {
  it("the template lists every catalog column, in order", () => {
    const { records } = parseCsv(buildImportTemplate());
    expect(records).toEqual([IMPORT_COLUMNS.map((column) => column.key)]);
  });

  it("the template round-trips through the parser and is Excel-friendly", () => {
    const template = buildImportTemplate();
    expect(template.startsWith("﻿")).toBe(true);
    expect(template.endsWith("\r\n")).toBe(true);
    expect(parseCsv(template).delimiter).toBe(";");
    const analysis = analyzeProjectImport(`${template}${VALID}\r\n`, { inmobiliariaId: TENANT });
    expect(analysis.canImport).toBe(true);
  });

  it("an untouched template has no project rows and cannot be imported", () => {
    const analysis = analyzeProjectImport(buildImportTemplate(), { inmobiliariaId: TENANT });
    expect(analysis.canImport).toBe(false);
    expect(analysis.fileErrors).toHaveLength(1);
  });
});

describe("parseCsv", () => {
  it("detects ; and , from the header line", () => {
    expect(parseCsv("a;b;c\n1;2;3").delimiter).toBe(";");
    expect(parseCsv("a,b,c\n1,2,3").delimiter).toBe(",");
  });

  it("handles quotes, escaped quotes, separators and line breaks inside quotes", () => {
    const { records } = parseCsv('a;b\r\n"x;y";"dice ""hola""\notra línea"\r\n');
    expect(records).toEqual([["a", "b"], ["x;y", 'dice "hola"\notra línea']]);
  });

  it("accepts LF, CRLF and a missing final newline", () => {
    expect(parseCsv("a;b\n1;2").records).toEqual([["a", "b"], ["1", "2"]]);
    expect(parseCsv("a;b\r\n1;2\r\n").records).toEqual([["a", "b"], ["1", "2"]]);
  });
});

describe("decodeImportFile", () => {
  it("reads UTF-8 (with BOM) and Excel's Windows-1252 CSV alike", () => {
    const utf8 = new TextEncoder().encode("﻿nombre;comuna\nÁlamos;Ñuñoa");
    const latin1 = Uint8Array.from([..."nombre;comuna\n"].map((c) => c.charCodeAt(0)).concat([0xc1, 0x6c, 0x61, 0x6d, 0x6f, 0x73, 0x3b, 0xd1, 0x75, 0xf1, 0x6f, 0x61]));
    expect(parseCsv(decodeImportFile(utf8.buffer)).records[1]).toEqual(["Álamos", "Ñuñoa"]);
    expect(parseCsv(decodeImportFile(latin1.buffer)).records[1]).toEqual(["Álamos", "Ñuñoa"]);
  });
});

describe("parseImportNumber", () => {
  it.each([
    ["3500", 3500],
    ["3.500", 3500],
    ["3.500,5", 3500.5],
    ["1.234.567", 1234567],
    ["3500,5", 3500.5],
    ["3500.5", 3500.5],
    [" 3 500 ", 3500],
  ])("reads %s as %s", (raw, expected) => {
    expect(parseImportNumber(raw)).toBe(expected);
  });

  it.each(["", "abc", "3,500", "3.500.5", "1,234.5", "-3000", "3500 UF"])("rejects %j", (raw) => {
    expect(parseImportNumber(raw)).toBeNaN();
  });
});

describe("analyzeProjectImport — file level", () => {
  it("requires a target inmobiliaria", () => {
    const analysis = analyzeProjectImport([HEADER, VALID].join("\n"), {});
    expect(analysis.canImport).toBe(false);
    expect(analysis.fileErrors[0]).toMatch(/inmobiliaria/);
  });

  it("reports an empty file", () => {
    expect(analyze([""]).fileErrors[0]).toMatch(/vacío/);
  });

  it("reports each missing required header and analyzes no row", () => {
    const analysis = analyze(["nombre;tipo;precio_min_uf;precio_max_uf", "X;casa;1;2"]);
    expect(analysis.fileErrors).toEqual([
      "Falta la columna obligatoria «comuna».",
      "Falta la columna obligatoria «estado».",
    ]);
    expect(analysis.rows).toEqual([]);
    expect(analysis.canImport).toBe(false);
  });

  it("optional columns may be absent", () => {
    const analysis = analyze(["nombre;comuna;tipo;precio_min_uf;precio_max_uf;estado", "X;Macul;casa;2000;2500;disponible"]);
    expect(analysis.canImport).toBe(true);
  });

  it("matches headers case- and accent-insensitively, in any order", () => {
    const analysis = analyze([
      "Estado;NOMBRE;Comuna;Tipo;Precio_Max_UF;precio_min_uf;Descripción",
      "disponible;X;Macul;casa;2500;2000;texto",
    ]);
    expect(analysis.canImport).toBe(true);
    expect(analysis.rows[0].input).toMatchObject({ nombre: "X", precio_min_uf: 2000, precio_max_uf: 2500, descripcion: "texto" });
  });

  it("a repeated header is an error", () => {
    expect(analyze([`${HEADER};nombre`, VALID]).fileErrors).toEqual(["La columna «nombre» aparece más de una vez en el encabezado."]);
  });

  it("inmobiliaria_id column is ignored and warned, never sent", () => {
    const analysis = analyze([`${HEADER};inmobiliaria_id;color`, `${VALID};otra-inmobiliaria;azul`]);
    expect(analysis.canImport).toBe(true);
    expect(analysis.warnings).toHaveLength(2);
    expect(analysis.warnings[0]).toMatch(/inmobiliaria_id/);
    expect(analysis.rows[0].input.inmobiliaria_id).toBe(TENANT);
    expect(toImportPayload(analysis)[0]).not.toHaveProperty("inmobiliaria_id");
  });

  it(`more than ${IMPORT_MAX_ROWS} rows cannot be imported`, () => {
    const rows = Array.from({ length: IMPORT_MAX_ROWS + 1 }, (_, index) => `P${index};Macul;casa;2000;2500;disponible;;`);
    const analysis = analyze([HEADER, ...rows]);
    expect(analysis.summary.validas).toBe(IMPORT_MAX_ROWS + 1);
    expect(analysis.canImport).toBe(false);
    expect(analysis.fileErrors[0]).toMatch(String(IMPORT_MAX_ROWS));
    expect(analyze([HEADER, ...rows.slice(1)]).canImport).toBe(true);
  });
});

describe("analyzeProjectImport — rows", () => {
  it("row numbers are spreadsheet rows, counting skipped blank lines", () => {
    const analysis = analyze([HEADER, VALID, "", ";;;;;;;", "Otro;Macul;casa;;2500;disponible;;"]);
    expect(analysis.rows.map((row) => row.fila)).toEqual([2, 5]);
    expect(errorsOf(analysis, 5)).toEqual([{ columna: "precio_min_uf", mensaje: "Ingresa un precio mínimo en UF mayor que 0." }]);
  });

  it("a quoted line break does not shift row numbers", () => {
    const analysis = analyze([HEADER, 'A;Macul;casa;2000;2500;disponible;"línea 1\nlínea 2";', "B;Macul;casa;;2500;disponible;;"]);
    expect(analysis.rows.map((row) => row.fila)).toEqual([2, 3]);
    expect(analysis.rows[0].input.descripcion).toBe("línea 1\nlínea 2");
  });

  it("every validateProject error surfaces with its column, in column order", () => {
    const analysis = analyze([HEADER, `;Gotham;oficina;0;-1;vendido;${"x".repeat(501)};2027-13`]);
    expect(errorsOf(analysis, 2).map((error) => error.columna)).toEqual([
      "nombre",
      "comuna",
      "tipo",
      "precio_min_uf",
      "precio_max_uf",
      "estado",
      "descripcion",
      "entrega_estimada",
    ]);
  });

  it("max below min is reported on precio_max_uf", () => {
    const analysis = analyze([HEADER, "X;Macul;casa;3000;2000;disponible;;"]);
    expect(errorsOf(analysis, 2)).toEqual([{ columna: "precio_max_uf", mensaje: "El precio máximo debe ser mayor o igual al mínimo." }]);
  });

  it("an unreadable number names the value it could not read", () => {
    const analysis = analyze([HEADER, "X;Macul;casa;3500 UF;3,500;disponible;;"]);
    const errors = errorsOf(analysis, 2);
    expect(errors.map((error) => error.columna)).toEqual(["precio_min_uf", "precio_max_uf"]);
    expect(errors[0].mensaje).toMatch(/«3500 UF»/);
    expect(errors[1].mensaje).toMatch(/«3,500»/);
  });

  it("normalizes comuna, tipo and estado to their canonical values", () => {
    const analysis = analyze([HEADER, "X;  nunoa ;Departamento;3.200;4.850,5;En construcción;;", "Y;PEÑALOLÉN;CASA;2000;2000;agotado;;"]);
    expect(analysis.canImport).toBe(true);
    expect(analysis.rows[0].input).toMatchObject({
      comuna: "Ñuñoa",
      tipo: "departamento",
      estado: "en_construccion",
      precio_min_uf: 3200,
      precio_max_uf: 4850.5,
    });
    expect(analysis.rows[1].input).toMatchObject({ comuna: "Peñalolén", tipo: "casa", estado: "agotado" });
  });

  it("extra values beyond the header are an error on the row", () => {
    const analysis = analyze([HEADER, `${VALID};sobra`]);
    expect(errorsOf(analysis, 2)).toEqual([expect.objectContaining({ columna: null })]);
  });

  it("duplicate names (any case) are an error on every later occurrence", () => {
    const analysis = analyze([HEADER, VALID, "parque ñuñoa ;Macul;casa;2000;2500;disponible;;", "PARQUE ÑUÑOA;Macul;casa;2000;2500;disponible;;"]);
    expect(errorsOf(analysis, 2)).toEqual([]);
    expect(errorsOf(analysis, 3)).toEqual([{ columna: "nombre", mensaje: "El nombre se repite: ya está en la fila 2." }]);
    expect(errorsOf(analysis, 4)).toEqual([{ columna: "nombre", mensaje: "El nombre se repite: ya está en la fila 2." }]);
    expect(analysis.canImport).toBe(false);
  });

  it("labels rows that match an existing project of the same tenant as updates", () => {
    const existingProjects = [
      { inmobiliaria_id: TENANT, nombre: "PARQUE ÑUÑOA" },
      { inmobiliaria_id: "tenant-b", nombre: "Otro" },
    ];
    const analysis = analyze([HEADER, VALID, "Otro;Macul;casa;2000;2500;disponible;;"], { existingProjects });
    expect(analysis.rows.map((row) => row.accion)).toEqual(["actualizar", "crear"]);
    expect(analysis.summary).toEqual({ filas: 2, validas: 2, conErrores: 0, crear: 1, actualizar: 1 });
  });

  it("canImport is false on any error and the summary counts them", () => {
    const analysis = analyze([HEADER, VALID, "Malo;Macul;casa;;;disponible;;"]);
    expect(analysis.summary).toEqual({ filas: 2, validas: 1, conErrores: 1, crear: 1, actualizar: 0 });
    expect(analysis.canImport).toBe(false);
  });

  it("invariant: a row is valid iff validateProject accepts its normalized input", () => {
    const analysis = analyze([
      HEADER,
      VALID,
      "A;Macul;casa;2000;1000;disponible;;",
      "B;Gotham;casa;2000;2500;disponible;;",
      "C;Macul;casa;2000;2500;disponible;;2027-6",
      "D;Macul;casa;2000;2500;agotado;;",
    ]);
    for (const row of analysis.rows) {
      expect(row.errors.length === 0).toBe(validateProject(row.input).ok);
    }
  });
});

describe("toImportPayload", () => {
  it("sends the eight catalog fields, blanks as null", () => {
    const analysis = analyze([HEADER, VALID, "Otro;Macul;casa;2000;2500;disponible;;"]);
    expect(toImportPayload(analysis)).toEqual([
      {
        nombre: "Parque Ñuñoa",
        comuna: "Ñuñoa",
        tipo: "departamento",
        precio_min_uf: 3200,
        precio_max_uf: 4850,
        estado: "disponible",
        descripcion: "Cerca del metro",
        entrega_estimada: "2027-06",
      },
      {
        nombre: "Otro",
        comuna: "Macul",
        tipo: "casa",
        precio_min_uf: 2000,
        precio_max_uf: 2500,
        estado: "disponible",
        descripcion: null,
        entrega_estimada: null,
      },
    ]);
  });
});
