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

const overlayStyle = {
  position: "fixed",
  inset: 0,
  background: "rgba(0,0,0,0.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

const cardStyle = {
  background: "var(--color-surface, #fff)",
  borderRadius: "14px",
  maxWidth: "640px",
  width: "90%",
  maxHeight: "90vh",
  overflowY: "auto",
  boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
};

const modalHeaderStyle = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: "1.5rem",
  borderBottom: "1px solid #eaeaea",
  paddingBottom: "1rem",
};

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

  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState("");
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

  const refresh = async () => {
    const rows = await getProjects({ inmobiliariaId: selectedInmobiliaria });
    setProjects(rows);
  };

  const openCreateModal = () => {
    setModalError("");
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
  };

  const updateField = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const { ok: formValid, errors: formErrors } = validateProject(form);

  const handleSave = async () => {
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

  return (
    <section className="section-block admin-catalog">
      <div className="section-heading">
        <span className="eyebrow">Administración</span>
        <h1>Catálogo de proyectos</h1>
        <p>
          Registra y mantiene los proyectos disponibles y los ejecutivos vinculados a cada uno.
        </p>
      </div>

      {tenant && !isGlobalAdmin && (
        <p className="inline-note">
          Inmobiliaria: <strong>{tenant.inmobiliaria_nombre || "Sin nombre"}</strong>
        </p>
      )}

      {isGlobalAdmin && (
        <div
          className="toolbar"
          style={{ maxWidth: "none", display: "flex", gap: "1rem", alignItems: "flex-end", flexWrap: "wrap" }}
        >
          <label style={{ display: "flex", flexDirection: "column", minWidth: "220px" }}>
            Inmobiliaria
            <select
              value={selectedInmobiliaria}
              onChange={(event) => setSelectedInmobiliaria(event.target.value)}
              style={{ marginTop: "0.5rem" }}
            >
              <option value="all">Todas las inmobiliarias</option>
              {inmobiliarias.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.nombre}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => setInmobiliariaModal(true)}
          >
            ＋ Nueva inmobiliaria
          </button>
          <button
            type="button"
            className="secondary-button compact-button"
            onClick={() => setAdminModal(true)}
          >
            Asignar administrador
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={feedback.type === "success" ? "success-message" : "error-message"}
          style={{ marginBottom: "0.75rem" }}
        >
          {feedback.text}
        </div>
      )}

      <div className="toolbar-filters">
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

        {hasActiveFilters && (
          <div style={{ display: "flex", alignItems: "flex-end" }}>
            <button type="button" className="secondary-button compact-button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          </div>
        )}
      </div>

      <p className="small-text">
        {filtered.length === projects.length
          ? `${projects.length} proyectos`
          : `${filtered.length} de ${projects.length} proyectos`}
      </p>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <button type="button" onClick={openCreateModal} disabled={!tenant}>
          Nuevo proyecto
        </button>
      </div>

      {loading ? (
        <p className="small-text">Cargando proyectos…</p>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                {isGlobalAdmin && <th>Inmobiliaria</th>}
                <th>Nombre</th>
                <th>Comuna</th>
                <th>Tipo</th>
                <th>Rango UF</th>
                <th>Estado</th>
                <th>Ejecutivos</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const { total, vinculados, pendientes } = countExecutives(project);
                return (
                  <tr key={project.id}>
                    {isGlobalAdmin && <td>{project.inmobiliaria_nombre || "-"}</td>}
                    <td>{project.nombre}</td>
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
                    <td>
                      <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => openEditModal(project)}
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={() => handleStatusQuickAction(project)}
                        >
                          {project.estado === "agotado" ? "Reactivar" : "Marcar agotado"}
                        </button>
                        {total === 0 ? (
                          <button
                            type="button"
                            className="secondary-button compact-button"
                            style={{ color: "#b42318", borderColor: "#b42318" }}
                            onClick={() => setConfirmDelete(project)}
                          >
                            Eliminar
                          </button>
                        ) : (
                          <span className="inline-note">
                            Retira este proyecto marcándolo como agotado.
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
                        <p style={{ margin: "0 0 0.75rem" }}>Aún no hay proyectos en este catálogo.</p>
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

      <div className="section-heading" style={{ marginTop: "2.5rem" }}>
        <span className="eyebrow">Equipo comercial</span>
        <h2>Ejecutivos</h2>
        <p>
          Crea las cuentas de los ejecutivos de la inmobiliaria y revisa a cuántos proyectos están
          asignados.
        </p>
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "12px" }}>
        <button type="button" onClick={openExecutiveModal} disabled={!tenant}>
          Nuevo ejecutivo
        </button>
      </div>

      {rosterLoading ? (
        <p className="small-text">Cargando ejecutivos…</p>
      ) : (
        <div className="table-wrap">
          <table>
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
                      <p style={{ margin: "0 0 0.75rem" }}>
                        Aún no hay ejecutivos en esta inmobiliaria.
                      </p>
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

      {executiveModal && (
        <div
          style={overlayStyle}
          onClick={() => {
            if (!creatingExecutive) setExecutiveModal(false);
          }}
        >
          <div className="modal-card" style={{ ...cardStyle, maxWidth: "520px" }} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0 }}>Nuevo ejecutivo</h2>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={() => setExecutiveModal(false)}
                disabled={creatingExecutive}
              >
                Cerrar
              </button>
            </div>

            {executiveModalError && (
              <div className="error-message" style={{ marginBottom: "0.75rem" }}>
                {executiveModalError}
              </div>
            )}

            {newExecutiveCredentials ? (
              <>
                <div className="success-message" style={{ marginBottom: "1rem" }}>
                  Cuenta creada para {newExecutiveCredentials.email}.
                </div>
                <div className="field-wrap" style={{ marginBottom: "1rem" }}>
                  <div className="field-label-row">
                    <label>Contraseña de prueba</label>
                  </div>
                  <input type="text" value={newExecutiveCredentials.password} readOnly />
                  <span className="field-warning">
                    Modo de prueba activo: la contraseña es el texto antes del @ del correo. Anótala
                    ahora, no se vuelve a mostrar.
                  </span>
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end" }}>
                  <button type="button" onClick={() => setExecutiveModal(false)}>
                    Listo
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="form-grid">
                  <div className="field-wrap">
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
                    {executiveFormErrors.full_name && (
                      <span className="field-warning">{executiveFormErrors.full_name}</span>
                    )}
                  </div>

                  <div className="field-wrap">
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
                    {executiveFormErrors.email && (
                      <span className="field-warning">{executiveFormErrors.email}</span>
                    )}
                  </div>

                  <div className="field-wrap">
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
                    <div className="field-wrap">
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
                      {executiveFormErrors.inmobiliaria_id && (
                        <span className="field-warning">{executiveFormErrors.inmobiliaria_id}</span>
                      )}
                    </div>
                  )}
                </div>

                <p className="inline-note" style={{ marginTop: "1rem" }}>
                  Se enviará un correo con un enlace para que el ejecutivo defina su contraseña.
                </p>

                <div className="form-actions" style={{ marginTop: "1.25rem", justifyContent: "flex-end" }}>
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
                    disabled={creatingExecutive || !executiveFormValid}
                  >
                    {creatingExecutive ? "Creando…" : "Crear ejecutivo"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {modal && (
        <div style={overlayStyle} onClick={closeModal}>
          <div className="modal-card" style={cardStyle} onClick={(event) => event.stopPropagation()}>
            <div style={modalHeaderStyle}>
              <h2 style={{ margin: 0 }}>
                {modal.mode === "create" ? "Nuevo proyecto" : "Editar proyecto"}
              </h2>
              <button
                type="button"
                className="secondary-button compact-button"
                onClick={closeModal}
                disabled={saving || assigning}
              >
                Cerrar
              </button>
            </div>

            {modalError && (
              <div className="error-message" style={{ marginBottom: "0.75rem" }}>
                {modalError}
              </div>
            )}

            <div className="form-grid">
              <div className="field-wrap">
                <div className="field-label-row">
                  <label>Nombre</label>
                </div>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(event) => updateField("nombre", event.target.value)}
                  placeholder="Ej: Parque Ñuñoa"
                />
                {formErrors.nombre && <span className="field-warning">{formErrors.nombre}</span>}
              </div>

              {isGlobalAdmin && (
                <div className="field-wrap">
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
                  {formErrors.inmobiliaria_id && (
                    <span className="field-warning">{formErrors.inmobiliaria_id}</span>
                  )}
                </div>
              )}

              <div className="field-wrap">
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
                {formErrors.comuna && <span className="field-warning">{formErrors.comuna}</span>}
              </div>

              <div className="field-wrap">
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
                {formErrors.tipo && <span className="field-warning">{formErrors.tipo}</span>}
              </div>

              <div className="field-wrap">
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
                {formErrors.estado && <span className="field-warning">{formErrors.estado}</span>}
              </div>

              <div className="field-wrap">
                <div className="field-label-row">
                  <label>Rango de precio (UF)</label>
                  <FieldTooltip text="Mínimo: precio de la unidad disponible más barata. Máximo: la más cara. El matching usa el mínimo para decidir si el lead alcanza el proyecto. Si el proyecto tiene un precio único, repite el mismo valor." />
                </div>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
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
                {formErrors.precio_min_uf && (
                  <span className="field-warning">{formErrors.precio_min_uf}</span>
                )}
                {formErrors.precio_max_uf && (
                  <span className="field-warning">{formErrors.precio_max_uf}</span>
                )}
              </div>

              <div className="field-wrap">
                <div className="field-label-row">
                  <label>Entrega estimada</label>
                  <FieldTooltip text="Mes de entrega del proyecto. Se muestra al usuario en la simulación; no afecta el matching ni el score. Déjalo vacío si aún no está comprometido." />
                </div>
                <input
                  type="month"
                  value={form.entrega_estimada}
                  onChange={(event) => updateField("entrega_estimada", event.target.value)}
                />
                {formErrors.entrega_estimada && (
                  <span className="field-warning">{formErrors.entrega_estimada}</span>
                )}
              </div>

              <div className="field-wrap">
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
                {formErrors.descripcion && (
                  <span className="field-warning">{formErrors.descripcion}</span>
                )}
              </div>
            </div>

            <div className="form-actions" style={{ marginTop: "1.25rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={closeModal}
                disabled={saving}
              >
                Cancelar
              </button>
              <button type="button" onClick={handleSave} disabled={saving || !formValid}>
                {saving ? "Guardando…" : "Guardar proyecto"}
              </button>
            </div>

            <hr style={{ margin: "1.5rem 0", border: "none", borderTop: "1px solid #eaeaea" }} />

            {modal.mode === "edit" ? (
              <section>
                <h3 style={{ margin: "0 0 0.75rem" }}>Ejecutivos asignados</h3>

                <div className="exec-assign-row" style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem" }}>
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
                  <div className="empty-state">Aún no hay ejecutivos asignados.</div>
                ) : (
                  <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: "0.5rem" }}>
                    {executives.map((executive) => (
                      <li
                        key={executive.email}
                        style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}
                      >
                        <span style={{ flex: 1 }}>{executive.nombre || executive.email}</span>
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
                      </li>
                    ))}
                  </ul>
                )}

                {executives.some((executive) => executive.estado === "pendiente") && (
                  <p className="inline-note">Se vinculará cuando el ejecutivo cree su cuenta.</p>
                )}
              </section>
            ) : (
              <p className="inline-note">Guarda el proyecto para asignar ejecutivos.</p>
            )}
          </div>
        </div>
      )}

      {confirmDelete && (
        <div
          style={overlayStyle}
          onClick={() => {
            if (!deleting) setConfirmDelete(null);
          }}
        >
          <div className="modal-card" style={{ ...cardStyle, maxWidth: "520px" }} onClick={(event) => event.stopPropagation()}>
            <h2 style={{ margin: "0 0 1rem" }}>Eliminar proyecto</h2>
            <p style={{ margin: "0 0 1.5rem" }}>
              ¿Eliminar el proyecto «{confirmDelete.nombre}»? Esta acción no se puede deshacer.
            </p>
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleting}
              >
                Cancelar
              </button>
              <button type="button" onClick={handleDelete} disabled={deleting}>
                {deleting ? "Eliminando…" : "Confirmar y eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {inmobiliariaModal && (
        <div
          style={overlayStyle}
          onClick={() => {
            if (!creatingInmobiliaria) setInmobiliariaModal(false);
          }}
        >
          <div className="modal-card" style={{ ...cardStyle, maxWidth: "440px" }} onClick={(event) => event.stopPropagation()}>
            <h2 style={{ margin: "0 0 1rem" }}>Nueva inmobiliaria</h2>
            <div className="field-wrap" style={{ marginBottom: "1.5rem" }}>
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
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
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

      {adminModal && (
        <div
          style={overlayStyle}
          onClick={() => {
            if (!assigningAdmin) setAdminModal(false);
          }}
        >
          <div className="modal-card" style={{ ...cardStyle, maxWidth: "440px" }} onClick={(event) => event.stopPropagation()}>
            <h2 style={{ margin: "0 0 1rem" }}>Asignar administrador</h2>
            <div className="field-wrap" style={{ marginBottom: "1rem" }}>
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
            <div className="field-wrap" style={{ marginBottom: "1.5rem" }}>
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
            <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
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
