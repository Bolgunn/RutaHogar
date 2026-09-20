import React, { useEffect, useMemo, useState } from "react";
import FieldTooltip from "./FieldTooltip";
import { comunasMvp } from "../constants/comunas";
import {
  estadoProyectoLabels,
  estadoProyectoPillClass,
  tipoProyectoLabels,
} from "../constants/proyectos";
import { validateExecutive, validateProject } from "../services/projectValidation";
import { createExecutive, getExecutives } from "../services/executiveService";
import {
  assignAdmin,
  assignExecutive,
  createInmobiliaria,
  createProject,
  deleteProject,
  getInmobiliarias,
  getProjects,
  getTenantContext,
  setProjectStatus,
  unassignExecutive,
  updateProject,
} from "../services/projectService";

const UF_FORMATTER = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 0 });

const emptyExecutiveForm = {
  full_name: "",
  email: "",
  phone: "",
  inmobiliaria_id: "",
};

const emptyForm = {
  nombre: "",
  inmobiliaria_id: "",
  comuna: "",
  tipo: "departamento",
  estado: "disponible",
  precio_min_uf: "",
  precio_max_uf: "",
  descripcion: "",
  entrega_estimada: "",
};

function formatUfRange(project) {
  return `${UF_FORMATTER.format(project.precio_min_uf)} – ${UF_FORMATTER.format(project.precio_max_uf)} UF`;
}

function countExecutives(project) {
  const ejecutivos = project.ejecutivos || [];
  return {
    total: ejecutivos.length,
    vinculados: ejecutivos.filter((item) => item.estado === "vinculado").length,
    pendientes: ejecutivos.filter((item) => item.estado === "pendiente").length,
  };
}

function formatDeliveryMonth(value) {
  if (!value || !/^\d{4}-\d{2}$/.test(value)) return "Sin fecha comprometida";
  const [year, month] = value.split("-");
  const date = new Date(Number(year), Number(month) - 1, 1);
  if (Number.isNaN(date.getTime())) return "Sin fecha comprometida";
  return date.toLocaleDateString("es-CL", { month: "long", year: "numeric" });
}

