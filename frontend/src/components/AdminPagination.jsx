import React from "react";

export default function AdminPagination({ pagination, onChange, label = "registros" }) {
  if (!pagination.total) return null;
  const { page, pages, start, end, total } = pagination;
  return <nav className="admin-pagination" aria-label={`Paginación de ${label}`}>
    <span role="status">{start}–{end} de {total} {label}</span>
    {pages > 1 && <div><button type="button" className="secondary-button" disabled={page === 1} onClick={() => onChange(page - 1)} aria-label={`Página anterior de ${label}`}><i className="ti ti-chevron-left" aria-hidden="true" />Anterior</button><span>Página {page} de {pages}</span><button type="button" className="secondary-button" disabled={page === pages} onClick={() => onChange(page + 1)} aria-label={`Página siguiente de ${label}`}>Siguiente<i className="ti ti-chevron-right" aria-hidden="true" /></button></div>}
  </nav>;
}
