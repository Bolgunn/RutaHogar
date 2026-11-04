// HU 25 — genera public/plantillas/plantilla-proyectos-rutahogar.xlsx.
//
// La plantilla es un archivo estático para no sumar una librería de escritura
// de Excel. Se arma desde las mismas constantes que usa el validador (columnas,
// comunas, tipos y estados), así que si cambian basta con volver a correr:
//
//   cd frontend && npx vite-node scripts/build-import-template.mjs
//
// Requiere LibreOffice (`soffice`) para convertir la hoja ODF plana a .xlsx.
// projectImport.test.js verifica que el archivo publicado siga coincidiendo.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { comunasMvp } from "../src/constants/comunas.js";
import { estadosProyecto, tiposProyecto } from "../src/constants/proyectos.js";
import { IMPORT_COLUMNS, IMPORT_MAX_ROWS } from "../src/lib/catalog/projectImport.js";

const OUTPUT = fileURLToPath(new URL("../public/plantillas/plantilla-proyectos-rutahogar.xlsx", import.meta.url));
const NAME = "plantilla-proyectos-rutahogar";
const LAST_ROW = IMPORT_MAX_ROWS + 1;

const escapeXml = (value) =>
  String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const textCell = (value, style) =>
  `<table:table-cell${style ? ` table:style-name="${style}"` : ""} office:value-type="string"><text:p>${escapeXml(value)}</text:p></table:table-cell>`;

const columnLetter = (index) => String.fromCharCode(65 + index);
const listColumn = { comuna: "A", tipo: "B", estado: "C" };
const listLength = { comuna: comunasMvp.length, tipo: tiposProyecto.length, estado: estadosProyecto.length };

const validations = IMPORT_COLUMNS.map((column, index) => {
  const list = listColumn[column.key];
  if (!list) return "";
  const range = `[$Listas.$${list}$2:.$${list}$${listLength[column.key] + 1}]`;
  return `<table:content-validation table:name="val_${column.key}" table:condition="of:cell-content-is-in-list(${range})" table:allow-empty-cell="true" table:base-cell-address="Proyectos.${columnLetter(index)}2">
      <table:error-message table:message-type="stop" table:display="true" table:title="Valor no válido"><text:p>Elige un valor de la lista.</text:p></table:error-message>
    </table:content-validation>`;
}).join("\n");

const dataColumns = IMPORT_COLUMNS.map((column) => {
  const style = column.key === "entrega_estimada" || column.key === "nombre" || column.key === "descripcion" ? "colText" : "colDefault";
  return `<table:table-column table:style-name="${column.key === "descripcion" ? "wide" : "normal"}" table:default-cell-style-name="${style}"/>`;
}).join("");

const dataCells = IMPORT_COLUMNS.map((column) => {
  const style = column.key === "entrega_estimada" || column.key === "nombre" || column.key === "descripcion" ? "colText" : column.key.startsWith("precio") ? "colUf" : "colDefault";
  const validation = listColumn[column.key] ? ` table:content-validation-name="val_${column.key}"` : "";
  return `<table:table-cell table:style-name="${style}"${validation}/>`;
}).join("");

const listRows = Array.from({ length: Math.max(...Object.values(listLength)) }, (_, index) =>
  `<table:table-row>${[comunasMvp, tiposProyecto, estadosProyecto]
    .map((values) => (values[index] ? textCell(values[index]) : "<table:table-cell/>"))
    .join("")}</table:table-row>`,
).join("");

const fods = `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
  xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0"
  xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0"
  xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
  xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0"
  xmlns:number="urn:oasis:names:tc:opendocument:xmlns:datastyle:1.0"
  xmlns:of="urn:oasis:names:tc:opendocument:xmlns:of:1.2"
  office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.spreadsheet">
  <office:automatic-styles>
    <number:text-style style:name="Ntext"><number:text-content/></number:text-style>
    <number:number-style style:name="Nuf"><number:number number:decimal-places="0" number:min-decimal-places="0" number:min-integer-digits="1" number:grouping="true"/></number:number-style>
    <style:style style:name="normal" style:family="table-column"><style:table-column-properties style:column-width="1.6in"/></style:style>
    <style:style style:name="wide" style:family="table-column"><style:table-column-properties style:column-width="3.2in"/></style:style>
    <style:style style:name="header" style:family="table-cell"><style:table-cell-properties fo:background-color="#1b2a4a"/><style:text-properties fo:font-weight="bold" fo:color="#ffffff"/></style:style>
    <style:style style:name="bold" style:family="table-cell"><style:text-properties fo:font-weight="bold"/></style:style>
    <style:style style:name="colDefault" style:family="table-cell"/>
    <style:style style:name="colText" style:family="table-cell" style:data-style-name="Ntext"/>
    <style:style style:name="colUf" style:family="table-cell" style:data-style-name="Nuf"/>
  </office:automatic-styles>
  <office:body>
    <office:spreadsheet>
    <table:content-validations>
    ${validations}
    </table:content-validations>
    <table:table table:name="Proyectos">
      ${dataColumns}
      <table:table-row>${IMPORT_COLUMNS.map((column) => textCell(column.key, "header")).join("")}</table:table-row>
      <table:table-row table:number-rows-repeated="${LAST_ROW - 1}">${dataCells}</table:table-row>
    </table:table>
    <table:table table:name="Instrucciones">
      <table:table-column table:style-name="normal"/><table:table-column table:style-name="normal"/><table:table-column table:style-name="wide"/><table:table-column table:style-name="normal"/>
      <table:table-row>${textCell("Completa la hoja «Proyectos»: una fila por proyecto, máximo " + IMPORT_MAX_ROWS + ". No cambies los nombres de las columnas.", "bold")}</table:table-row>
      <table:table-row>${textCell("Si un proyecto ya existe en tu catálogo (mismo nombre), la fila lo actualiza. Nada se guarda hasta que confirmes la carga en RutaHogar.")}</table:table-row>
      <table:table-row><table:table-cell/></table:table-row>
      <table:table-row>${["Columna", "Obligatoria", "Qué escribir", "Ejemplo"].map((value) => textCell(value, "header")).join("")}</table:table-row>
      ${IMPORT_COLUMNS.map((column) => `<table:table-row>${[column.key, column.required ? "Sí" : "No", column.ayuda, column.ejemplo].map((value) => textCell(value)).join("")}</table:table-row>`).join("\n      ")}
    </table:table>
    <table:table table:name="Listas">
      <table:table-row>${["comuna", "tipo", "estado"].map((value) => textCell(value, "header")).join("")}</table:table-row>
      ${listRows}
    </table:table>
    </office:spreadsheet>
  </office:body>
</office:document>
`;

const workdir = mkdtempSync(join(tmpdir(), "hu25-template-"));
try {
  const source = join(workdir, `${NAME}.fods`);
  writeFileSync(source, fods);
  execFileSync("soffice", ["--headless", "--convert-to", "xlsx:Calc MS Excel 2007 XML", "--outdir", workdir, source], { stdio: "ignore" });
  mkdirSync(dirname(OUTPUT), { recursive: true });
  renameSync(join(workdir, `${NAME}.xlsx`), OUTPUT);
  console.log(`Plantilla escrita en ${OUTPUT}`);
} finally {
  rmSync(workdir, { recursive: true, force: true });
}
