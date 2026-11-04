// HU 25 — lectura de .xlsx para la carga masiva. Usa exceljs, la misma librería
// de las exportaciones de HU 22, cargada solo cuando alguien sube una planilla.
// Lee la primera hoja y devuelve sus filas con las vacías incluidas, de modo que
// el registro i es la fila i + 1 de Excel (lo que espera analyzeProjectRecords).
const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0];

function isLegacyXls(buffer) {
  const head = new Uint8Array(buffer, 0, Math.min(4, buffer.byteLength));
  return OLE_SIGNATURE.every((byte, index) => head[index] === byte);
}

// exceljs entrega fórmulas, hipervínculos y texto enriquecido como objetos;
// el validador espera el valor que se ve en la celda.
function plainValue(value) {
  if (value === undefined || value === null) return null;
  if (value instanceof Date || typeof value !== "object") return value;
  if ("result" in value) return plainValue(value.result);
  if (Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  if ("text" in value) return plainValue(value.text);
  if ("error" in value) return String(value.error);
  return null;
}

export async function readXlsxRecords(buffer) {
  if (isLegacyXls(buffer)) {
    throw new Error("Es un archivo .xls antiguo. En Excel usa Archivo → Guardar como → «Libro de Excel (.xlsx)» y súbelo de nuevo.");
  }
  const module = await import("exceljs");
  const ExcelJS = module.default || module;
  const book = new ExcelJS.Workbook();
  try {
    await book.xlsx.load(buffer);
  } catch {
    throw new Error("No se pudo leer la planilla. Revisa que sea un archivo .xlsx válido.");
  }
  const sheet = book.worksheets[0];
  if (!sheet) return [];
  const records = [];
  for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const cells = [];
    for (let column = 1; column <= row.cellCount; column += 1) cells.push(plainValue(row.getCell(column).value));
    records.push(cells);
  }
  // La plantilla da formato a 500 filas vacías; exceljs las cuenta como filas.
  const isEmpty = (cells) => cells.every((cell) => cell === null || cell === "");
  while (records.length && isEmpty(records[records.length - 1])) records.pop();
  return records;
}
