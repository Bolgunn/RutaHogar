import React, { useEffect, useState } from "react";
import { getArcoRequests, resolveArcoRequest } from "../services/arcoService";

const tipoLabels = {
  acceso: "Acceso",
  rectificacion: "Rectificación",
  cancelacion: "Cancelación",
  oposicion: "Oposición",
  otro: "Otro",
};

const estadoLabels = {
  pendiente: "Pendiente",
  en_proceso: "En proceso",
  rechazado: "Rechazado",
  procesado: "Procesado",
};

function formatFecha(dt) {
  if (!dt) return "-";
  const d = new Date(dt);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function AdminArcoRequests() {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState(null);
  const [resolving, setResolving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getArcoRequests(null, "admin");
      setRequests(data || []);
    } catch (err) {
      setError(err.message || "Error al cargar solicitudes ARCO.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const handleResolve = async () => {
    if (!selected) return;
    setResolving(true);
    setError("");
    try {
      await resolveArcoRequest(selected.id);
      setRequests((prev) =>
        prev.map((r) =>
          r.id === selected.id
            ? { ...r, estado: "procesado", updated_at: new Date().toISOString() }
            : r
        )
      );
      setSelected(null);
    } catch (err) {
      setError(err.message || "Error al resolver la solicitud.");
    } finally {
      setResolving(false);
    }
  };

  const visible = showAll
    ? requests
    : requests.filter((r) => r.estado === "pendiente");

  return (
    <section>
      <div className="admin-surface__header">
        <div className="admin-surface__title">
          <h2>Solicitudes ARCO</h2>
          <p>Gestiona solicitudes de acceso, rectificación, cancelación u oposición con trazabilidad básica.</p>
        </div>
        <label style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem", cursor: "pointer" }}>
          <input type="checkbox" checked={showAll} onChange={() => setShowAll((s) => !s)} />
          Mostrar todas
        </label>
      </div>

      {error && <div className="error-message" style={{ marginBottom: "0.75rem" }}>{error}</div>}

      {loading ? (
        <p className="small-text">Cargando solicitudes…</p>
      ) : !visible.length ? (
        <div className="empty-state">
          {showAll
            ? "No hay solicitudes ARCO registradas."
            : "No hay solicitudes ARCO pendientes."}
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th>Fecha</th>
                <th>Estado</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visible.map((item) => (
                <tr key={item.id}>
                  <td>{item.email}</td>
                  <td>{tipoLabels[item.tipo] || item.tipo}</td>
                  <td style={{ maxWidth: "240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {item.descripcion}
                  </td>
                  <td>{formatFecha(item.created_at)}</td>
                  <td>
                    <span className={`status-pill ${item.estado === "procesado" ? "procesado" : item.estado === "pendiente" ? "medio" : "bajo"}`}>
                      {estadoLabels[item.estado] || item.estado}
                    </span>
                  </td>
                  <td>
                    {item.estado === "pendiente" && (
                      <button className="secondary-button compact-button" onClick={() => setSelected(item)}>
                        Resolver
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <div className="admin-modal" onClick={() => { if (!resolving) setSelected(null); }}>
          <div className="admin-modal-card" style={{ maxWidth: "520px" }} onClick={(e) => e.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <span className="eyebrow">Privacidad y datos</span>
                <h2>Resolver solicitud ARCO</h2>
                <p>Confirma el cambio de estado manteniendo el registro visible para seguimiento.</p>
              </div>
              <button
                className="secondary-button compact-button"
                onClick={() => setSelected(null)}
                disabled={resolving}
              >
                Cerrar
              </button>
            </div>

            <div className="admin-list" style={{ marginBottom: "1.25rem" }}>
              <p style={{ margin: 0 }}><strong>Email:</strong> {selected.email}</p>
              <p style={{ margin: 0 }}><strong>Tipo:</strong> {tipoLabels[selected.tipo] || selected.tipo}</p>
              <p style={{ margin: 0 }}><strong>Descripción:</strong> {selected.descripcion}</p>
              <p style={{ margin: 0 }}><strong>Fecha:</strong> {formatFecha(selected.created_at)}</p>
            </div>

            <p style={{ margin: "0 0 1rem", color: "#666" }}>
              Al confirmar, la solicitud pasará a estado <strong>"Procesado"</strong>.
            </p>

            {error && <div className="error-message" style={{ marginBottom: "0.75rem" }}>{error}</div>}

            <div className="form-actions" style={{ justifyContent: "flex-end" }}>
              <button
                className="secondary-button"
                onClick={() => setSelected(null)}
                disabled={resolving}
              >
                Cancelar
              </button>
              <button onClick={handleResolve} disabled={resolving}>
                {resolving ? "Procesando…" : "Confirmar y procesar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
