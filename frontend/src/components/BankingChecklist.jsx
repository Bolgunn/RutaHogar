import React, { useState, useMemo, useEffect } from "react";

// Standard background documents from Spike 1 (spike1_e5.md)
const CHECKLIST_DATA = {
  common: [
    {
      id: "cedula",
      category: "Identificación y Residencia",
      title: "Cédula de identidad vigente (RUT titular / cónyuge / codeudor)",
      subtitle: "Fotocopia legible por ambos lados.",
      mitigatesRisks: [],
    },
    {
      id: "domicilio",
      category: "Identificación y Residencia",
      title: "Certificado de residencia o comprobante de cuenta de servicios",
      subtitle: "Boleta de servicio básico (luz, agua, gas) a tu nombre (< 90 días).",
      mitigatesRisks: [],
    },
    {
      id: "ahorro_pie",
      category: "Identificación y Residencia",
      title: "Comprobante de ahorro o pie",
      subtitle: "Cartola de cuenta de ahorro vivienda, fondos mutuos o libreta de ahorro.",
      mitigatesRisks: ["ahorro_bajo", "precio_objetivo", "pie_insuficiente"],
      priorityBadge: "Prioritario: Pie Insuficiente",
      priorityReason: "Acredita el capital inicial requerido para el pie.",
    },
  ],
  dependiente: [
    {
      id: "liquidaciones",
      category: "Acreditación Laboral e Ingresos",
      title: "Últimas 3 a 6 liquidaciones de sueldo",
      subtitle: "3 si la renta es fija, 6 si incluye renta variable.",
      mitigatesRisks: [],
    },
    {
      id: "cotizaciones_afp",
      category: "Acreditación Laboral e Ingresos",
      title: "Certificado de cotizaciones previsionales AFP",
      subtitle: "Histórico de cotizaciones de los últimos 12 a 24 meses con RUT del empleador.",
      mitigatesRisks: ["continuidad_baja", "continuidad_media", "continuidad_laboral_baja", "contrato_inestable"],
      priorityBadge: "Prioritario: Continuidad Laboral",
      priorityReason: "Demuestra estabilidad e historial previsional continuo.",
    },
    {
      id: "antiguedad_laboral",
      category: "Acreditación Laboral e Ingresos",
      title: "Certificado de antigüedad laboral emitido por el empleador",
      subtitle: "Documento oficial que especifica cargo, tipo de contrato y fecha de ingreso.",
      mitigatesRisks: ["continuidad_baja", "continuidad_laboral_baja", "contrato_plazo_fijo"],
      priorityBadge: "Prioritario: Antigüedad Laboral",
      priorityReason: "Confirma permanencia contractual vigente.",
    },
  ],
  independiente: [
    {
      id: "f22_sii",
      category: "Acreditación Laboral e Ingresos",
      title: "Últimas 2 declaraciones de renta anual (Formulario 22 SII)",
      subtitle: "Declaraciones de impuesto a la renta de los últimos 2 períodos tributarios.",
      mitigatesRisks: ["contrato_independiente"],
      priorityBadge: "Prioritario: Ingresos Independientes",
      priorityReason: "Valida la rentabilidad y renta anual declarada.",
    },
    {
      id: "boletas_honorarios",
      category: "Acreditación Laboral e Ingresos",
      title: "Resumen de boletas de honorarios electrónicas emitidas",
      subtitle: "Informe emitido en el portal SII correspondiente a los últimos 12 a 24 meses.",
      mitigatesRisks: ["contrato_independiente", "contrato_honorarios_variable"],
      priorityBadge: "Prioritario: Boletas de Honorarios",
      priorityReason: "Respalda la regularidad mensual de ingresos.",
    },
    {
      id: "carpeta_tributaria",
      category: "Acreditación Laboral e Ingresos",
      title: "Carpeta Tributaria Electrónica para solicitud de créditos (SII)",
      subtitle: "Carpeta SII oficial que consolida Formularios 22 y 29 de los últimos 24 meses.",
      mitigatesRisks: ["contrato_independiente", "continuidad_baja", "continuidad_laboral_baja"],
      priorityBadge: "Prioritario: Carpeta Tributaria SII",
      priorityReason: "Requisito formal clave para la evaluación bancaria de independientes.",
    },
  ],
  mitigacion: [
    {
      id: "aclaracion_dicom",
      category: "Antecedentes de Mitigación Comercial",
      title: "Certificados de aclaración, regularización y deuda al día",
      subtitle: "Comprobantes de pago o carta de aclaración emitida por el acreedor (DICOM / Boletín).",
      mitigatesRisks: ["morosidad_alta", "morosidad_media", "morosidad_vigente", "morosidad_desconocida"],
      priorityBadge: "Prioritario: Aclaración de Morosidad",
      priorityReason: "Indispensable para levantar observaciones de morosidad comercial.",
    },
    {
      id: "finiquito_deudas",
      category: "Antecedentes de Mitigación Comercial",
      title: "Certificados de pago total o finiquitos de deudas liquidadas",
      subtitle: "Comprobante de prepago de créditos de consumo o tarjetas extinguidas.",
      mitigatesRisks: ["deuda_alta", "deuda_actual_alta", "carga_total_alta"],
      priorityBadge: "Prioritario: Reducción de Carga",
      priorityReason: "Demuestra la liberación de capacidad de pago mensual.",
    },
  ],
};