export default function AdminProjectCatalog() {
  const [tenant, setTenant] = useState(null);
  const [inmobiliarias, setInmobiliarias] = useState([]);
  const [projects, setProjects] = useState([]);
  const [selectedInmobiliaria, setSelectedInmobiliaria] = useState("");
  const [loading, setLoading] = useState(true);
  const [feedback, setFeedback] = useState(null);

  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("todos");
  const [filterComuna, setFilterComuna] = useState("todas");
  const [projectSort, setProjectSort] = useState({ field: "nombre", direction: "asc" });

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
  const [projectSubmitAttempted, setProjectSubmitAttempted] = useState(false);
  const [executives, setExecutives] = useState([]);
  const [assignEmail, setAssignEmail] = useState("");
  const [assigning, setAssigning] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const [inmobiliariaModal, setInmobiliariaModal] = useState(false);
  const [inmobiliariaNombre, setInmobiliariaNombre] = useState("");
  const [creatingInmobiliaria, setCreatingInmobiliaria] = useState(false);

  const [executiveRoster, setExecutiveRoster] = useState([]);
  const [rosterLoading, setRosterLoading] = useState(true);
  const [executiveModal, setExecutiveModal] = useState(false);
  const [executiveForm, setExecutiveForm] = useState(emptyExecutiveForm);
  const [creatingExecutive, setCreatingExecutive] = useState(false);
  const [executiveModalError, setExecutiveModalError] = useState("");
  const [newExecutiveCredentials, setNewExecutiveCredentials] = useState(null);
  const [executiveSubmitAttempted, setExecutiveSubmitAttempted] = useState(false);

  const [adminModal, setAdminModal] = useState(false);
  const [adminInmobiliaria, setAdminInmobiliaria] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [assigningAdmin, setAssigningAdmin] = useState(false);

  const isGlobalAdmin = Boolean(tenant?.isGlobalAdmin);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const context = await getTenantContext();
        if (!active) return;
        setTenant(context);

        if (context.isGlobalAdmin) {
          const rows = await getInmobiliarias();
          if (!active) return;
          setInmobiliarias(rows);
          setSelectedInmobiliaria("all");
        } else {
          setSelectedInmobiliaria(context.inmobiliaria_id);
        }
      } catch (err) {
        if (active) {
          setFeedback({ type: "error", text: err.message || "No se pudo cargar el catálogo." });
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedInmobiliaria) return;
    let active = true;

    async function load() {
      setLoading(true);
      try {
        const rows = await getProjects({ inmobiliariaId: selectedInmobiliaria });
        if (active) setProjects(rows);
      } catch (err) {
        if (active) setFeedback({ type: "error", text: err.message || "No se pudieron cargar los proyectos." });
      } finally {
        if (active) setLoading(false);
      }
    }

    load();
    return () => {
      active = false;
    };
  }, [selectedInmobiliaria]);

  useEffect(() => {
    if (!selectedInmobiliaria) return;
    let active = true;

    async function loadRoster() {
      setRosterLoading(true);
      try {
        const rows = await getExecutives({ inmobiliariaId: selectedInmobiliaria });
        if (active) setExecutiveRoster(rows);
      } catch (err) {
        if (active) setFeedback({ type: "error", text: err.message || "No se pudieron cargar los ejecutivos." });
      } finally {
        if (active) setRosterLoading(false);
      }
    }

    loadRoster();
    return () => {
      active = false;
    };
  }, [selectedInmobiliaria]);

  const comunasDisponibles = useMemo(() => {
    const set = new Set(projects.map((project) => project.comuna).filter(Boolean));
    return [...set].sort((a, b) => a.localeCompare(b, "es"));
  }, [projects]);

  const hasActiveFilters = search !== "" || filterEstado !== "todos" || filterComuna !== "todas";

  const clearFilters = () => {
    setSearch("");
    setFilterEstado("todos");
    setFilterComuna("todas");
  };

  const filtered = useMemo(() => {
    const searchLower = search.trim().toLowerCase();
    return projects.filter((project) => {
      if (filterEstado !== "todos" && project.estado !== filterEstado) return false;
      if (filterComuna !== "todas" && project.comuna !== filterComuna) return false;
      if (searchLower && !project.nombre.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [projects, search, filterEstado, filterComuna]);

  const sortedProjects = useMemo(() => {
    const valueFor = (project) => {
      if (projectSort.field === "inmobiliaria") return project.inmobiliaria_nombre || "";
      if (projectSort.field === "precio") return Number(project.precio_min_uf) || 0;
      if (projectSort.field === "tipo") return tipoProyectoLabels[project.tipo] || project.tipo || "";
      if (projectSort.field === "estado") return estadoProyectoLabels[project.estado] || project.estado || "";
      return project[projectSort.field] || "";
    };

    return [...filtered].sort((left, right) => {
      const leftValue = valueFor(left);
      const rightValue = valueFor(right);
      const comparison = typeof leftValue === "number"
        ? leftValue - rightValue
        : String(leftValue).localeCompare(String(rightValue), "es", { sensitivity: "base" });
      return projectSort.direction === "asc" ? comparison : -comparison;
    });
  }, [filtered, projectSort]);

  const toggleProjectSort = (field) => {
    setProjectSort((current) => ({
      field,
      direction: current.field === field && current.direction === "asc" ? "desc" : "asc",
    }));
  };

  const sortIndicator = (field) => projectSort.field === field
    ? projectSort.direction === "asc" ? "Ascendente" : "Descendente"
    : "Ordenar";

  const refresh = async () => {
    const rows = await getProjects({ inmobiliariaId: selectedInmobiliaria });
    setProjects(rows);
  };

  const openCreateModal = () => {
    setModalError("");
    setProjectSubmitAttempted(false);
    setExecutives([]);
    setAssignEmail("");
    setForm({
      ...emptyForm,
      inmobiliaria_id: isGlobalAdmin
        ? selectedInmobiliaria === "all"
          ? ""
          : selectedInmobiliaria
        : tenant?.inmobiliaria_id || "",
    });
    setModal({ mode: "create", project: null });
  };

  const openEditModal = (project) => {
    setModalError("");
    setProjectSubmitAttempted(false);
    setExecutives(project.ejecutivos || []);
    setAssignEmail("");
    setForm({
      nombre: project.nombre,
      inmobiliaria_id: project.inmobiliaria_id,
      comuna: project.comuna,
      tipo: project.tipo,
      estado: project.estado,
      precio_min_uf: String(project.precio_min_uf),
      precio_max_uf: String(project.precio_max_uf),
      descripcion: project.descripcion || "",
      entrega_estimada: project.entrega_estimada || "",
    });
    setModal({ mode: "edit", project });
  };

  const closeModal = () => {
    if (saving || assigning) return;
    setModal(null);
    setModalError("");
    setProjectSubmitAttempted(false);
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const { ok: formValid, errors: formErrors } = validateProject(form);

  const handleSave = async () => {
    setProjectSubmitAttempted(true);
    if (!formValid) return;
    setSaving(true);
    setModalError("");
    setFeedback(null);
    try {
      if (modal.mode === "create") {
        const created = await createProject(form);
        setProjects((prev) =>
          [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
        );
        setFeedback({ type: "success", text: `Proyecto «${created.nombre}» creado.` });
      } else {
        const updated = await updateProject(modal.project.id, form);
        setProjects((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setFeedback({ type: "success", text: `Proyecto «${updated.nombre}» actualizado.` });
      }
      setModal(null);
      await refresh();
    } catch (err) {
      setModalError(err.message || "No se pudo guardar el proyecto.");
    } finally {
      setSaving(false);
    }
  };

  const handleAssignExecutive = async () => {
    if (!assignEmail.trim() || !modal?.project) return;
    setAssigning(true);
    setModalError("");
    try {
      const rows = await assignExecutive(modal.project.id, assignEmail);
      setExecutives(rows);
      setAssignEmail("");
      setProjects((prev) =>
        prev.map((item) => (item.id === modal.project.id ? { ...item, ejecutivos: rows } : item)),
      );
    } catch (err) {
      setModalError(err.message || "No se pudo asignar el ejecutivo.");
    } finally {
      setAssigning(false);
    }
  };

  const handleUnassignExecutive = async (email) => {
    if (!modal?.project) return;
    setAssigning(true);
    setModalError("");
    try {
      const rows = await unassignExecutive(modal.project.id, email);
      setExecutives(rows);
      setProjects((prev) =>
        prev.map((item) => (item.id === modal.project.id ? { ...item, ejecutivos: rows } : item)),
      );
    } catch (err) {
      setModalError(err.message || "No se pudo quitar el ejecutivo.");
    } finally {
      setAssigning(false);
    }
  };

  const handleStatusQuickAction = async (project) => {
    const nextEstado = project.estado === "agotado" ? "disponible" : "agotado";
    setFeedback(null);
    setProjects((prev) =>
      prev.map((item) => (item.id === project.id ? { ...item, estado: nextEstado } : item)),
    );
    try {
      const updated = await setProjectStatus(project.id, nextEstado);
      setProjects((prev) => prev.map((item) => (item.id === project.id ? updated : item)));
      setFeedback({
        type: "success",
        text:
          nextEstado === "agotado"
            ? `«${project.nombre}» quedó agotado y sale de las recomendaciones.`
            : `«${project.nombre}» está disponible nuevamente.`,
      });
    } catch (err) {
      setProjects((prev) =>
        prev.map((item) => (item.id === project.id ? { ...item, estado: project.estado } : item)),
      );
      setFeedback({ type: "error", text: err.message || "No se pudo actualizar el estado." });
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    setFeedback(null);
    try {
      await deleteProject(confirmDelete.id);
      setProjects((prev) => prev.filter((item) => item.id !== confirmDelete.id));
      setFeedback({ type: "success", text: `Proyecto «${confirmDelete.nombre}» eliminado.` });
      setConfirmDelete(null);
      await refresh();
    } catch (err) {
      setFeedback({ type: "error", text: err.message || "No se pudo eliminar el proyecto." });
      setConfirmDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateInmobiliaria = async () => {
    setCreatingInmobiliaria(true);
    setFeedback(null);
    try {
      const created = await createInmobiliaria(inmobiliariaNombre);
      setInmobiliarias((prev) =>
        [...prev, created].sort((a, b) => a.nombre.localeCompare(b.nombre, "es")),
      );
      setFeedback({ type: "success", text: `Inmobiliaria «${created.nombre}» creada.` });
      setInmobiliariaNombre("");
      setInmobiliariaModal(false);
    } catch (err) {
      setFeedback({ type: "error", text: err.message || "No se pudo crear la inmobiliaria." });
    } finally {
      setCreatingInmobiliaria(false);
    }
  };

  const openExecutiveModal = () => {
    setExecutiveModalError("");
    setExecutiveSubmitAttempted(false);
    setNewExecutiveCredentials(null);
    setExecutiveForm({
      ...emptyExecutiveForm,
      inmobiliaria_id: isGlobalAdmin
        ? selectedInmobiliaria === "all"
          ? ""
          : selectedInmobiliaria
        : tenant?.inmobiliaria_id || "",
    });
    setExecutiveModal(true);
  };

  const { ok: executiveFormValid, errors: executiveFormErrors } = validateExecutive(executiveForm);

  const handleCreateExecutive = async () => {
    setExecutiveSubmitAttempted(true);
    if (!executiveFormValid) return;
    setCreatingExecutive(true);
    setExecutiveModalError("");
    setFeedback(null);
    try {
      const result = await createExecutive(executiveForm);
      const rows = await getExecutives({ inmobiliariaId: selectedInmobiliaria });
      setExecutiveRoster(rows);

      if (result?.password_temporal) {
        // Modo de prueba: se muestra una sola vez para poder entrar sin correo.
        setNewExecutiveCredentials({
          email: result.ejecutivo?.email || executiveForm.email,
          password: result.password_temporal,
        });
      } else {
        setExecutiveModal(false);
      }

      setFeedback({
        type: "success",
        text:
          result?.created === false
            ? result.mensaje || "La cuenta ya existía: quedó vinculada como ejecutivo."
            : result?.email_enviado
              ? `Ejecutivo creado. Se envió el enlace de acceso a ${result.ejecutivo?.email}.`
              : "Ejecutivo creado. No se pudo enviar el correo de acceso.",
      });
      // Un ejecutivo nuevo puede resolver asignaciones pendientes por correo.
      await refresh();
    } catch (err) {
      setExecutiveModalError(err.message || "No se pudo crear el ejecutivo.");
    } finally {
      setCreatingExecutive(false);
    }
  };

  const handleAssignAdmin = async () => {
    setAssigningAdmin(true);
    setFeedback(null);
    try {
      await assignAdmin(adminInmobiliaria, adminEmail);
      setFeedback({ type: "success", text: `${adminEmail} quedó como administrador de la inmobiliaria.` });
      setAdminEmail("");
      setAdminInmobiliaria("");
      setAdminModal(false);
    } catch (err) {
      setFeedback({ type: "error", text: err.message || "No se pudo asignar el administrador." });
    } finally {
      setAssigningAdmin(false);
    }
  };

  const columnCount = isGlobalAdmin ? 8 : 7;
  const selectedInmobiliariaLabel = isGlobalAdmin
    ? selectedInmobiliaria === "all"
      ? "Todas las inmobiliarias"
      : inmobiliarias.find((item) => item.id === selectedInmobiliaria)?.nombre || "Inmobiliaria seleccionada"
    : tenant?.inmobiliaria_nombre || "Inmobiliaria activa";

  const projectStats = useMemo(() => {
    return projects.reduce(
      (acc, project) => {
        acc.total += 1;
        if (project.estado === "disponible") acc.disponibles += 1;
        if (project.estado === "en_construccion") acc.construccion += 1;
        if (project.estado === "agotado") acc.agotados += 1;
        if ((project.ejecutivos || []).some((item) => item.estado === "vinculado")) acc.conCobertura += 1;
        return acc;
      },
      { total: 0, disponibles: 0, construccion: 0, agotados: 0, conCobertura: 0 }
    );
  }, [projects]);

  const executiveStats = useMemo(() => {
    return executiveRoster.reduce(
      (acc, executive) => {
        acc.total += 1;
        if (executive.proyectos_asignados > 0) acc.asignados += 1;
        if (executive.proyectos_asignados === 0) acc.sinAsignacion += 1;
        return acc;
      },
      { total: 0, asignados: 0, sinAsignacion: 0 }
    );
  }, [executiveRoster]);

  const visibleProjectInsights = useMemo(() => {
    return filtered.map((project) => ({
      project,
      coverage: countExecutives(project),
    }));
  }, [filtered]);

  const visibleStats = useMemo(() => {
    return visibleProjectInsights.reduce(
      (acc, item) => {
        acc.total += 1;
        if (item.project.estado === "disponible") acc.disponibles += 1;
        if (item.project.estado === "en_construccion") acc.construccion += 1;
        if (item.coverage.vinculados === 0) acc.sinCobertura += 1;
        if (item.coverage.pendientes > 0) acc.pendientes += 1;
        return acc;
      },
      { total: 0, disponibles: 0, construccion: 0, sinCobertura: 0, pendientes: 0 }
    );
  }, [visibleProjectInsights]);

  const highlightedProjects = visibleProjectInsights;

  const upcomingDelivery = useMemo(() => {
    return visibleProjectInsights
      .map((item) => item.project)
      .filter((project) => project.entrega_estimada)
      .sort((a, b) => a.entrega_estimada.localeCompare(b.entrega_estimada))[0] || null;
  }, [visibleProjectInsights]);

  return (
    <section className="section-block admin-catalog admin-catalog-page">
      <div className="section-heading">
        <span className="eyebrow">Administración</span>
        <h1>Catálogo de proyectos</h1>
        <p>
          Registra y mantiene los proyectos disponibles y los ejecutivos vinculados a cada uno.
        </p>
      </div>

      {feedback && (
        <div className={feedback.type === "success" ? "success-message" : "error-message"}>
          {feedback.text}
        </div>
      )}

      <section className="admin-catalog-topbar admin-section-gap">
        <div className="admin-catalog-topbar__intro">
          <span className="admin-tag">{isGlobalAdmin ? "Mesa global" : "Mesa inmobiliaria"}</span>
          <h2>Proyectos, cobertura y equipo comercial.</h2>
          <p>{`${visibleStats.total} visibles · ${projectStats.total} registrados · ${executiveStats.total} ejecutivos`}</p>
        </div>

        <dl className="admin-catalog-context-strip">
          <div className="admin-catalog-context-strip__item">
            <dt>Cobertura</dt>
            <dd>{selectedInmobiliariaLabel}</dd>
          </div>
          <div className="admin-catalog-context-strip__item">
            <dt>Próxima entrega</dt>
            <dd>{upcomingDelivery ? formatDeliveryMonth(upcomingDelivery.entrega_estimada) : "Sin fechas visibles"}</dd>
          </div>
          <div className="admin-catalog-context-strip__item">
            <dt>Proyectos sin cobertura</dt>
            <dd>{visibleStats.sinCobertura}</dd>
          </div>
        </dl>
      </section>

      <section className="admin-catalog-metric-strip admin-section-gap" aria-label="Pulso del catálogo">
        <article className="admin-panel-metric">
          <span>Visibles</span>
          <strong>{visibleStats.total}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>Disponibles</span>
          <strong>{visibleStats.disponibles}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>En construcción</span>
          <strong>{visibleStats.construccion}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>Sin cobertura</span>
          <strong>{visibleStats.sinCobertura}</strong>
        </article>
        <article className="admin-panel-metric">
          <span>Ejecutivos asignados</span>
          <strong>{executiveStats.asignados}</strong>
        </article>
      </section>

      <div className="admin-catalog-board admin-section-gap">
        <article className="admin-surface admin-catalog-radar">
          <div className="admin-surface__header">
            <div className="admin-surface__title">
              <h2>Radar del catálogo</h2>
              <p>{`${highlightedProjects.length} proyectos en la lista actual`}</p>
            </div>
            <span className="admin-tag admin-tag--soft">
              {hasActiveFilters ? `${filtered.length} resultados` : `${projects.length} en cobertura`}
            </span>
          </div>

          {!highlightedProjects.length ? (
            <div className="admin-compact-empty">
              <strong>No hay proyectos en esta vista.</strong>
              <p>Sin resultados para la cobertura actual.</p>
            </div>
          ) : (
            <div className="admin-scroll-panel admin-scroll-panel--radar">
              <div className="admin-project-highlight-list admin-project-highlight-list--scroll">
                {highlightedProjects.map(({ project, coverage }) => (
                  <article className="admin-project-highlight" key={project.id}>
                    <div className="admin-project-highlight__main">
                      <div>
                        <strong>{project.nombre}</strong>
                        <p>{project.descripcion || "Sin descripción comercial visible todavía."}</p>
                      </div>
                      <span className={`status-pill ${estadoProyectoPillClass[project.estado] || ""}`}>
                        {estadoProyectoLabels[project.estado] || project.estado}
                      </span>
                    </div>

                    <div className="admin-project-highlight__meta">
                      <span>{project.comuna}</span>
                      <span>{tipoProyectoLabels[project.tipo] || project.tipo}</span>
                      <span>{formatUfRange(project)}</span>
                      <span>{formatDeliveryMonth(project.entrega_estimada)}</span>
                    </div>

                    <div className="admin-project-highlight__foot">
                      <span>{coverage.vinculados} ejecutivos vinculados</span>
                      <span>{coverage.pendientes > 0 ? `${coverage.pendientes} pendientes` : "Sin pendientes"}</span>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          )}
        </article>

        <aside className="admin-catalog-side-stack">
          <article className="admin-surface admin-surface--soft">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Controles del catálogo</h2>
                <p>{isGlobalAdmin ? "Cobertura y altas" : "Altas del catálogo"}</p>
              </div>
            </div>

            <div className="admin-control-stack">
              {isGlobalAdmin ? (
                <div className="field-wrap">
                  <div className="field-label-row">
                    <label htmlFor="admin-project-catalog-scope">Inmobiliaria</label>
                  </div>
                  <select
                    id="admin-project-catalog-scope"
                    value={selectedInmobiliaria}
                    onChange={(event) => setSelectedInmobiliaria(event.target.value)}
                  >
                    <option value="all">Todas las inmobiliarias</option>
                    {inmobiliarias.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.nombre}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="admin-compact-note">
                  <strong>Inmobiliaria activa</strong>
                  <p>{selectedInmobiliariaLabel}</p>
                </div>
              )}

              <div className="admin-control-grid">
                <button type="button" onClick={openCreateModal} disabled={!tenant}>
                  Nuevo proyecto
                </button>
                <button type="button" className="secondary-button" onClick={openExecutiveModal} disabled={!tenant}>
                  Nuevo ejecutivo
                </button>
                {isGlobalAdmin && (
                  <button type="button" className="secondary-button" onClick={() => setInmobiliariaModal(true)}>
                    Nueva inmobiliaria
                  </button>
                )}
                {isGlobalAdmin && (
                  <button type="button" className="secondary-button" onClick={() => setAdminModal(true)}>
                    Asignar administrador
                  </button>
                )}
              </div>
            </div>
          </article>

          <article className="admin-surface">
            <div className="admin-surface__header">
              <div className="admin-surface__title">
                <h2>Cobertura comercial</h2>
                <p>{`${projectStats.conCobertura} con cobertura · ${visibleStats.pendientes} pendientes`}</p>
              </div>
            </div>

            <div className="admin-distribution-list">
              <div className="admin-distribution-row">
                <div className="admin-distribution-row__head">
                  <strong>Con cobertura</strong>
                  <span>{projectStats.conCobertura}</span>
                </div>
                <small>Proyectos con al menos un ejecutivo vinculado.</small>
              </div>
              <div className="admin-distribution-row">
                <div className="admin-distribution-row__head">
                  <strong>Asignaciones pendientes</strong>
                  <span>{visibleStats.pendientes}</span>
                </div>
                <small>Correos cargados que aún no quedan vinculados formalmente.</small>
              </div>
              <div className="admin-distribution-row">
                <div className="admin-distribution-row__head">
                  <strong>Sin asignación</strong>
                  <span>{executiveStats.sinAsignacion}</span>
                </div>
                <small>Ejecutivos disponibles que todavía no toman proyectos.</small>
              </div>
            </div>
          </article>
        </aside>
      </div>

      <div className="admin-surface admin-section-gap admin-projects-table-surface">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Mesa de proyectos</h2>
            <p>
              {filtered.length === projects.length
                ? `${projects.length} proyectos visibles en esta cobertura.`
                : `${filtered.length} de ${projects.length} proyectos coinciden con la búsqueda.`}
            </p>
          </div>
          <div className="admin-surface__actions">
            {hasActiveFilters && (
              <button type="button" className="secondary-button compact-button" onClick={clearFilters}>
                Limpiar filtros
              </button>
            )}
          </div>
        </div>

        <div className="toolbar-filters admin-toolbar-filters admin-projects-toolbar">
          <label style={{ flexBasis: "100%" }}>
            Buscar por nombre
            <input
              type="text"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Ej: Parque Ñuñoa"
              style={{ marginTop: "0.5rem" }}
            />
          </label>

          <label>
            Estado
            <select value={filterEstado} onChange={(event) => setFilterEstado(event.target.value)}>
              <option value="todos">Todos</option>
              <option value="disponible">Disponible</option>
              <option value="en_construccion">En construcción</option>
              <option value="agotado">Agotado</option>
            </select>
          </label>

          <label>
            Comuna
            <select value={filterComuna} onChange={(event) => setFilterComuna(event.target.value)}>
              <option value="todas">Todas las comunas</option>
              {comunasDisponibles.map((comuna) => (
                <option key={comuna} value={comuna}>
                  {comuna}
                </option>
              ))}
            </select>
          </label>
        </div>

        {loading ? (
          <div className="admin-table-loading">
            <span className="admin-skeleton-line full"></span>
            <span className="admin-skeleton-line full"></span>
            <span className="admin-skeleton-line medium"></span>
          </div>
        ) : (
          <div className="table-wrap admin-table-scroll admin-table-scroll--projects">
            <table className="admin-project-table">
              <thead>
                <tr>
                   {isGlobalAdmin && <th aria-sort={projectSort.field === "inmobiliaria" ? projectSort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="admin-sort-button" onClick={() => toggleProjectSort("inmobiliaria")}>Inmobiliaria <span aria-hidden="true">{sortIndicator("inmobiliaria") === "Ascendente" ? "↑" : sortIndicator("inmobiliaria") === "Descendente" ? "↓" : "↕"}</span></button></th>}
                   <th>Nombre</th>
                   <th aria-sort={projectSort.field === "comuna" ? projectSort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="admin-sort-button" onClick={() => toggleProjectSort("comuna")}>Comuna <span aria-hidden="true">{sortIndicator("comuna") === "Ascendente" ? "↑" : sortIndicator("comuna") === "Descendente" ? "↓" : "↕"}</span></button></th>
                   <th aria-sort={projectSort.field === "tipo" ? projectSort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="admin-sort-button" onClick={() => toggleProjectSort("tipo")}>Tipo <span aria-hidden="true">{sortIndicator("tipo") === "Ascendente" ? "↑" : sortIndicator("tipo") === "Descendente" ? "↓" : "↕"}</span></button></th>
                   <th aria-sort={projectSort.field === "precio" ? projectSort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="admin-sort-button" onClick={() => toggleProjectSort("precio")}>Rango UF <span aria-hidden="true">{sortIndicator("precio") === "Ascendente" ? "↑" : sortIndicator("precio") === "Descendente" ? "↓" : "↕"}</span></button></th>
                   <th aria-sort={projectSort.field === "estado" ? projectSort.direction === "asc" ? "ascending" : "descending" : "none"}><button type="button" className="admin-sort-button" onClick={() => toggleProjectSort("estado")}>Estado <span aria-hidden="true">{sortIndicator("estado") === "Ascendente" ? "↑" : sortIndicator("estado") === "Descendente" ? "↓" : "↕"}</span></button></th>
                  <th>Ejecutivos</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                 {sortedProjects.map((project) => {
                  const { total, vinculados, pendientes } = countExecutives(project);
                  return (
                    <tr key={project.id} className="admin-project-table__row">
                      {isGlobalAdmin && <td>{project.inmobiliaria_nombre || "-"}</td>}
                      <td className="admin-project-table__name">{project.nombre}</td>
                      <td>{project.comuna}</td>
                      <td>{tipoProyectoLabels[project.tipo] || project.tipo}</td>
                      <td>{formatUfRange(project)}</td>
                      <td>
                        <span className={`status-pill ${estadoProyectoPillClass[project.estado] || ""}`}>
                          {estadoProyectoLabels[project.estado] || project.estado}
                        </span>
                      </td>
                      <td>
                        {vinculados}
                        {pendientes > 0 ? ` · ${pendientes} pend.` : ""}
                      </td>
                      <td className="admin-project-table__actions-cell">
                        <div className="admin-row-actions admin-project-table__actions">
                          <button
                            type="button"
                            className="secondary-button compact-button admin-project-action-button"
                            onClick={() => openEditModal(project)}
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            className="secondary-button compact-button admin-project-action-button"
                            onClick={() => handleStatusQuickAction(project)}
                          >
                            {project.estado === "agotado" ? "Reactivar" : "Agotar"}
                          </button>
                          {total === 0 ? (
                            <button
                              type="button"
                              className="secondary-button compact-button admin-project-action-button danger-button"
                              onClick={() => setConfirmDelete(project)}
                            >
                              Eliminar
                            </button>
                          ) : (
                            <span className="admin-project-action-note">
                              {`${total} asignado${total > 1 ? "s" : ""}`}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!filtered.length && (
                  <tr>
                    <td colSpan={columnCount}>
                      {hasActiveFilters ? (
                        "No hay proyectos que coincidan con los filtros aplicados."
                      ) : (
                        <div className="empty-state">
                          <strong>Aún no hay proyectos</strong>
                          <p>Empieza registrando el primer proyecto para activar el catálogo.</p>
                          <button type="button" onClick={openCreateModal}>
                            Crear primer proyecto
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="admin-surface admin-projects-team-surface">
        <div className="admin-surface__header">
          <div className="admin-surface__title">
            <h2>Equipo comercial</h2>
            <p>{`${executiveStats.total} ejecutivos cargados`}</p>
          </div>
          <div className="admin-surface__actions">
            <button type="button" onClick={openExecutiveModal} disabled={!tenant}>
              Nuevo ejecutivo
            </button>
          </div>
        </div>

        <div className="admin-inline-summary">
          <span className="admin-tag admin-tag--soft">Asignados: {executiveStats.asignados}</span>
          <span className="admin-tag admin-tag--soft">Sin asignación: {executiveStats.sinAsignacion}</span>
          <span className="admin-tag admin-tag--soft">Total: {executiveStats.total}</span>
        </div>

        {rosterLoading ? (
          <div className="admin-table-loading">
            <span className="admin-skeleton-line full"></span>
            <span className="admin-skeleton-line full"></span>
            <span className="admin-skeleton-line medium"></span>
          </div>
        ) : (
          <div className="table-wrap admin-table-scroll admin-table-scroll--team">
            <table className="admin-team-table">
              <thead>
                <tr>
                  {isGlobalAdmin && <th>Inmobiliaria</th>}
                  <th>Nombre</th>
                  <th>Correo</th>
                  <th>Proyectos asignados</th>
                </tr>
              </thead>
              <tbody>
                {executiveRoster.map((executive) => (
                  <tr key={executive.id}>
                    {isGlobalAdmin && <td>{executive.inmobiliaria_nombre || "-"}</td>}
                    <td>{executive.full_name || "-"}</td>
                    <td>{executive.email}</td>
                    <td>{executive.proyectos_asignados}</td>
                  </tr>
                ))}
                {!executiveRoster.length && (
                  <tr>
                    <td colSpan={isGlobalAdmin ? 4 : 3}>
                      <div className="empty-state">
                        <strong>Aún no hay ejecutivos</strong>
                        <p>Cuando crees cuentas comerciales aparecerán aquí con su carga de proyectos.</p>
                        <button type="button" onClick={openExecutiveModal} disabled={!tenant}>
                          Crear primer ejecutivo
                        </button>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Popup: Nuevo ejecutivo ───────────────────────────────────── */}
      {executiveModal && (
        <div
          className="admin-modal"
          onClick={() => {
            if (!creatingExecutive) setExecutiveModal(false);
          }}
        >
          <div className="admin-modal-card admin-modal-card--md admin-executive-modal" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <h2>Nuevo ejecutivo</h2>
                <p>Crea la cuenta comercial y su acceso al panel.</p>
              </div>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => setExecutiveModal(false)}
                disabled={creatingExecutive}
              >
                Cerrar
              </button>
            </div>

            <div className="admin-modal-body">
              {executiveModalError && <div className="error-message">{executiveModalError}</div>}

              {newExecutiveCredentials ? (
                <>
                  <div className="success-message">Cuenta creada para {newExecutiveCredentials.email}.</div>

                  <div className="admin-panel-card admin-panel-card--success">
                    <div className="admin-panel-card__header">
                      <h3>Contraseña de prueba</h3>
                    </div>
                    <dl className="admin-definition-list">
                      <div className="admin-definition-row">
                        <dt>Correo</dt>
                        <dd>{newExecutiveCredentials.email}</dd>
                      </div>
                      <div className="admin-definition-row">
                        <dt>Contraseña</dt>
                        <dd>{newExecutiveCredentials.password}</dd>
                      </div>
                    </dl>
                    <p className="field-warning admin-modal-credentials-warning">
                      Modo de prueba activo: la contraseña es el texto antes del @ del correo. Anótala
                      ahora, no se vuelve a mostrar.
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <div className="admin-panel-card admin-panel-card--soft">
                    <div className="admin-panel-card__header">
                      <h3>Datos de la cuenta</h3>
                    </div>

                    <div className={`form-grid admin-executive-form ${isGlobalAdmin ? "" : "is-tenant-scoped"}`}>
                      <div className="field-wrap admin-executive-form__name">
                        <div className="field-label-row">
                          <label>Nombre completo</label>
                        </div>
                        <input
                          type="text"
                          value={executiveForm.full_name}
                          onChange={(event) =>
                            setExecutiveForm((prev) => ({ ...prev, full_name: event.target.value }))
                          }
                          placeholder="Ej: Ana Soto"
                        />
                        {executiveSubmitAttempted && executiveFormErrors.full_name && (
                          <span className="field-warning">{executiveFormErrors.full_name}</span>
                        )}
                      </div>

                      <div className="field-wrap admin-executive-form__email">
                        <div className="field-label-row">
                          <label>Correo</label>
                          <FieldTooltip text="Se usará como usuario. Si el correo ya tiene cuenta, se vincula como ejecutivo en vez de crear una nueva." />
                        </div>
                        <input
                          type="email"
                          value={executiveForm.email}
                          onChange={(event) =>
                            setExecutiveForm((prev) => ({ ...prev, email: event.target.value }))
                          }
                          placeholder="correo@inmobiliaria.cl"
                        />
                        {executiveSubmitAttempted && executiveFormErrors.email && (
                          <span className="field-warning">{executiveFormErrors.email}</span>
                        )}
                      </div>

                      <div className="field-wrap admin-executive-form__phone">
                        <div className="field-label-row">
                          <label>Teléfono (opcional)</label>
                        </div>
                        <input
                          type="tel"
                          value={executiveForm.phone}
                          onChange={(event) =>
                            setExecutiveForm((prev) => ({ ...prev, phone: event.target.value }))
                          }
                          placeholder="+56 9 1234 5678"
                        />
                      </div>

                      {isGlobalAdmin && (
                        <div className="field-wrap admin-executive-form__tenant">
                          <div className="field-label-row">
                            <label>Inmobiliaria</label>
                          </div>
                          <select
                            value={executiveForm.inmobiliaria_id}
                            onChange={(event) =>
                              setExecutiveForm((prev) => ({ ...prev, inmobiliaria_id: event.target.value }))
                            }
                          >
                            <option value="">Selecciona una inmobiliaria</option>
                            {inmobiliarias.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.nombre}
                              </option>
                            ))}
                          </select>
                          {executiveSubmitAttempted && executiveFormErrors.inmobiliaria_id && (
                            <span className="field-warning">{executiveFormErrors.inmobiliaria_id}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="admin-callout admin-callout--info">
                    <p>Se enviará un correo con un enlace para que el ejecutivo defina su contraseña.</p>
                  </div>
                </>
              )}
            </div>

            <div className="admin-modal-footer">
              {newExecutiveCredentials ? (
                <button type="button" onClick={() => setExecutiveModal(false)}>
                  Listo
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => setExecutiveModal(false)}
                    disabled={creatingExecutive}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    onClick={handleCreateExecutive}
                    disabled={creatingExecutive}
                  >
                    {creatingExecutive ? "Creando…" : "Crear ejecutivo"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Nuevo / editar proyecto ───────────────────────────── */}
      {modal && (
        <div className="admin-modal" onClick={closeModal}>
          <div className={`admin-modal-card admin-modal-card--lg admin-project-modal ${modal.mode === "create" ? "is-create" : "is-edit"}`} onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <h2>{modal.mode === "create" ? "Nuevo proyecto" : "Editar proyecto"}</h2>
                <p>
                  {modal.mode === "create"
                    ? "Registra un proyecto para el catálogo."
                    : `Actualiza los datos de «${modal.project?.nombre}».`}
                </p>
              </div>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={closeModal}
                disabled={saving || assigning}
              >
                Cerrar
              </button>
            </div>

            <div className="admin-modal-body">
              {modalError && <div className="error-message">{modalError}</div>}

              <div className="admin-panel-card admin-panel-card--soft">
                <div className="admin-panel-card__header">
                  <h3>Datos del proyecto</h3>
                </div>

                <div className={`form-grid admin-project-form ${isGlobalAdmin ? "" : "is-tenant-scoped"}`}>
                  <div className="field-wrap admin-project-form__name">
                    <div className="field-label-row">
                      <label>Nombre</label>
                    </div>
                    <input
                      type="text"
                      value={form.nombre}
                      onChange={(event) => updateField("nombre", event.target.value)}
                      placeholder="Ej: Parque Ñuñoa"
                    />
                    {projectSubmitAttempted && formErrors.nombre && <span className="field-warning">{formErrors.nombre}</span>}
                  </div>

                  {isGlobalAdmin && (
                    <div className="field-wrap admin-project-form__tenant">
                      <div className="field-label-row">
                        <label>Inmobiliaria</label>
                      </div>
                      <select
                        value={form.inmobiliaria_id}
                        onChange={(event) => updateField("inmobiliaria_id", event.target.value)}
                      >
                        <option value="">Selecciona una inmobiliaria</option>
                        {inmobiliarias.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.nombre}
                          </option>
                        ))}
                      </select>
                      {projectSubmitAttempted && formErrors.inmobiliaria_id && (
                        <span className="field-warning">{formErrors.inmobiliaria_id}</span>
                      )}
                    </div>
                  )}

                  <div className="field-wrap admin-project-form__commune">
                    <div className="field-label-row">
                      <label>Comuna</label>
                      <FieldTooltip text="Se compara con la comuna de interés declarada por el lead. Una diferencia reduce la afinidad, pero nunca descarta el match." />
                    </div>
                    <select
                      value={form.comuna}
                      onChange={(event) => updateField("comuna", event.target.value)}
                    >
                      <option value="">Selecciona una comuna</option>
                      {comunasMvp.map((comuna) => (
                        <option key={comuna} value={comuna}>
                          {comuna}
                        </option>
                      ))}
                    </select>
                    {projectSubmitAttempted && formErrors.comuna && <span className="field-warning">{formErrors.comuna}</span>}
                  </div>

                  <div className="field-wrap admin-project-form__type">
                    <div className="field-label-row">
                      <label>Tipo</label>
                    </div>
                    <select value={form.tipo} onChange={(event) => updateField("tipo", event.target.value)}>
                      {Object.entries(tipoProyectoLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {projectSubmitAttempted && formErrors.tipo && <span className="field-warning">{formErrors.tipo}</span>}
                  </div>

                  <div className="field-wrap admin-project-form__status">
                    <div className="field-label-row">
                      <label>Estado</label>
                      <FieldTooltip text="«Agotado» excluye el proyecto de las recomendaciones del matching." />
                    </div>
                    <select
                      value={form.estado}
                      onChange={(event) => updateField("estado", event.target.value)}
                    >
                      {Object.entries(estadoProyectoLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    {projectSubmitAttempted && formErrors.estado && <span className="field-warning">{formErrors.estado}</span>}
                  </div>

                  <div className="field-wrap admin-project-form__price">
                    <div className="field-label-row">
                      <label>Rango de precio (UF)</label>
                      <FieldTooltip text="Mínimo: precio de la unidad disponible más barata. Máximo: la más cara. El matching usa el mínimo para decidir si el lead alcanza el proyecto. Si el proyecto tiene un precio único, repite el mismo valor." />
                    </div>
                    <div className="admin-project-form__price-inputs">
                      <input
                        type="number"
                        min="0"
                        value={form.precio_min_uf}
                        onChange={(event) => updateField("precio_min_uf", event.target.value)}
                        placeholder="Mínimo"
                      />
                      <input
                        type="number"
                        min="0"
                        value={form.precio_max_uf}
                        onChange={(event) => updateField("precio_max_uf", event.target.value)}
                        placeholder="Máximo"
                      />
                      <span style={{ fontWeight: 700, color: "#526174" }}>UF</span>
                    </div>
                    {projectSubmitAttempted && formErrors.precio_min_uf && (
                      <span className="field-warning">{formErrors.precio_min_uf}</span>
                    )}
                    {projectSubmitAttempted && formErrors.precio_max_uf && (
                      <span className="field-warning">{formErrors.precio_max_uf}</span>
                    )}
                  </div>

                  <div className="field-wrap admin-project-form__delivery">
                    <div className="field-label-row">
                      <label>Entrega estimada</label>
                      <FieldTooltip text="Mes de entrega del proyecto. Se muestra al usuario en la simulación; no afecta el matching ni el score. Déjalo vacío si aún no está comprometido." />
                    </div>
                    <input
                      type="month"
                      value={form.entrega_estimada}
                      onChange={(event) => updateField("entrega_estimada", event.target.value)}
                    />
                    {projectSubmitAttempted && formErrors.entrega_estimada && (
                      <span className="field-warning">{formErrors.entrega_estimada}</span>
                    )}
                  </div>

                  <div className="field-wrap admin-project-form__description">
                    <div className="field-label-row">
                      <label>Descripción</label>
                      <FieldTooltip text="Texto de vitrina que el usuario ve junto al proyecto en la simulación. Opcional, máximo 500 caracteres." />
                    </div>
                    <textarea
                      rows={3}
                      maxLength={500}
                      value={form.descripcion}
                      onChange={(event) => updateField("descripcion", event.target.value)}
                      placeholder="Ej: Departamento cercano a servicios y conectividad."
                    />
                    {projectSubmitAttempted && formErrors.descripcion && (
                      <span className="field-warning">{formErrors.descripcion}</span>
                    )}
                  </div>
                </div>
              </div>

              <div className="admin-panel-card admin-project-modal__assignments">
                <div className="admin-panel-card__header">
                  <h3>Ejecutivos asignados</h3>
                  {modal.mode !== "edit" && (
                    <span className="admin-tag admin-tag--soft">Disponible tras guardar</span>
                  )}
                </div>

                {modal.mode === "edit" ? (
                  <>
                    <div className="exec-assign-row">
                      <input
                        type="email"
                        value={assignEmail}
                        onChange={(event) => setAssignEmail(event.target.value)}
                        placeholder="correo@inmobiliaria.cl"
                      />
                      <button
                        type="button"
                        className="secondary-button compact-button"
                        onClick={handleAssignExecutive}
                        disabled={assigning || !assignEmail.trim()}
                      >
                        {assigning ? "Asignando…" : "Asignar"}
                      </button>
                    </div>

                    {!executives.length ? (
                      <div className="admin-compact-empty">
                        <strong>Sin ejecutivos asignados</strong>
                        <p>Ingresa un correo para vincular al primer ejecutivo de este proyecto.</p>
                      </div>
                    ) : (
                      <ul className="admin-list admin-list--dense">
                        {executives.map((executive) => (
                          <li key={executive.email} className="admin-list-item admin-list-item--dense">
                            <div className="admin-list-item__main">
                              <strong>{executive.nombre || executive.email}</strong>
                              <span>{executive.email}</span>
                            </div>
                            <div className="admin-row-actions">
                              <span
                                className={`status-pill ${executive.estado === "vinculado" ? "alto" : "medio"}`}
                              >
                                {executive.estado === "vinculado" ? "Vinculado" : "Pendiente"}
                              </span>
                              <button
                                type="button"
                                className="secondary-button compact-button"
                                onClick={() => handleUnassignExecutive(executive.email)}
                                disabled={assigning}
                              >
                                Quitar
                              </button>
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}

                    {executives.some((executive) => executive.estado === "pendiente") && (
                      <p className="inline-note">Se vinculará cuando el ejecutivo cree su cuenta.</p>
                    )}
                  </>
                ) : (
                  <p className="inline-note">Guarda el proyecto para asignar ejecutivos.</p>
                )}
              </div>
            </div>

            <div className="admin-modal-footer">
              <button type="button" className="secondary-button" onClick={closeModal} disabled={saving}>
                Cancelar
              </button>
              <button type="button" onClick={handleSave} disabled={saving}>
                {saving ? "Guardando…" : "Guardar proyecto"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Confirmar eliminación ─────────────────────────────── */}
      {confirmDelete && (
        <div
          className="admin-modal"
          onClick={() => {
            if (!deleting) setConfirmDelete(null);
          }}
        >
          <div className="admin-modal-card admin-modal-card--sm" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <h2>Eliminar proyecto</h2>
              </div>
            </div>

            <div className="admin-modal-body">
              <div className="admin-callout admin-callout--danger">
                <strong>Esta acción no se puede deshacer</strong>
                <p>{`¿Eliminar el proyecto «${confirmDelete.nombre}»? Se perderá su información del catálogo.`}</p>
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button type="button" className="danger-button" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando…" : "Confirmar y eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Nueva inmobiliaria ────────────────────────────────── */}
      {inmobiliariaModal && (
        <div
          className="admin-modal"
          onClick={() => {
            if (!creatingInmobiliaria) setInmobiliariaModal(false);
          }}
        >
          <div className="admin-modal-card admin-modal-card--sm" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <h2>Nueva inmobiliaria</h2>
                <p>Crea un nuevo espacio para gestionar sus proyectos y ejecutivos.</p>
              </div>
            </div>

            <div className="admin-modal-body">
              <div className="field-wrap">
                <div className="field-label-row">
                  <label>Nombre</label>
                </div>
                <input
                  type="text"
                  value={inmobiliariaNombre}
                  onChange={(event) => setInmobiliariaNombre(event.target.value)}
                  placeholder="Ej: Inmobiliaria Andes"
                />
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setInmobiliariaModal(false)}
                disabled={creatingInmobiliaria}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleCreateInmobiliaria}
                disabled={creatingInmobiliaria || !inmobiliariaNombre.trim()}
              >
                {creatingInmobiliaria ? "Guardando…" : "Crear inmobiliaria"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Popup: Asignar administrador ─────────────────────────────── */}
      {adminModal && (
        <div
          className="admin-modal"
          onClick={() => {
            if (!assigningAdmin) setAdminModal(false);
          }}
        >
          <div className="admin-modal-card admin-modal-card--sm" onClick={(event) => event.stopPropagation()}>
            <div className="admin-modal-header">
              <div className="admin-modal-heading">
                <h2>Asignar administrador</h2>
                <p>Otorga el rol de administrador de una inmobiliaria a una cuenta existente.</p>
              </div>
            </div>

            <div className="admin-modal-body">
              <div className="field-wrap">
                <div className="field-label-row">
                  <label>Inmobiliaria</label>
                </div>
                <select
                  value={adminInmobiliaria}
                  onChange={(event) => setAdminInmobiliaria(event.target.value)}
                >
                  <option value="">Selecciona una inmobiliaria</option>
                  {inmobiliarias.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.nombre}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field-wrap">
                <div className="field-label-row">
                  <label>Correo de la cuenta</label>
                </div>
                <input
                  type="email"
                  value={adminEmail}
                  onChange={(event) => setAdminEmail(event.target.value)}
                  placeholder="admin@inmobiliaria.cl"
                />
              </div>
            </div>

            <div className="admin-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setAdminModal(false)}
                disabled={assigningAdmin}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleAssignAdmin}
                disabled={assigningAdmin || !adminInmobiliaria || !adminEmail.trim()}
              >
                {assigningAdmin ? "Asignando…" : "Asignar administrador"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
