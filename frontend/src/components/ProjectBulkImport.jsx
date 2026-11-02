import React, { useEffect, useMemo, useState } from "react";
import useModalFocus from "./useModalFocus";
import { estadoProyectoLabels, tipoProyectoLabels } from "../constants/proyectos";
import {
  IMPORT_COLUMNS,
  IMPORT_MAX_BYTES,
  IMPORT_MAX_ROWS,
  analyzeProjectImport,
  buildImportTemplate,
  decodeImportFile,
  toImportPayload,
} from "../lib/catalog/projectImport";
import { getProjects, importProjects } from "../services/projectService";

// HU 25 — carga masiva del catálogo. Plan: docs/stories/HU25-carga-masiva-proyectos/PLAN.md.

const TEMPLATE_FILENAME = "plantilla-proyectos-rutahogar.csv";
const UF_FORMATTER = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });

const columnGuide = {
  nombre: { ayuda: "Nombre del proyecto. Si ya existe en tu catálogo, la fila lo actualiza.", ejemplo: "Parque Ñuñoa" },
  comuna: { ayuda: "Una comuna del catálogo de la Región Metropolitana.", ejemplo: "Ñuñoa" },
  tipo: { ayuda: "departamento o casa.", ejemplo: "departamento" },
  precio_min_uf: { ayuda: "Precio en UF de la unidad más barata, mayor que 0.", ejemplo: "3.200" },
  precio_max_uf: { ayuda: "Precio en UF de la unidad más cara, igual o mayor que el mínimo.", ejemplo: "4.850,5" },
  estado: { ayuda: "disponible, en_construccion o agotado.", ejemplo: "disponible" },
  descripcion: { ayuda: `Texto para la vitrina, hasta 500 caracteres.`, ejemplo: "A pasos del metro" },
  entrega_estimada: { ayuda: "Mes de entrega en formato AAAA-MM. Formatea la columna como Texto en Excel.", ejemplo: "2027-06" },
};

function downloadTemplate() {
  const blob = new Blob([buildImportTemplate()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = TEMPLATE_FILENAME;
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

export default function ProjectBulkImport({ tenant, inmobiliarias, defaultInmobiliariaId, onClose, onImported }) {
  const isGlobalAdmin = Boolean(tenant?.isGlobalAdmin);
  const [targetId, setTargetId] = useState(isGlobalAdmin ? defaultInmobiliariaId || "" : tenant?.inmobiliaria_id || "");
  const [existingProjects, setExistingProjects] = useState([]);
  const [file, setFile] = useState(null);
  const [fileText, setFileText] = useState(null);
  const [readError, setReadError] = useState("");
  const [importing, setImporting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const requestClose = () => {
    if (!importing) onClose();
  };
  useModalFocus(true, requestClose);

  useEffect(() => {
    if (!targetId) {
      setExistingProjects([]);
      return undefined;
    }
    let active = true;
    getProjects({ inmobiliariaId: targetId })
      .then((rows) => {
        if (active) setExistingProjects(rows);
      })
      .catch(() => {
        if (active) setExistingProjects([]);
      });
    return () => {
      active = false;
    };
  }, [targetId]);

  const analysis = useMemo(
    () => (fileText === null ? null : analyzeProjectImport(fileText, { inmobiliariaId: targetId, existingProjects })),
    [fileText, targetId, existingProjects],
  );

  const targetName = isGlobalAdmin
    ? inmobiliarias.find((item) => item.id === targetId)?.nombre || ""
    : tenant?.inmobiliaria_nombre || "tu inmobiliaria";

  const rowErrors = analysis
    ? analysis.rows.flatMap((row) => row.errors.map((error) => ({ fila: row.fila, ...error })))
    : [];

  const handleFile = async (event) => {
    const selected = event.target.files?.[0] || null;
    event.target.value = "";
    setFile(selected);
    setFileText(null);
    setReadError("");
    setSubmitError("");
    if (!selected) return;

    if (/\.(xlsx|xls|ods|numbers)$/i.test(selected.name)) {
      setReadError("Ese archivo es una planilla, no un CSV. En Excel usa Archivo → Guardar como → «CSV UTF-8» y súbelo de nuevo.");
      return;
    }
    if (selected.size > IMPORT_MAX_BYTES) {
      setReadError("El archivo pesa más de 1 MB. Divídelo en varios archivos.");
      return;
    }
    try {
      setFileText(decodeImportFile(await selected.arrayBuffer()));
    } catch {
      setReadError("No se pudo leer el archivo. Vuelve a guardarlo como CSV e inténtalo otra vez.");
    }
  };

  const handleConfirm = async () => {
    if (!analysis?.canImport || importing) return;
    setImporting(true);
    setSubmitError("");
    try {
      const result = await importProjects({ inmobiliariaId: targetId, proyectos: toImportPayload(analysis) });
      onImported(result);
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
            <p>Sube un CSV con varios proyectos. Nada se guarda hasta que confirmes.</p>
          </div>
          <button type="button" className="secondary-button compact-button" onClick={requestClose} disabled={importing}>
            Cerrar
          </button>
        </div>

        <div className="admin-modal-body">
          <section className="admin-bulk-step" aria-labelledby="bulk-step-target">
            <h3 id="bulk-step-target">1. Inmobiliaria</h3>
            {isGlobalAdmin ? (
              <div className="field-wrap">
                <label htmlFor="bulk-import-target">Los proyectos se cargarán en</label>
                <select
                  id="bulk-import-target"
                  value={targetId}
                  onChange={(event) => setTargetId(event.target.value)}
                  disabled={importing}
                >
                  <option value="">Selecciona una inmobiliaria</option>
                  {inmobiliarias.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div className="admin-compact-note">
                <strong>Los proyectos se cargarán en</strong>
                <p>{targetName}</p>
              </div>
            )}
          </section>

          <section className="admin-bulk-step" aria-labelledby="bulk-step-template">
            <h3 id="bulk-step-template">2. Plantilla</h3>
            <p className="admin-bulk-hint">
              Una fila por proyecto, máximo {IMPORT_MAX_ROWS}. Puedes completarla en Excel y guardarla como CSV.
            </p>
            <div>
              <button type="button" className="secondary-button" onClick={downloadTemplate}>
                <i className="ti ti-download" aria-hidden="true" /> Descargar plantilla CSV
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
                        <td>{columnGuide[column.key].ayuda}</td>
                        <td>{columnGuide[column.key].ejemplo}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <section className="admin-bulk-step" aria-labelledby="bulk-step-file">
            <h3 id="bulk-step-file">3. Archivo</h3>
            <div className="field-wrap">
              <label htmlFor="bulk-import-file">Archivo CSV</label>
              <input
                id="bulk-import-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFile}
                disabled={!targetId || importing}
              />
              {!targetId && <p className="admin-bulk-hint">Elige primero la inmobiliaria.</p>}
              {file && <p className="admin-bulk-hint">Archivo: {file.name}</p>}
            </div>
            {readError && <div className="error-message" role="alert">{readError}</div>}
          </section>

          {analysis && (
            <section className="admin-bulk-step" aria-labelledby="bulk-step-review" aria-live="polite">
              <h3 id="bulk-step-review">4. Revisión</h3>

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
