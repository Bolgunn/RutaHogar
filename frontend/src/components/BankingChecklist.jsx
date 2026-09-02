import React, { useEffect, useMemo, useState } from "react";
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

  const handleOpenAcademia = (e) => {
    e.preventDefault();
    if (onNavigate) {
      onNavigate("academia", { articleId: "docs-1" });
    }
  };

  return (
    <section className="section-block banking-checklist-minimal">
      <div className="section-heading compact banking-checklist-minimal__heading">
        <div>
          <span className="eyebrow">Preparación Bancaria</span>
          <h2>Checklist Referencial de Antecedentes</h2>
          <p>Antecedentes referenciales para tu evaluación formal en la banca chilena.</p>
        </div>
        {onNavigate && (
          <div className="academy-action-wrapper">
            <button type="button" className="secondary-button" onClick={handleOpenAcademia}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
                <path d="M6 12v5c0 1.66 2.69 3 6 3s6-1.34 6-3v-5"/>
              </svg>
              Academia
            </button>
            <span className="helper-text">
              ¿Dónde obtener los documentos?
            </span>
          </div>
        )}
      </div>

      {/* Criterio E3: Safeguards S1, S5, S7, S8 Banner Consolidado */}
      <div className="minimal-disclaimer-banner" role="alert">
        <div className="disclaimer-body">
          <span>{DISCLAIMER_TEXTS.consolidated}</span>
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
          <div className="progress-track" role="progressbar" aria-label="Avance del checklist" aria-valuemin="0" aria-valuemax={currentList.length} aria-valuenow={completedCount}>
            <div className="progress-fill" style={{ width: String(progressPercent) + "%" }} />
          </div>
        </div>
      </div>

      {/* Clean Full List */}
      <div className="minimal-checklist-group">
        <h4 className="group-title">Antecedentes generales y laborales</h4>
        {priorityItems.length > 0 && <p className="minimal-checklist-priority-note">Los elementos marcados como prioritarios responden a antecedentes que conviene preparar primero según tu calificación.</p>}
        <ul className="checklist-minimal-rows">
          {currentList.map((item) => {
            const isPrio = item.mitigatesRisks.some((r) => activeRiskCodes.has(r)) ||
              item.mitigatesFactors.some((f) => activeFactors.has(f));
            const isChecked = Boolean(checked[item.id]);

            return (
              <li
                key={item.id}
                className={["minimal-row", isPrio ? "is-priority" : "", isChecked ? "is-checked" : ""].filter(Boolean).join(" ")}
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

    </section>
  );
}
