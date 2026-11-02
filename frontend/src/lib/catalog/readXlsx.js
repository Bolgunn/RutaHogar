// HU 25 — lectura de .xlsx para la carga masiva. La librería se carga solo
// cuando alguien sube una planilla, así no pesa en el resto de la app.
// Lee la primera hoja y devuelve sus filas con las vacías incluidas, de modo que
// el registro i es la fila i + 1 de Excel (lo que espera analyzeProjectRecords).
export async function readXlsxRecords(buffer) {
  const { readSheet } = await import("read-excel-file/universal");
  try {
    return await readSheet(buffer);
  } catch (error) {
    if (error?.code === "XLS_FILE_NOT_SUPPORTED") {
      throw new Error("Es un archivo .xls antiguo. En Excel usa Archivo → Guardar como → «Libro de Excel (.xlsx)» y súbelo de nuevo.");
    }
    throw new Error("No se pudo leer la planilla. Revisa que sea un archivo .xlsx válido.");
  }
}
