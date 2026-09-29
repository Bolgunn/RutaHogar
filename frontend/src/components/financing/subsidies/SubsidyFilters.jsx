import React from "react";
import { SUBSIDY_FILTERS } from "./subsidyDashboardData";

export default function SubsidyFilters({ filter, onFilterChange, sort, onSortChange }) {
  return <div className="subsidy-dashboard__controls">
    <div className="subsidy-dashboard__filters" role="group" aria-label="Filtrar subsidios">
      {SUBSIDY_FILTERS.map((item) => <button key={item.id} type="button" className={filter === item.id ? "is-active" : ""} onClick={() => onFilterChange(item.id)}>{item.label}</button>)}
    </div>
    <label className="subsidy-dashboard__sort">Ordenar por<select value={sort} onChange={(event) => onSortChange(event.target.value)}><option value="relevance">Relevancia para mi perfil</option><option value="benefit">Mayor beneficio referencial</option><option value="savings">Menor ahorro previo</option></select></label>
  </div>;
}
