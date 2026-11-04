import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { exportSheets, makeWorkbook, makeDossier } from "./files";

const snapshot = {
  context: { id: "test-export", kind: "leads", generated_at: "2026-10-29T12:00:00Z", blocks: ["profile", "financial"], filters: { comuna: "Ñuñoa" } },
  items: [{ evaluation_id: "e1", evaluated_at: "2026-10-28T12:00:00Z", profile: { full_name: "=HYPERLINK(\"https://evil.test\")", phone: "+56912345678" }, financial: { ingreso_mensual: 1500000, deuda_mensual: 0, ahorro_disponible: null } }],
  scope_projects: [],
};
describe("HU22 files", () => {
  it("omits algorithm versions from workbook data, filters and PDF histories", async () => {
    const data = structuredClone(snapshot);
    data.context.blocks = ["evaluation", "evaluation_history"];
    data.context.filters.algorithm_version = "SECRET-ALGORITHM-VERSION";
    data.items[0].evaluation = { score: 72, algorithm_version: "SECRET-ALGORITHM-VERSION" };
    data.items[0].evaluation_history = [{ score: 70, algorithm_version: "SECRET-ALGORITHM-VERSION" }];
    const text = JSON.stringify(exportSheets(data));
    expect(text).not.toContain("SECRET-ALGORITHM-VERSION");
    expect(text).not.toContain("Versión del algoritmo");
    const pdf = Buffer.from(await (await makeDossier(data)).arrayBuffer()).toString("latin1");
    expect(pdf).not.toContain("SECRET-ALGORITHM-VERSION");
  });
  it("names summary indicators without technical paths or losing their context", () => {
    const metrics = { n: 10, captura: { n: 10, postulan: 4, tasa: .4 }, contacto: { sin_contactar: { n: 6, antiguedad_mediana: 3, antiguedad_maxima: 8 }, contactados_por_mi: { total: 4, mes_actual: 2 }, tiempo_primer_contacto: { n: 4, promedio: 2, mediana: 1 } } };
    const sheet = exportSheets({ context: { ...snapshot.context, kind: "metrics", blocks: ["resumen"] }, items: [] }, metrics)[1];
    const rows = new Map(sheet.rows.slice(1));
    expect(rows.get("Leads sin contactar")).toBe(6);
    expect(rows.get("Antigüedad mediana de leads sin contactar (días)")).toBe(3);
    expect(rows.get("Leads contactados por mí este mes")).toBe(2);
    expect(rows.get("Tiempo promedio hasta el primer contacto (días)")).toBe(2);
    expect(sheet.rows.every(row => !String(row[0]).includes(" / "))).toBe(true);
    expect(rows.size).toBe(sheet.rows.length - 1);
  });
  it("uses Spanish labels and human references without exporting internal IDs or format metadata", () => {
    const data = structuredClone(snapshot);
    const internalId = "44444444-4444-4444-8444-444444444444";
    Object.assign(data.context, { id: internalId, actor_id: internalId, inmobiliaria_id: internalId, evaluation_ids: [internalId], format: "xlsx", actor_name: "Andrea Pérez", actor_email: "andrea@example.test", actor_role: "admin", blocks: ["profile", "financial", "evaluation_history"] });
    Object.assign(data.items[0].financial, { continuidad_laboral: "entre_6_y_12_meses", tipo_contrato: "indefinido" });
    data.items[0].evaluation_id = internalId;
    data.items[0].profile.full_name = "Cliente de prueba";
    data.items[0].evaluation_history = [{ evaluation_id: internalId, created_at: "2026-10-01", score: 0 }];
    const sheets = exportSheets(data);
    const text = JSON.stringify(sheets);
    expect(text).not.toContain(internalId);
    expect(text).not.toContain("xlsx");
    expect(text).not.toContain("financial");
    expect(text).not.toContain("entre_6_y_12_meses");
    expect(text).toContain("Entre 6 y 12 meses");
    expect(text).toContain("Continuidad laboral");
    expect(sheets.flatMap(sheet => sheet.rows[0]).some(name => String(name).includes(" / "))).toBe(false);
    expect(text).toContain("Andrea Pérez");
    expect(text).toContain("andrea@example.test");
    expect(sheets.find(sheet => sheet.name === "Evaluaciones").rows[1]).toContain("Cliente de prueba");
  });
  it("round-trips a real workbook with native numbers, null distinction and inert formulas", async () => {
    const blob = await makeWorkbook(snapshot);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await blob.arrayBuffer());
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["Contexto", "Leads"]);
    const row = book.getWorksheet("Leads").getRow(2).values;
    expect(row).toContain(1500000); expect(row).toContain(0); expect(row).toContain("Sin dato");
    const cell = [...book.getWorksheet("Leads").getRow(2)._cells].find(c => c?.value === snapshot.items[0].profile.full_name);
    expect(cell.type).toBe(ExcelJS.ValueType.String);
    expect(cell.formula).toBeUndefined();
  });
  it("formats readable workbooks while retaining full labels and native values", async () => {
    const data = structuredClone(snapshot);
    data.items[0].evaluated_at = "2026-11-03T12:30:00Z";
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await (await makeWorkbook(data)).arrayBuffer());
    const leads = book.getWorksheet("Leads");
    const headers = leads.getRow(1).values;
    const dateColumn = headers.indexOf("Evaluado el");
    expect(dateColumn).toBeGreaterThan(0);
    expect(leads.getCell(1, dateColumn).note).toBe("Fecha de evaluación");
    expect(leads.getCell(2, dateColumn).value).toEqual(new Date("2026-11-03T12:30:00Z"));
    expect(leads.getCell(2, dateColumn).note).toBe("Fecha y hora en UTC.");
    expect(leads.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1, showGridLines: false });
    expect(leads.columns.every(column => column.width >= 15 && column.width <= 40)).toBe(true);
    expect(leads.pageSetup.orientation).toBe("landscape");
    const money = leads.getRow(2)._cells.find(cell => cell?.value === 1500000);
    expect(money.numFmt).toBe("#,##0");
    const context = book.getWorksheet("Contexto");
    expect(context.getColumn(2).width).toBeGreaterThan(context.getColumn(1).width);
    expect(context.autoFilter).toBeUndefined();
  });
  it("shortens metric labels without changing percentage values or their full descriptions", async () => {
    const data = { context: { ...snapshot.context, kind: "metrics", blocks: ["resumen"] }, items: [] };
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(await (await makeWorkbook(data, { n: 10, plan_mejora_a_venta: { tasa: .25 } })).arrayBuffer());
    const sheet = book.getWorksheet("Resumen");
    let rate;
    sheet.eachRow(row => { if (row.getCell(1).value === "Conversión a venta: plan de mejora") rate = row; });
    expect(rate.getCell(1).note).toBe("Tasa de conversión de plan de mejora a venta");
    expect(rate.getCell(2).value).toBe(.25);
    expect(rate.getCell(2).numFmt).toBe("0.0%");
  });
  it("exports selected metric sheets from existing results, retaining zero and missing rates", () => {
    const metrics = { n: 3, captura: { rate: null, sales: 0 }, serie: { granularidad: "mes", periodos: [] } };
    const sheets = exportSheets({ context: { ...snapshot.context, kind: "metrics", blocks: ["resumen", "historico"] }, items: [] }, metrics);
    expect(sheets.map(s => s.name)).toEqual(["Contexto", "Resumen", "Histórico"]);
    expect(sheets[1].rows.some(row => row[1] === 0)).toBe(true);
    expect(sheets[1].rows.some(row => row[1] === "Sin dato")).toBe(true);
    expect(sheets.map(s => s.name)).not.toContain("Leads");
  });
  it("creates a paginated PDF from long histories without screenshots", async () => {
    const data = structuredClone(snapshot);
    data.context.kind = "dossier"; data.context.blocks = ["profile", "evaluation_history", "commercial_history"];
    data.items[0].evaluation_history = Array.from({ length: 100 }, (_, i) => ({ created_at: "2026-10-29", score: i, classification: "Medio", algorithm_version: "v1" }));
    data.items[0].commercial_history = [{ occurred_at: "2026-10-29", stage_after: "contactado", reason: "Texto extenso ".repeat(200) }];
    const blob = await makeDossier(data);
    const text = Buffer.from(await blob.arrayBuffer()).toString("latin1");
    expect(text.startsWith("%PDF-")).toBe(true);
    expect((text.match(/\/Type \/Page\b/g) || []).length).toBeGreaterThan(1);
    expect(text).toContain("RutaHogar");
  });
});
