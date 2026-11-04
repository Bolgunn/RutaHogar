import React, { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import useModalFocus from "./useModalFocus";
import { exportRequest } from "../services/exportService";
import { EXPORT_BLOCKS, METRIC_SECTIONS, makeDossier, makeWorkbook, contextRows, EXPORT_KINDS } from "../lib/exports/files";
import "./export-action.css";

function ExportDialog({ kind, candidates, projectId, filters, sourceAt, metrics, metricProjects, onClose }) {
  const titleId = useId();
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [selected, setSelected] = useState([]);
  const choices = kind === "metrics" ? METRIC_SECTIONS : EXPORT_BLOCKS;
  const [blocks, setBlocks] = useState(Object.keys(choices).filter(key => kind === "dossier" || !["evaluation_history", "commercial_history", "plan"].includes(key)));
  const [records, setRecords] = useState(null);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [eligibleIds, setEligibleIds] = useState(null);
  const candidateKey = candidates.map(item => item.id).join(",");
  useEffect(() => {
    if (kind === "metrics") return;
    let active = true;
    setEligibleIds(null);
    if (!candidates.length || candidates.length > 500) {
      setError("Aplica filtros para preparar hasta 500 leads por vez.");
      return;
    }
    exportRequest("/eligible", { request_id: crypto.randomUUID(), kind, evaluation_ids: candidates.map(item => item.id), blocks: ["evaluation"], project_id: projectId || null })
      .then(data => { if (active) { setEligibleIds(data.eligible_ids); setSelected(data.eligible_ids); } })
      .catch(failure => { if (active) setError(failure.message); });
    return () => { active = false; };
  }, [kind, candidateKey, projectId]);
  const close = () => { if (!busy) onClose(); };
  useModalFocus(true, close);
  const eligible = candidates.filter(item => eligibleIds?.includes(item.id));
  const ids = eligible.filter(item => selected.includes(item.id)).map(item => item.id);
  const toggle = (list, value, update) => update(list.includes(value) ? list.filter(item => item !== value) : [...list, value]);
  const toggleRecords = async () => {
    setRecordsOpen(open => !open);
    if (recordsOpen || records !== null || recordsLoading) return;
    setRecordsLoading(true);
    setError("");
    try { setRecords(await exportRequest("")); }
    catch (failure) { setError(failure.message); }
    finally { setRecordsLoading(false); }
  };
  const generate = async () => {
    if (kind !== "metrics" && !ids.length) { setError("Selecciona al menos un lead para exportar."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const snapshot = await exportRequest("/prepare", { request_id: crypto.randomUUID(), kind, evaluation_ids: kind === "metrics" ? [] : ids, blocks, project_id: projectId || null, filters, source_at: sourceAt || null });
      if (kind === "metrics") {
        const authorized = new Set(snapshot.scope_projects.map(p => p.id));
        if (metricProjects.some(p => !authorized.has(p.id))) throw new Error("Cambió tu acceso a proyectos. Actualiza el dashboard antes de exportar.");
      }
      const blob = kind === "dossier" ? await makeDossier(snapshot) : await makeWorkbook(snapshot, metrics);
      const buffer = await blob.arrayBuffer();
      const sha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", buffer))].map(n => n.toString(16).padStart(2, "0")).join("");
      await exportRequest(`/${snapshot.context.id}/delivery`, { sha256 });
      setRecords(null);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      const extension = kind === "dossier" ? "pdf" : "xlsx";
      const defaultName = `RutaHogar-${kind}-${snapshot.context.generated_at.slice(0, 10)}`;
      const safeName = fileName.trim().replace(/\.(pdf|xlsx)$/i, "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-").replace(/[. ]+$/g, "").slice(0, 120).trim();
      link.href = url; link.download = `${safeName || defaultName}.${extension}`;
      document.body.append(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setSuccess("Descarga iniciada. La exportación quedó registrada.");
    } catch (failure) { setError(failure.message || "No se pudo exportar. Intenta nuevamente."); }
    finally { setBusy(false); }
  };
  return createPortal(<div className="admin-modal hu22-overlay" onClick={close}>
    <section className="admin-modal-card hu22-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} aria-busy={busy} onClick={event => event.stopPropagation()}>
      <div className="admin-modal-header"><div className="admin-modal-heading"><div className="export-format"><i className={`ti ${kind === "dossier" ? "ti-file-type-pdf" : "ti-file-spreadsheet"}`} aria-hidden="true" />{kind === "dossier" ? "Documento PDF" : "Libro Excel"}</div><h2 id={titleId}>{kind === "dossier" ? "Dossier del lead" : kind === "metrics" ? "Exportar dashboard" : "Exportar leads"}</h2><p>Elige la información del archivo. Verificaremos tu acceso antes de generarlo.</p></div><button type="button" className="export-close" aria-label="Cerrar exportación" disabled={busy} onClick={close}>Cerrar</button></div>
      <div className="export-dialog-body">
      <fieldset disabled={busy} className="hu22-options"><legend>{kind === "metrics" ? "Hojas del libro" : "Información incluida"}</legend>{Object.entries(choices).map(([key, text]) => <label className={blocks.includes(key) ? "is-selected" : ""} key={key}><input type="checkbox" checked={blocks.includes(key)} onChange={() => toggle(blocks, key, setBlocks)} /><span>{text}</span></label>)}</fieldset>
      {kind === "leads" && <fieldset disabled={busy || eligibleIds === null} className="hu22-options"><legend>Leads que se exportarán</legend><p>{ids.length} de {eligible.length} seleccionados. Desmarca los que quieras excluir.</p><div className="hu22-selection">{eligible.map(item => <label key={item.id}><input type="checkbox" checked={selected.includes(item.id)} onChange={() => toggle(selected, item.id, setSelected)} />{item.name || "Lead sin nombre"}</label>)}</div>{eligible.length > 0 && !ids.length && <p role="alert">Selecciona al menos un lead para exportar.</p>}</fieldset>}
      {kind !== "metrics" && eligibleIds === null && !error && <p role="status">Verificando acceso a los leads…</p>}
      {kind !== "metrics" && eligibleIds !== null && !eligible.length && <p role="alert">No hay leads exportables dentro de tu alcance actual.</p>}
      <label className="hu22-filename" htmlFor={`${titleId}-filename`}>Nombre del archivo (opcional)<span><input id={`${titleId}-filename`} type="text" value={fileName} maxLength={120} disabled={busy} placeholder={`RutaHogar-${kind}-${new Date().toLocaleDateString("en-CA")}`} onChange={event => setFileName(event.target.value)} /><span>.{kind === "dossier" ? "pdf" : "xlsx"}</span></span><small>Si lo dejas vacío, se usará el nombre automático.</small></label>
      <p className="hu22-note">Los campos vacíos se muestran como “Sin dato”.</p>
      {error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status" className="export-success"><i className="ti ti-circle-check" aria-hidden="true" />{success}</p>}

      {recordsOpen && recordsLoading && <p role="status">Cargando exportaciones recientes...</p>}
      {recordsOpen && records && <div className="hu22-selection" aria-label="Últimas 100 exportaciones autorizadas"><h3>Exportaciones recientes</h3>{records.length ? records.map(record => <article className="hu22-record" key={record.id}><strong>{EXPORT_KINDS[record.kind]} · {new Date(record.generated_at).toLocaleString("es-CL")}</strong><p>{record.status === "prepared" ? "Preparada, sin descarga iniciada" : "Descarga iniciada"} · {record.record_count == null ? "Datos agregados" : `${record.record_count} leads`}</p><p>{record.actor_name || "Sin dato"} · {record.actor_email || "Sin dato"}</p><details><summary>Mostrar detalles</summary><dl>{contextRows(record).map(([key, value]) => <React.Fragment key={key}><dt>{key}</dt><dd>{value}</dd></React.Fragment>)}</dl></details></article>) : <p>No hay exportaciones registradas.</p>}</div>}
      </div>
      <div className="hu22-actions"><button className="secondary-button" type="button" disabled={busy} aria-expanded={recordsOpen} onClick={toggleRecords}>{recordsOpen ? "Ocultar exportaciones recientes" : "Ver exportaciones recientes"}</button><button className="primary-button" type="button" disabled={busy || !blocks.length || (kind !== "metrics" && (!ids.length || ids.length > 500))} onClick={generate}>{busy ? "Preparando archivo…" : `Descargar ${kind === "dossier" ? "PDF" : "XLSX"}`}</button></div>
    </section>
  </div>, document.body);
}

export default function ExportAction({ kind, candidates = [], projectId = null, filters = {}, sourceAt = null, metrics = null, metricProjects = [] }) {
  const [open, setOpen] = useState(false);
  return <><button className="secondary-button compact-button export-trigger" type="button" onClick={() => setOpen(true)} disabled={kind !== "metrics" && !candidates.length}><i className={`ti ${kind === "dossier" ? "ti-file-type-pdf" : "ti-download"}`} aria-hidden="true" />{kind === "dossier" ? "Generar dossier" : "Exportar XLSX"}</button>{open && <ExportDialog {...{ kind, candidates, projectId, filters, sourceAt, metrics, metricProjects }} onClose={() => setOpen(false)} />}</>;
}
