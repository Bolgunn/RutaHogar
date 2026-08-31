import React, { useEffect, useMemo, useState } from "react";
import { roleLabels } from "../services/auth";
import { PROVIDER, getTenantContext } from "../services/projectService";
import AdminArcoRequests from "./AdminArcoRequests";

function formatFecha(value) {
  if (!value) return "Sin fecha";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Sin fecha";
  return date.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function DistributionRow({ label, count, total, tone }) {
  const percent = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="admin-distribution-row">
      <div className="admin-distribution-row__head">
        <strong>{label}</strong>
        <span>{count}</span>
      </div>
      <div className="admin-distribution-row__track" aria-hidden="true">
        <span className={`admin-distribution-row__fill admin-distribution-row__fill--${tone}`} style={{ width: `${percent}%` }}></span>
      </div>
      <small>{percent}% del total evaluado</small>
    </div>
  );
}

export default function AdminPanel({ evaluations, profile }) {
  const [tenant, setTenant] = useState(null);
  const [canSeeArco, setCanSeeArco] = useState(false);

  useEffect(() => {
    let active = true;

    getTenantContext()
      .then((context) => {
        if (!active) return;
        setTenant(context);
        setCanSeeArco(PROVIDER === "local" || context.isGlobalAdmin === true);
      })
      .catch(() => {
        if (!active) return;
        setTenant(null);
        setCanSeeArco(PROVIDER === "local");
      });

    return () => {
      active = false;
    };
  }, []);

  const counts = useMemo(
    () =>
      evaluations.reduce(
        (acc, item) => {
          const classification = item.result?.classification;
          acc.total += 1;
          if (classification === "Alto") acc.alto += 1;
          if (classification === "Medio") acc.medio += 1;
          if (classification === "Bajo") acc.bajo += 1;
          return acc;
        },
        { total: 0, alto: 0, medio: 0, bajo: 0 }
      ),
    [evaluations]
  );

  const recentEvaluations = useMemo(() => {
    return [...evaluations]
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      .slice(0, 6);
  }, [evaluations]);

  const topCommunes = useMemo(() => {
    const countsByCommune = evaluations.reduce((acc, item) => {
      const commune = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
      if (!commune) return acc;
      acc[commune] = (acc[commune] || 0) + 1;
      return acc;
    }, {});

    return Object.entries(countsByCommune)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);
  }, [evaluations]);

  const latestEvaluation = recentEvaluations[0] || null;
  const roleCards = [
    {
      key: "admin",
      title: roleLabels.admin,
      description: "Supervisa catálogo, permisos y solicitudes sensibles.",
      state: profile?.role === "admin" ? "Sesión actual" : "Disponible",
    },
    {
      key: "sales",
      title: roleLabels.ejecutivo,
      description: "Gestiona leads, prioridad y seguimiento comercial.",
      state: "Cobertura comercial",
    },
    {
      key: "user",
      title: roleLabels.usuario,
      description: "Recorre preevaluación, simulación y plan personal.",
      state: "Experiencia cliente",
    },
  ];

  const contextRows = [
    {
      label: "Cobertura",
      value: tenant?.isGlobalAdmin ? "Todas las inmobiliarias" : tenant?.inmobiliaria_nombre || "Contexto en carga",
    },
    {
      label: "Sesión",
      value: roleLabels[profile?.role] || profile?.role || "Admin",
    },
    {
      label: "Solicitudes ARCO",
      value: canSeeArco ? "Visibles en esta sesión" : "Restringidas por alcance",
    },
  ];

  return (
    <section className="section-block admin-panel-page">
      <div className="section-heading">
        <span className="eyebrow">Administración</span>
        <h1>Panel administrativo</h1>
        <p>
          Vista de control para el equipo que coordina captación, catálogo y resguardo operativo en RutaHogar.
        </p>
      </div>

      <section className="admin-panel-topbar admin-section-gap">
        <div className="admin-panel-topbar__intro">
          <h2>La operación se lee mejor cuando el contexto no compite con el contenido.</h2>
          <p>
            Este panel prioriza flujo real: actividad reciente, distribución de leads, roles activos y reglas de uso en una composición más compacta.
          </p>
        </div>

        <dl className="admin-panel-context-strip">
          {contextRows.map((item) => (
            <div className="admin-panel-context-strip__item" key={item.label}>
              <dt>{item.label}</dt>
              <dd>{item.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="admin-panel-metric-strip admin-section-gap" aria-label="Resumen administrativo">
        <article className="admin-panel-metric">
          <span>Evaluaciones</span>
          <strong>{counts.total}</strong>
          <small>Base activa del panel.</small>
        </article>
        <article className="admin-panel-metric">
          <span>Alta prioridad</span>
          <strong>{counts.alto}</strong>
          <small>Seguimiento comercial inmediato.</small>
        </article>
        <article className="admin-panel-metric">
          <span>Prioridad media</span>
          <strong>{counts.medio}</strong>
          <small>Casos con trabajo de conversión.</small>
        </article>
        <article className="admin-panel-metric">
          <span>Baja prioridad</span>
          <strong>{counts.bajo}</strong>
          <small>Leads todavía inmaduros.</small>
        </article>
      </section>

      <div className="admin-panel-board admin-panel-board--primary admin-section-gap">
        <article className="admin-surface admin-panel-surface-main">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Actividad reciente</h2>
              <p>
                Últimos ingresos evaluados para revisar quién entró, desde qué comuna y con qué nivel de prioridad.
              </p>
            </div>
            {latestEvaluation ? <span className="admin-tag admin-tag--soft">Último ingreso: {formatFecha(latestEvaluation.created_at)}</span> : null}
          </div>

          {!recentEvaluations.length ? (
            <div className="admin-compact-empty">
              <strong>No hay actividad registrada todavía.</strong>
              <p>Cuando existan evaluaciones, esta bandeja mostrará el contexto mínimo para decidir el siguiente movimiento.</p>
            </div>
          ) : (
            <div className="admin-list admin-list--dense">
              {recentEvaluations.map((item) => (
                <article className="admin-list-item admin-list-item--dense" key={item.id}>
                  <div className="admin-list-item__main">
                    <strong>{item.full_name || item.email || "Lead sin nombre"}</strong>
                    <span>{item.email || "Correo no disponible"}</span>
                  </div>
                  <div className="admin-list-item__meta">
                    <span>{item.input?.comuna_objetivo || item.onboarding?.comuna_interes || "Comuna sin dato"}</span>
                    <span>{formatFecha(item.created_at)}</span>
                  </div>
                  <span className={`status-pill ${String(item.result?.classification || "").toLowerCase()}`}>
                    {item.result?.classification || "Sin clasificación"}
                  </span>
                </article>
              ))}
            </div>
          )}
        </article>

        <aside className="admin-panel-side-stack">
          <article className="admin-surface admin-panel-side-card">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Distribución del flujo</h2>
                <p>Lectura compacta de cómo está entrando la demanda evaluada.</p>
              </div>
            </div>

            <div className="admin-distribution-list">
              <DistributionRow label="Alta prioridad" count={counts.alto} total={counts.total} tone="success" />
              <DistributionRow label="Prioridad media" count={counts.medio} total={counts.total} tone="gold" />
              <DistributionRow label="Baja prioridad" count={counts.bajo} total={counts.total} tone="danger" />
            </div>
          </article>

          <article className="admin-surface admin-panel-side-card admin-surface--soft">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Señales por comuna</h2>
                <p>Dónde se está concentrando la intención de compra reciente.</p>
              </div>
            </div>

            {!topCommunes.length ? (
              <div className="admin-compact-empty">
                <strong>Sin suficientes señales todavía.</strong>
                <p>Se necesita más volumen para detectar concentración territorial.</p>
              </div>
            ) : (
              <div className="admin-list admin-list--dense">
                {topCommunes.map(([commune, total]) => (
                  <article className="admin-list-item admin-list-item--dense" key={commune}>
                    <div className="admin-list-item__main">
                      <strong>{commune}</strong>
                      <span>Demanda observada en el panel actual.</span>
                    </div>
                    <span className="admin-inline-metric">{total}</span>
                  </article>
                ))}
              </div>
            )}
          </article>
        </aside>
      </div>

      <div className="admin-panel-board admin-panel-board--secondary admin-section-gap">
        <article className="admin-surface admin-surface--soft">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Roles con acceso</h2>
              <p>Mapa funcional de quién usa qué parte del producto.</p>
            </div>
          </div>

          <div className="admin-role-grid">
            {roleCards.map((item) => (
              <article className="admin-role-tile" key={item.key}>
                <span className="admin-tag admin-tag--soft">{item.state}</span>
                <strong>{item.title}</strong>
                <p>{item.description}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="admin-surface">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Guardrails activos</h2>
              <p>Reglas visibles que ordenan el uso del panel y el tratamiento de datos.</p>
            </div>
          </div>

          <div className="admin-list admin-list--dense">
            <article className="admin-list-item admin-list-item--dense">
              <div className="admin-list-item__main">
                <strong>Datos sensibles filtrados</strong>
                <span>La vista omite documentos, claves bancarias y reglas internas de cálculo.</span>
              </div>
            </article>
            <article className="admin-list-item admin-list-item--dense">
              <div className="admin-list-item__main">
                <strong>Solicitudes ARCO controladas</strong>
                <span>
                  {canSeeArco
                    ? "Esta sesión puede revisar y procesar solicitudes de privacidad."
                    : "Esta sesión no expone solicitudes ARCO por alcance de permisos."}
                </span>
              </div>
            </article>
            <article className="admin-list-item admin-list-item--dense">
              <div className="admin-list-item__main">
                <strong>Trazabilidad sin alterar scoring</strong>
                <span>El panel observa y organiza la operación sin modificar reglas financieras ni scoring.</span>
              </div>
            </article>
          </div>
        </article>
      </div>

      {canSeeArco && (
        <div className="admin-surface admin-panel-arco-surface">
          <AdminArcoRequests />
        </div>
      )}
    </section>
  );
}
