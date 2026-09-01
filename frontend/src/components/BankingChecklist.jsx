import React, { useState, useMemo, useEffect } from "react";
import {
  DISCLAIMER_TEXTS,
  getChecklistForRegime,
  getActiveRiskCodesAndFactors,
  getPriorityChecklistItems,
} from "../lib/checklist";

export default function BankingChecklist({ evaluation, input: propInput, result: propResult, onNavigate }) {
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

  // Extract active risk codes and factors using pure logic
  const { activeRiskCodes, activeFactors } = useMemo(() => {
    return getActiveRiskCodesAndFactors(result, input);
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

  // Get checklist items for current regime using pure logic
  const currentList = useMemo(() => {
    return getChecklistForRegime(workRegime);
  }, [workRegime]);

  // Filter dynamic priority items matching risk codes or determining factors (Criterio E2)
  const priorityItems = useMemo(() => {
    return getPriorityChecklistItems(currentList, activeRiskCodes, activeFactors);
  }, [currentList, activeRiskCodes, activeFactors]);

  const completedCount = currentList.filter((i) => checked[i.id]).length;
  const progressPercent = Math.round((completedCount / (currentList.length || 1)) * 100);

  // NOTA DE DOCUMENTACIÓN: 
  // Actualmente un solo botón en el encabezado redirige a la Academia de forma general.
  // Si en el futuro se desea que cada antecedente apunte a un artículo específico diferente, 
  // se deben crear esos artículos detallados en `academyContent.js` y restaurar la lógica
  // que pasaba `item.academyArticleId` a `onNavigate("academia", { articleId: ... })`.
  const handleOpenAcademia = (e) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate("academia");
    }
  };

  return (
    <section className="section-block banking-checklist-minimal">
      <div className="section-heading compact" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
        <div>
          <span className="eyebrow">Preparación Bancaria</span>
          <h2>Checklist Referencial de Antecedentes</h2>
          <p>Antecedentes referenciales para tu evaluación formal en la banca chilena.</p>
        </div>
        {onNavigate && (
          <button type="button" className="secondary-button" onClick={handleOpenAcademia}>
            <i className="ti ti-books" /> Ir a la Academia
          </button>
        )}
      </div>

      {/* Criterio E3: Safeguards S1, S5, S7 Banner */}
      <div className="minimal-disclaimer-banner" role="alert">
        <div className="disclaimer-body">
          <strong>{DISCLAIMER_TEXTS.bannerTitle}</strong>
          <span>{DISCLAIMER_TEXTS.bannerText}</span>
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
            const isPrio = item.mitigatesRisks.some((r) => activeRiskCodes.has(r)) ||
              item.mitigatesFactors.some((f) => activeFactors.has(f));
            const isChecked = Boolean(checked[item.id]);

            return (
              <li
                key={item.id}
                className={`minimal-row ${isPrio ? "is-priority" : ""} ${isChecked ? "is-checked" : ""}`}
              >
                <div className="row-main-wrapper">
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
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="checklist-footer-note">
        <p><i className="ti ti-info-circle" /> {DISCLAIMER_TEXTS.legalNote}</p>
      </div>
    </section>
  );
}
