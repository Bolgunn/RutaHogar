import { stageLabel, STAGES } from "../commercial/stageRules";
import { formValueLabels, plazoLabels, propertyLabels } from "../../constants";

export const EXPORT_KINDS = { dossier: "Dossier individual", leads: "Leads", metrics: "Métricas del dashboard" };
const DISPLAY_LABELS = {
  profile: "Perfil y contacto", evaluation: "Evaluación", financial: "Antecedentes financieros", project: "Proyecto", plan: "Plan de mejora",
  search: "Búsqueda", commune: "Comuna", comuna: "Comuna", age: "Edad", date: "Período", reliabilityStatus: "Confiabilidad", sortBy: "Orden de resultados",
  precio_min_uf: "Precio mínimo (UF)", precio_max_uf: "Precio máximo (UF)", tipo: "Tipo", tipo_vivienda: "Tipo de vivienda", estado: "Estado",
  income_gap_clp: "Brecha de ingreso (CLP)", down_payment_gap_clp: "Brecha de pie (CLP)", type: "Tipo de acción", gap: "Brecha pendiente",
  rate: "Tasa", sales: "Ventas", plan_a_venta: "Conversión de plan a venta", plan_mejora_a_venta: "Conversión de plan de mejora a venta", contacto: "Contacto",
  general: "General", mejores: "Mejores resultados", bandas: "Tramos de score", desglose: "Desglose", por_proyecto: "Por proyecto", granularidad: "Agrupación temporal", periodos: "Períodos",
  funnel_view: "Vista del embudo", times_view: "Vista de tiempos", dimension: "Dimensión", tiempoSerie: "Serie temporal", tab: "Pestaña",
};
const VALUES = {
  ...formValueLabels, ...plazoLabels, ...propertyLabels,
  todos: "Todos", todas: "Todas", default: "Oportunidades confiables", afinidad: "Afinidad con el proyecto", capacidad: "Mayor capacidad de compra",
  normal: "Normal", sospechoso: "Sospechoso", en_revision: "En revisión", reactivado: "Reactivado", silenciado: "Silenciado",
  ejecutivo: "Ejecutivo comercial", admin: "Administrador", admin_inmobiliario: "Administrador inmobiliario",
  prepared: "Preparada, sin descarga iniciada", delivery_requested: "Descarga iniciada", compatible: "Compatible", close: "Cercano", marginal: "Marginal", out_of_reach: "Fuera de alcance", needs_data: "Requiere antecedentes", requires_adjustment: "Requiere ajuste",
  mes: "Mes", semana: "Semana", dia: "Día", high: "Alta", medium: "Media", low: "Baja",
  increase_savings: "Aumentar ahorro", reduce_debt: "Reducir deuda", adjust_property_goal: "Ajustar objetivo inmobiliario", regularize_debt: "Regularizar morosidad", verify_credit_status: "Verificar situación crediticia", improve_job_stability: "Fortalecer continuidad laboral",
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

export function contextRows(context, projects = []) {
  const project = projects.find(item => item.id === context.project_id)?.nombre || context.project_name;
  return [
    ["Tipo de exportación", EXPORT_KINDS[context.kind] || "Sin dato"],
    ["Fecha de generación", scalar(context.generated_at)], ["Corte de datos", scalar(context.source_at)],
    ["Generado por", scalar(context.actor_name)], ["Correo del responsable", scalar(context.actor_email)],
    ["Rol del responsable", scalar(context.actor_role)], ["Proyecto seleccionado", project || (context.project_id ? "Proyecto autorizado" : "Todos los proyectos autorizados")],
    ["Información incluida", (context.blocks || []).map(key => EXPORT_BLOCKS[key] || METRIC_SECTIONS[key]).filter(Boolean).join(", ") || "Sin dato"],
    ["Cantidad de leads", context.record_count ?? "Datos agregados"], ["Estado", scalar(context.status)],
    ...flatten({ ...context.filters, ...(context.filters?.age === 0 ? { age: "Todas las edades" } : {}) }, "Filtros", Object.fromEntries(projects.map(item => [item.id, item.nombre]))),
  ];
}

export const EXPORT_BLOCKS = {
  profile: "Perfil y contacto", evaluation: "Evaluación", financial: "Antecedentes financieros", project: "Proyecto objetivo y compatibilidad", plan: "Plan de mejora", evaluation_history: "Historial de evaluaciones y finanzas", commercial_history: "Historial comercial",
};
export const METRIC_SECTIONS = { resumen: "Resumen", embudo: "Embudo", tiempos: "Tiempos", engagement: "Engagement", desgloses: "Desgloses", historico: "Histórico" };
const LABELS = { full_name: "Nombre", phone: "Teléfono", email: "Correo", created_at: "Fecha", evaluated_at: "Fecha de evaluación", score: "Score", classification: "Clasificación", algorithm_version: "Versión del algoritmo", ingreso_mensual: "Ingreso mensual (CLP)", deuda_mensual: "Deuda mensual (CLP)", ahorro_disponible: "Ahorro disponible (CLP)", dividendo_estimado: "Dividendo declarado (CLP)", edad: "Edad", tipo_contrato: "Tipo de contrato", continuidad_laboral: "Continuidad laboral", morosidad_actual: "Morosidad declarada", plazo_credito_hipotecario: "Plazo (años)", occurred_at: "Fecha", stage_before: "Etapa anterior", stage_after: "Etapa posterior", reason: "Motivo", actor_role: "Rol responsable", proyecto_id: "Proyecto", nombre: "Nombre", objective: "Objetivo declarado", analyzed: "Proyecto analizado", title: "Acción", current_value: "Valor actual", target_value: "Meta", estimated_months: "Plazo estimado (meses)", priority: "Prioridad", status: "Estado", filters: "Filtros", generated_at: "Generación (UTC)", source_at: "Corte de datos", blocks: "Bloques incluidos", record_count: "Cantidad de leads", actor_id: "Generado por (ID)", kind: "Tipo", id: "Identificador de exportación" };
export function label(key) {
  const metricLabels = { n: "Cantidad", tasa: "Tasa", promedio: "Promedio", mediana: "Mediana", captura: "Captura", postulan: "Postulaciones", leads: "Leads", clave: "Período o dimensión", desde: "Desde", hasta: "Hasta", etapa: "Etapa", alcanzaron: "Alcanzaron la etapa", ventas: "Ventas", activos: "Activos", en_curso: "En curso", id: "Identificador", objective_compatibility: "Compatibilidad del objetivo declarado" };
  return DISPLAY_LABELS[key] || metricLabels[key] || LABELS[key] || key.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replace(/^./, letter => letter.toUpperCase());
}
export function scalar(value) {
  if (value === null || value === undefined || value === "" || (typeof value === "string" && UUID.test(value))) return "Sin dato";
  if (typeof value === "number") return Number.isFinite(value) ? value : "Sin dato";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return VALUES[value] || String(value);
}
function fieldName(path) {
  const parts = path.split(" / ");
  const suffixes = {
    "Captura / Cantidad": "Leads captados",
    "Captura / Postulaciones": "Leads que postularon",
    "Captura / Tasa": "Tasa de postulación",
    "Contacto / Sin contactar / Cantidad": "Leads sin contactar",
    "Contacto / Sin contactar / Antiguedad mediana": "Antigüedad mediana de leads sin contactar (días)",
    "Contacto / Sin contactar / Antiguedad maxima": "Antigüedad máxima de leads sin contactar (días)",
    "Contacto / Contactados mes actual": "Leads contactados este mes",
    "Contacto / Contactados por mi / Total": "Leads contactados por mí",
    "Contacto / Contactados por mi / Mes actual": "Leads contactados por mí este mes",
    "Conversión de plan a venta / Con plan": "Leads con plan",
    "Conversión de plan a venta / Con plan y venta": "Leads con plan y venta",
    "Conversión de plan a venta / Tasa": "Tasa de conversión de plan a venta",
    "Conversión de plan de mejora a venta / En plan mejora": "Leads con plan de mejora",
    "Conversión de plan de mejora a venta / Con venta": "Leads con plan de mejora y venta",
    "Conversión de plan de mejora a venta / Tasa": "Tasa de conversión de plan de mejora a venta",
    "Contacto / Tiempo primer contacto / Cantidad": "Leads con primer contacto medido",
    "Contacto / Tiempo primer contacto / Promedio": "Tiempo promedio hasta el primer contacto (días)",
    "Contacto / Tiempo primer contacto / Mediana": "Tiempo mediano hasta el primer contacto (días)",
  };
  for (const [suffix, text] of Object.entries(suffixes)) {
    if (path === suffix) return text;
    if (path.endsWith(` / ${suffix}`)) return `${text} (${path.slice(0, -suffix.length - 3).split(" / ").join(", ")})`;
  }
  if (parts.length === 1) return path;
  const leaf = parts.pop();
  const context = parts.filter(part => !["Perfil y contacto", "Antecedentes financieros", "Evaluación", "Filtros"].includes(part));
  return context.length ? `${leaf} (${context.join(", ")})` : leaf;
}

export function flatten(value, path = "", references = {}) {
  return flattenPaths(value, path, references).map(([name, item]) => [fieldName(name), item]);
}

function flattenPaths(value, path = "", references = {}) {
  if (!value || typeof value !== "object") return [[path, typeof value === "string" && references[value] ? references[value] : scalar(value)]];
  if (Array.isArray(value)) return value.flatMap((item, index) => {
    const dimension = item?.nombre || item?.clave || (item?.etapa ? stageLabel(item.etapa) : null) || `Registro ${index + 1}`;
    const display = references[dimension] || (UUID.test(String(dimension)) ? "Proyecto autorizado" : scalar(dimension));
    return flattenPaths(item, path ? `${path} / ${display}` : display, references);
  });
  return Object.entries(value).flatMap(([key, item]) => {
    if (["algorithm_version", "scoring_version", "version_algoritmo"].includes(key)) return [];
    if (key === "id" || key.endsWith("_id") || key.endsWith("_ids")) {
      return ["project_id", "proyecto_id"].includes(key) && references[item] ? [[path ? `${path} / Proyecto` : "Proyecto", references[item]]] : [];
    }
    const displayKey = references[key] || (UUID.test(key) ? "Proyecto autorizado" : label(key));
    return flattenPaths(["stage_before", "stage_after", "etapa", "desde", "hasta"].includes(key) && STAGES.some(stage => stage.value === item) ? stageLabel(item) : item, path ? `${path} / ${displayKey}` : displayKey, references);
  });
}
export function metricsSheets(metrics, sections, projects = []) {
  const source = {
    resumen: { leads: metrics.n, captura: metrics.captura, plan_a_venta: metrics.plan_a_venta, plan_mejora_a_venta: metrics.plan_mejora_a_venta, contacto: metrics.contacto },
    embudo: { general: metrics.embudo, mejores: metrics.mejores }, tiempos: metrics.tiempos, engagement: metrics.engagement,
    desgloses: { bandas: metrics.bandas, desglose: metrics.desglose, por_proyecto: metrics.por_proyecto }, historico: metrics.serie,
  };
  const references = Object.fromEntries(projects.map(project => [project.id, project.nombre]));
  return Object.keys(METRIC_SECTIONS).filter(section => sections.includes(section)).map(section => ({ name: METRIC_SECTIONS[section], rows: [["Indicador", "Valor"], ...flatten(source[section], "", references)] }));
}
export function exportSheets(snapshot, metrics) {
  const sheets = [{ name: "Contexto", rows: [["Campo", "Valor"], ...contextRows(snapshot.context, snapshot.scope_projects), ["Alcance de la evaluación", "Precalificación referencial. No constituye aprobación bancaria."], ["Campos vacíos", "Sin dato no equivale a cero."]] }];
  if (snapshot.context.kind === "metrics") return [...sheets, ...metricsSheets(metrics, snapshot.context.blocks, snapshot.scope_projects)];
  const rows = snapshot.items.map((item, index) => ({ Lead: item.profile?.full_name || `Lead ${index + 1}`, ...Object.fromEntries(flatten({ evaluated_at: item.evaluated_at, ...Object.fromEntries(Object.entries(item).filter(([key]) => !["evaluation_id", "evaluated_at", "evaluation_history", "commercial_history"].includes(key))) })) }));
  const columns = [...new Set(rows.flatMap(row => Object.keys(row)))];
  sheets.push({ name: "Leads", rows: [columns, ...rows.map(row => columns.map(column => row[column] ?? "Sin dato"))] });
  for (const field of ["evaluation_history", "commercial_history"]) {
    const histories = snapshot.items.flatMap((item, index) => (item[field] || []).map(row => ({ "Lead": item.profile?.full_name || `Lead ${index + 1}`, "Correo del lead": item.profile?.email || "Sin dato", ...Object.fromEntries(flatten(row, "", Object.fromEntries((snapshot.scope_projects || []).map(project => [project.id, project.nombre])))) })));
    if (!histories.length) continue;
    const keys = [...new Set(histories.flatMap(row => Object.keys(row)))];
    sheets.push({ name: field === "evaluation_history" ? "Evaluaciones" : "Gestión comercial", rows: [keys, ...histories.map(row => keys.map(key => row[key] ?? "Sin dato"))] });
  }
  return sheets;
}
export async function makeWorkbook(snapshot, metrics) {
  const module = await import("exceljs");
  const ExcelJS = module.default || module;
  const book = new ExcelJS.Workbook();
  book.creator = "RutaHogar";
  book.created = new Date(snapshot.context.generated_at);
  const concise = text => String(text)
    .replace("Historial de evaluaciones y finanzas", "Historial financiero")
    .replace("Proyecto objetivo y compatibilidad", "Proyecto y compatibilidad")
    .replace("Fecha de evaluación", "Evaluado el")
    .replace("Correo del responsable", "Correo responsable")
    .replace("Rol del responsable", "Rol responsable")
    .replace("Plazo estimado (meses)", "Plazo (meses)")
    .replace("Compatibilidad del objetivo declarado", "Compatibilidad del objetivo")
    .replace("Antigüedad mediana de leads sin contactar", "Sin contactar: antigüedad mediana")
    .replace("Antigüedad máxima de leads sin contactar", "Sin contactar: antigüedad máxima")
    .replace("Tiempo promedio hasta el primer contacto", "Primer contacto: promedio")
    .replace("Tiempo mediano hasta el primer contacto", "Primer contacto: mediana")
    .replace("Tasa de conversión de plan de mejora a venta", "Conversión a venta: plan de mejora")
    .replace("Tasa de conversión de plan a venta", "Conversión a venta: con plan");
  for (const { name, rows } of exportSheets(snapshot, metrics)) {
    const sheet = book.addWorksheet(name, { properties: { tabColor: { argb: name === "Contexto" ? "FFC99B2C" : "FF132B4A" } } });
    sheet.addRows(rows.map(row => row.map(scalar)));
    const keyValue = rows[0]?.length === 2 && ["Campo", "Indicador"].includes(rows[0][0]);
    sheet.eachRow((row, rowNumber) => {
      row.eachCell(cell => {
        cell.font = { name: "Calibri", size: 11, color: { argb: "FF243B55" } };
        cell.alignment = { vertical: "top", wrapText: true };
        if (rowNumber > 1 && rowNumber % 2 === 0) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F4F8" } };
        if (typeof cell.value === "number") {
          const meaning = keyValue ? String(rows[rowNumber - 1][0]) : String(rows[0][cell.col - 1]);
          cell.numFmt = /tasa|rate/i.test(meaning) ? "0.0%" : /CLP/.test(meaning) ? "#,##0" : "#,##0.##";
          cell.alignment = { vertical: "top", horizontal: "right", wrapText: true };
        }
        if (typeof cell.value === "string" && /^\d{4}-\d{2}-\d{2}(?:T[\d:.]+(?:Z|[+-]\d{2}:\d{2}))?$/.test(cell.value)) {
          const date = new Date(cell.value);
          if (Number.isFinite(date.getTime())) {
            const withTime = cell.value.includes("T");
            cell.value = date;
            cell.numFmt = withTime ? "dd-mm-yyyy hh:mm" : "dd-mm-yyyy";
            if (withTime) cell.note = "Fecha y hora en UTC.";
          }
        }
        if (rowNumber === 1 || (keyValue && cell.col === 1)) {
          const full = String(cell.value ?? "");
          cell.value = concise(full);
          if (cell.value !== full) cell.note = full;
        }
      });
    });
    sheet.columns.forEach((column, index) => {
      const values = column.values.filter(value => value != null).map(value => value instanceof Date ? "00-00-0000 00:00" : String(value));
      const longest = Math.max(0, ...values.map(value => value.length));
      column.width = keyValue ? (index === 0 ? 44 : 64) : Math.min(40, Math.max(15, Math.min(longest, 36) + 3));
    });
    sheet.eachRow(row => {
      let lines = 1;
      row.eachCell(cell => { lines = Math.max(lines, ...String(cell.value instanceof Date ? "Fecha" : cell.value ?? "").split("\n").map(text => Math.ceil(text.length / Math.max(10, sheet.getColumn(cell.col).width - 3)))); });
      row.height = Math.max(28, lines * 16 + 12);
    });
    sheet.views = [{ state: "frozen", ySplit: 1, xSplit: keyValue ? 0 : 1, showGridLines: false }];
    sheet.getRow(1).font = { name: "Calibri", size: 11, bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF132B4A" } };
    sheet.getRow(1).alignment = { vertical: "middle", wrapText: true };
    sheet.pageSetup = { orientation: keyValue ? "portrait" : "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:1" };
    sheet.headerFooter.oddFooter = "&LRutaHogar&R&P / &N";
    if (!keyValue && rows.length > 1 && rows[0].length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: rows.length, column: rows[0].length } };
  }
  return new Blob([await book.xlsx.writeBuffer()], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
export async function makeDossier(snapshot) {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF();
  let bodyFont = "helvetica", titleFont = "times", logo = null;
  if (typeof document !== "undefined") {
    const base = `${import.meta.env.BASE_URL || "/"}brand/rutahogar/`;
    const assets = await Promise.allSettled(["fonts/PlusJakartaSans.ttf", "fonts/Fraunces.ttf", "logo-rutahogar.svg"].map(async file => {
      const response = await fetch(`${base}${file}`);
      if (!response.ok) throw new Error("Brand asset unavailable");
      return response.arrayBuffer();
    }));
    for (const [index, name] of ["Jakarta", "Fraunces"].entries()) {
      if (assets[index].status !== "fulfilled") continue;
      const bytes = new Uint8Array(assets[index].value);
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      pdf.addFileToVFS(`${name}.ttf`, btoa(binary));
      pdf.addFont(`${name}.ttf`, name, "normal");
      if (index === 0) bodyFont = name; else titleFont = name;
    }
    if (assets[2].status === "fulfilled") {
      const url = URL.createObjectURL(new Blob([assets[2].value], { type: "image/svg+xml" }));
      try {
        const image = new Image();
        await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
        const canvas = document.createElement("canvas"); canvas.width = 1020; canvas.height = 330;
        canvas.getContext("2d").drawImage(image, 0, 0, 1020, 330);
        logo = canvas.toDataURL("image/png");
      } catch { /* Keep the text wordmark if the image cannot be decoded. */ }
      finally { URL.revokeObjectURL(url); }
    }
  }
  const navy = [19, 43, 74], gold = [212, 168, 67], muted = [90, 106, 126];
  const header = () => {
    pdf.setFillColor(...navy); pdf.rect(0, 0, 210, 2, "F");
    pdf.setFillColor(...gold); pdf.rect(134, 0, 76, 2, "F");
    if (logo) pdf.addImage(logo, "PNG", 16, 8, 48, 15.5);
    else { pdf.setFont(bodyFont, "normal"); pdf.setFontSize(14); pdf.setTextColor(...navy); pdf.text("RutaHogar", 16, 18); }
    pdf.setFont(bodyFont, "normal"); pdf.setFontSize(8); pdf.setTextColor(...muted);
    pdf.text("DOSSIER COMERCIAL", 194, 17, { align: "right" });
    pdf.setDrawColor(232, 229, 223); pdf.line(16, 27, 194, 27);
  };
  header();
  pdf.setTextColor(...navy); pdf.setFont(titleFont, "normal"); pdf.setFontSize(25);
  const title = snapshot.items[0].profile?.full_name || "Dossier del lead";
  const titleLines = pdf.splitTextToSize(title, 178);
  pdf.text(titleLines, 16, 42);
  let y = 44 + titleLines.length * 10;
  pdf.setFont(bodyFont, "normal"); pdf.setFontSize(9); pdf.setTextColor(...muted);
  const date = new Date(snapshot.context.generated_at).toLocaleString("es-CL", { timeZone: "America/Santiago" });
  pdf.text(`Generado el ${date} (Chile)`, 16, y); y += 8;
  pdf.setFillColor(245, 237, 214); pdf.roundedRect(16, y, 178, 15, 2, 2, "F");
  pdf.setTextColor(...navy); pdf.setFontSize(8);
  pdf.text("Precalificación referencial. No constituye aprobación bancaria.", 20, y + 9);
  y += 28;
  for (const block of Object.keys(EXPORT_BLOCKS).filter(key => snapshot.context.blocks.includes(key))) {
    const value = snapshot.items[0][block];
    let rows = flatten(value).map(([name, item]) => [name, typeof item === "number" ? item.toLocaleString("es-CL", { maximumFractionDigits: 2 }) : item]);
    if (!rows.length) rows = [["Información", "Sin registros disponibles"]];
    if (y > 240) { pdf.addPage(); header(); y = 39; }
    pdf.setFont(titleFont, "normal"); pdf.setTextColor(...navy);
    pdf.setFontSize(15); pdf.text(EXPORT_BLOCKS[block], 16, y);
    const historyKeys = block === "evaluation_history" ? ["created_at", "score", "classification", "ingreso_mensual", "deuda_mensual", "ahorro_disponible"] : block === "commercial_history" ? ["occurred_at", "proyecto_id", "stage_before", "stage_after", "reason"] : null;
    const head = historyKeys ? [historyKeys.map(label)] : [["Antecedente", "Detalle"]];
    if (historyKeys) rows = value?.length ? value.map(row => historyKeys.map(key => key === "proyecto_id" ? snapshot.scope_projects.find(project => project.id === row[key])?.nombre || scalar(row[key]) : ["stage_before", "stage_after"].includes(key) && row[key] ? stageLabel(row[key]) : typeof row[key] === "number" ? row[key].toLocaleString("es-CL", { maximumFractionDigits: 2 }) : scalar(row[key]))) : [["Sin registros disponibles", ...historyKeys.slice(1).map(() => "")]];
    autoTable(pdf, { startY: y + 5, head, body: rows, theme: "plain", styles: { font: bodyFont, fontStyle: "normal", textColor: navy, fontSize: historyKeys ? 7.5 : 9, overflow: "linebreak", cellPadding: 3.5, lineColor: [232, 229, 223], lineWidth: { bottom: .15 } }, headStyles: { fillColor: navy, textColor: [255, 255, 255], fontStyle: "normal" }, alternateRowStyles: { fillColor: [250, 248, 245] }, columnStyles: historyKeys ? {} : { 0: { cellWidth: 65, textColor: muted } }, margin: { top: 35, left: 16, right: 16, bottom: 22 }, rowPageBreak: "avoid", willDrawPage: data => { if (data.pageNumber > 1) header(); } });
    y = pdf.lastAutoTable.finalY + 13;
  }
  for (let page = 1; page <= pdf.getNumberOfPages(); page++) {
    pdf.setPage(page); header(); pdf.setFont(bodyFont, "normal"); pdf.setTextColor(...muted); pdf.setFontSize(8);
    pdf.setDrawColor(232, 229, 223); pdf.line(16, 279, 194, 279);
    pdf.text("RutaHogar · Información de uso comercial", 16, 286);
    pdf.text(`${page} de ${pdf.getNumberOfPages()}`, 194, 286, { align: "right" });
  }
  return pdf.output("blob");
}
