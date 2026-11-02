import React, { useEffect, useMemo, useState } from "react";
import useModalFocus from "./useModalFocus";
import { estadoProyectoLabels, tipoProyectoLabels } from "../constants/proyectos";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  analyzeProjectImport,
  analyzeProjectRecords,
  buildImportTemplate,
  decodeImportFile,
  toImportPayload,
} from "../lib/catalog/projectImport";
import { readXlsxRecords } from "../lib/catalog/readXlsx";
import { getProjects, importProjects } from "../services/projectService";

// HU 25 — carga masiva del catálogo. Plan: docs/stories/HU25-carga-masiva-proyectos/PLAN.md.
// Los proyectos van siempre a la inmobiliaria de la sesión; el admin global no ve este modal.

const XLSX_TEMPLATE_URL = "/plantillas/plantilla-proyectos-rutahogar.xlsx";
const CSV_TEMPLATE_FILENAME = "plantilla-proyectos-rutahogar.csv";
const UF_FORMATTER = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

function downloadCsvTemplate() {
  const blob = new Blob([buildImportTemplate()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = CSV_TEMPLATE_FILENAME;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function formatRange(input) {
  const { precio_min_uf: min, precio_max_uf: max } = input;
  if (!Number.isFinite(min) || !Number.isFinite(max)) return "—";
  return min === max ? `UF ${UF_FORMATTER.format(min)}` : `UF ${UF_FORMATTER.format(min)} – ${UF_FORMATTER.format(max)}`;
}

async function readRecords(file) {
  if (/\.xlsx$/i.test(file.name)) return readXlsxRecords(await file.arrayBuffer());
  if (/\.xls$/i.test(file.name)) {
    throw new Error("Es un archivo .xls antiguo. En Excel usa Archivo → Guardar como → «Libro de Excel (.xlsx)» y súbelo de nuevo.");
  }
  if (/\.(ods|numbers)$/i.test(file.name)) {
    throw new Error("Ese formato no se puede leer. Guarda la planilla como .xlsx o como CSV y súbela de nuevo.");
  }
  return { csv: decodeImportFile(await file.arrayBuffer()) };
}

export default function ProjectBulkImport({ tenant, onClose, onImported }) {
  const inmobiliariaId = tenant?.inmobiliaria_id || "";
  const [existingProjects, setExistingProjects] = useState([]);
  const [file, setFile] = useState(null);
  const [content, setContent] = useState(null);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState("");
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const requestClose = () => {
    if (!importing) onClose();
  };
  useModalFocus(true, requestClose);

  useEffect(() => {
    if (!inmobiliariaId) return undefined;
    let active = true;
    getProjects({ inmobiliariaId })
      .then((rows) => {
        if (active) setExistingProjects(rows);
      })
      .catch(() => {
        if (active) setExistingProjects([]);
      });
    return () => {
      active = false;
    };
  }, [inmobiliariaId]);

  const analysis = useMemo(() => {
    if (content === null) return null;
    const options = { inmobiliariaId, existingProjects };
    return Array.isArray(content) ? analyzeProjectRecords(content, options) : analyzeProjectImport(content.csv, options);
  }, [content, inmobiliariaId, existingProjects]);

  const rowErrors = analysis
    ? analysis.rows.flatMap((row) => row.errors.map((error) => ({ fila: row.fila, ...error })))
    : [];

  const handleFile = async (event) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    setFile(selected);
    setContent(null);
    setReadError("");
    setSubmitError("");
    if (!selected) return;

    if (selected.size > IMPORT_MAX_BYTES) {
      setReadError("El archivo pesa más de 1 MB. Divídelo en varios archivos.");
      return;
    }
    setReading(true);
    try {
      setContent(await readRecords(selected));
    } catch (err) {
      setReadError(err.message || "No se pudo leer el archivo. Vuelve a guardarlo e inténtalo otra vez.");
    } finally {
      setReading(false);
    }
  };

  const handleConfirm = async () => {
    if (!analysis?.canImport || importing) return;
    setImporting(true);
    setSubmitError("");
    try {
      onImported(await importProjects(toImportPayload(analysis)));
    } catch (err) {
      setSubmitError(err.message || "No se pudo completar la carga. No se guardó ningún proyecto.");
      setImporting(false);
    }
  };

  return (
    <div className="admin-modal" onClick={requestClose}>
      <div
        className="admin-modal-card admin-modal-card--lg admin-bulk-import-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Carga masiva de proyectos"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="admin-modal-header">
          <div className="admin-modal-heading">
            <h2>Carga masiva de proyectos</h2>
            <p>Sube una planilla Excel o un CSV con varios proyectos. Nada se guarda hasta que confirmes.</p>
          </div>
          <button type="button" className="secondary-button compact-button" onClick={requestClose} disabled={importing}>
            Cerrar
          </button>
        </div>

        <div className="admin-modal-body">
          <div className="admin-compact-note">
            <strong>Los proyectos se cargarán en</strong>
            <p>{tenant?.inmobiliaria_nombre || "tu inmobiliaria"}</p>
          </div>

          <section className="admin-bulk-step" aria-labelledby="bulk-step-template">
            <h3 id="bulk-step-template">1. Plantilla</h3>
            <p className="admin-bulk-hint">
              Una fila por proyecto, máximo {IMPORT_MAX_ROWS}. La planilla Excel trae listas para elegir comuna, tipo y
              estado, y una hoja de instrucciones.
            </p>
            <div className="admin-bulk-actions">
              <a className="secondary-button" href={XLSX_TEMPLATE_URL} download>
                <i className="ti ti-file-spreadsheet" aria-hidden="true" /> Plantilla Excel (.xlsx)
              </a>
              <button type="button" className="secondary-button" onClick={downloadCsvTemplate}>
                <i className="ti ti-file-text" aria-hidden="true" /> Plantilla CSV
              </button>
            </div>
            <details className="admin-bulk-guide">
              <summary>Qué va en cada columna</summary>
              <div className="admin-bulk-table-wrap">
                <table className="admin-bulk-table">
                  <thead>
                    <tr>
                      <th scope="col">Columna</th>
                      <th scope="col">Obligatoria</th>
                      <th scope="col">Qué escribir</th>
                      <th scope="col">Ejemplo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {IMPORT_COLUMNS.map((column) => (
                      <tr key={column.key}>
                        <td><code>{column.key}</code></td>
                        <td>{column.required ? "Sí" : "No"}</td>
                        <td>{column.ayuda}</td>
                        <td>{column.ejemplo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="admin-bulk-step" aria-labelledby="bulk-step-file">
            <h3 id="bulk-step-file">2. Archivo</h3>
            <div className="field-wrap">
              <label htmlFor="bulk-import-file">Planilla .xlsx o archivo .csv</label>
              <input
                id="bulk-import-file"
                type="file"
                accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={handleFile}
                disabled={!inmobiliariaId || importing || reading}
              />
              {file && <p className="admin-bulk-hint">{reading ? `Leyendo ${file.name}…` : `Archivo: ${file.name}`}</p>}
            </div>
            {readError && <div className="error-message" role="alert">{readError}</div>}
          </section>

          {analysis && (
            <section className="admin-bulk-step" aria-labelledby="bulk-step-review" aria-live="polite">
              <h3 id="bulk-step-review">3. Revisión</h3>

              {analysis.fileErrors.length > 0 && (
                <div className="error-message" role="alert">
                  <ul className="admin-bulk-list">
                    {analysis.fileErrors.map((message) => <li key={message}>{message}</li>)}
                  </ul>
                </div>
              )}

              {analysis.warnings.length > 0 && (
                <ul className="admin-bulk-list admin-bulk-warnings">
                  {analysis.warnings.map((message) => <li key={message}>{message}</li>)}
                </ul>
              )}

              {analysis.rows.length > 0 && (
                <dl className="admin-bulk-summary">
                  <div><dt>Filas</dt><dd>{analysis.summary.filas}</dd></div>
                  <div><dt>Válidas</dt><dd>{analysis.summary.validas}</dd></div>
                  <div className={analysis.summary.conErrores ? "is-error" : ""}><dt>Con errores</dt><dd>{analysis.summary.conErrores}</dd></div>
                  <div><dt>Nuevos</dt><dd>{analysis.summary.crear}</dd></div>
                  <div><dt>Se actualizan</dt><dd>{analysis.summary.actualizar}</dd></div>
                </dl>
              )}

              {rowErrors.length > 0 && (
                <div className="admin-bulk-errors">
                  <p>
                    <strong>Corrige estas filas en tu archivo y vuelve a subirlo.</strong> No se guardará nada mientras haya errores.
                  </p>
                  <div className="admin-bulk-table-wrap">
                    <table className="admin-bulk-table">
                      <thead>
                        <tr>
                          <th scope="col">Fila</th>
                          <th scope="col">Columna</th>
                          <th scope="col">Problema</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rowErrors.map((error, index) => (
                          <tr key={`${error.fila}-${error.columna}-${index}`}>
                            <td>{error.fila}</td>
                            <td>{error.columna ? <code>{error.columna}</code> : "—"}</td>
                            <td>{error.mensaje}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {analysis.rows.length > 0 && (
                <div className="admin-bulk-table-wrap admin-bulk-preview" tabIndex={0} role="region" aria-label="Vista previa de los proyectos del archivo">
                  <table className="admin-bulk-table">
                    <thead>
                      <tr>
                        <th scope="col">Fila</th>
                        <th scope="col">Proyecto</th>
                        <th scope="col">Comuna</th>
                        <th scope="col">Tipo</th>
                        <th scope="col">Rango</th>
                        <th scope="col">Estado</th>
                        <th scope="col">Resultado</th>
                      </tr>
                    </thead>
                    <tbody>
                      {analysis.rows.map((row) => (
                        <tr key={row.fila} className={row.errors.length ? "is-error" : ""}>
                          <td>{row.fila}</td>
                          <td>{row.input.nombre || "—"}</td>
                          <td>{row.input.comuna || "—"}</td>
                          <td>{tipoProyectoLabels[row.input.tipo] || row.input.tipo || "—"}</td>
                          <td>{formatRange(row.input)}</td>
                          <td>{estadoProyectoLabels[row.input.estado] || row.input.estado || "—"}</td>
                          <td>
                            {row.errors.length
                              ? `${row.errors.length} ${row.errors.length === 1 ? "error" : "errores"}`
                              : row.accion === "actualizar" ? "Actualiza" : "Nuevo"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}

          {submitError && <div className="error-message" role="alert">{submitError}</div>}
        </div>

        <div className="admin-modal-footer">
          <button type="button" className="secondary-button" onClick={requestClose} disabled={importing}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} disabled={!analysis?.canImport || importing}>
            {importing
              ? "Cargando…"
              : analysis?.canImport
                ? `Confirmar carga de ${analysis.summary.filas} ${analysis.summary.filas === 1 ? "proyecto" : "proyectos"}`
                : "Confirmar carga"}
          </button>
        </div>
      </div>
    </div>
  );
}