export default function BankingChecklist({ evaluation, input: propInput, result: propResult }) {
  const result = evaluation?.result || propResult || {};
  const input = evaluation?.input || propInput || {};

  const initialRegime = useMemo(() => {
    const contract = (input.tipo_contrato || "").toLowerCase();
    return contract === "independiente" || contract === "honorarios_variable" ? "independiente" : "dependiente";
  }, [input.tipo_contrato]);

  const [workRegime, setWorkRegime] = useState(initialRegime);

  useEffect(() => {
    setWorkRegime(initialRegime);
  }, [initialRegime]);

  // Active risk codes set
  const activeRiskCodes = useMemo(() => {
    const codes = new Set();
    if (Array.isArray(result?.risk_codes)) result.risk_codes.forEach((c) => codes.add(c));
    if (Array.isArray(result?.blockers)) result.blockers.forEach((b) => b?.code && codes.add(b.code));
    if (result?.main_blocker?.code) codes.add(result.main_blocker.code);

    if (input.morosidad_actual === "si") codes.add("morosidad_alta");
    if (input.morosidad_actual === "no_lo_se") codes.add("morosidad_media");
    if (input.tipo_contrato === "independiente") codes.add("contrato_independiente");
    if (input.continuidad_laboral === "menos_6_meses") codes.add("continuidad_baja");
    return codes;
  }, [result, input]);

  // Local storage state for user checkboxes
  const storageKey = useMemo(() => `scoreleads_chk_${evaluation?.id || "draft"}`, [evaluation?.id]);
  const [checked, setChecked] = useState(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const toggleCheck = (id) => {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try {
      localStorage.setItem(storageKey, JSON.stringify(next));
    } catch (e) {
      console.warn("Error guardando checklist en localStorage", e);
    }
  };

  // Combine items for current regime
  const currentList = useMemo(() => {
    return [
      ...CHECKLIST_DATA.common,
      ...(workRegime === "independiente" ? CHECKLIST_DATA.independiente : CHECKLIST_DATA.dependiente),
      ...CHECKLIST_DATA.mitigacion,
    ];
  }, [workRegime]);

  // Filter 1 or 2 priority documents for active blocker (Criterio E2)
  const priorityItems = useMemo(() => {
    return currentList.filter((item) => item.mitigatesRisks.some((r) => activeRiskCodes.has(r)));
  }, [currentList, activeRiskCodes]);

  const completedCount = currentList.filter((i) => checked[i.id]).length;
  const progressPercent = Math.round((completedCount / (currentList.length || 1)) * 100);

  return (
    <section className="section-block banking-checklist-minimal">
      <div className="section-heading compact">
        <span className="eyebrow">Preparación Bancaria</span>
        <h2>Checklist Referencial de Antecedentes</h2>
        <p>Antecedentes referenciales para tu evaluación formal en la banca chilena.</p>
      </div>

      {/* Criterio E1: Clean Sober Disclaimer Banner */}
      <div className="minimal-disclaimer-banner" role="alert">
        <div className="disclaimer-body">
          <strong>Checklist Formativo y Referencial</strong>
          <span>No requiere ni solicita carga de documentos sensibles en esta plataforma.</span>
        </div>
      </div>

      {/* Regime Toggle & Progress Bar */}
      <div className="minimal-checklist-toolbar">
        <div className="regime-segmented-toggle">
          <button
            type="button"
            className={workRegime === "dependiente" ? "is-active" : ""}
            onClick={() => setWorkRegime("dependiente")}
          >
            Dependiente
          </button>
          <button
            type="button"
            className={workRegime === "independiente" ? "is-active" : ""}
            onClick={() => setWorkRegime("independiente")}
          >
            Independiente / Honorarios
          </button>
        </div>

        <div className="minimal-progress">
          <span>Preparados: {completedCount} / {currentList.length} ({progressPercent}%)</span>
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>
        </div>
      </div>

      {/* Clean Full List */}
      <div className="minimal-checklist-group">
        <h4 className="group-title">Antecedentes Generales y Laborales</h4>
        <ul className="checklist-minimal-rows">
          {currentList.map((item) => {
            const isPrio = item.mitigatesRisks.some((r) => activeRiskCodes.has(r));
            const isChecked = Boolean(checked[item.id]);

            return (
              <li
                key={item.id}
                className={`minimal-row ${isPrio ? "is-priority" : ""} ${isChecked ? "is-checked" : ""}`}
              >
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => toggleCheck(item.id)}
                  />
                  <div className="row-info">
                    <div className="row-title-line">
                      <strong>{item.title}</strong>
                      {isPrio && <span className="prio-pill">{item.priorityBadge}</span>}
                    </div>
                    <span className="row-desc">{item.subtitle}</span>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
