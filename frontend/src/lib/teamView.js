// HU 28 — lo que /admin/equipo deriva de la lista de miembros. El backend decide; esto solo presenta.
export const ROLE_LABELS = {
  ejecutivo: "Ejecutivo",
  admin_inmobiliario: "Administrador inmobiliario",
  admin: "Administrador inmobiliario",
};

export const STATUS_LABELS = { activo: "Activo", invitado: "Invitado", desactivado: "Desactivado" };

export const LOCK_MESSAGES = {
  propio: "No puedes cambiar tu propia función ni desactivar tu acceso. Otro administrador debe hacerlo.",
  ultimo_administrador: "Es el único administrador activo de esta inmobiliaria. Asigna otro administrador antes de hacer este cambio.",
};

export const initials = (name) =>
  String(name || "").split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase();

const pad = (value) => String(value).padStart(2, "0");

export function formatDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()}`;
}

export function formatDateTime(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "";
  return `${formatDate(value)} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function statusCounts(members = []) {
  const count = (status) => members.filter((member) => member.estado === status).length;
  return { todos: members.length, activo: count("activo"), invitado: count("invitado"), desactivado: count("desactivado") };
}

export function filterMembers(members = [], filter = "todos", query = "") {
  const needle = query.trim().toLowerCase();
  return members.filter((member) =>
    (filter === "todos" || member.estado === filter)
    && (!needle || `${member.nombre || ""} ${member.email || ""}`.toLowerCase().includes(needle)));
}

// Proyectos que perderían a su único ejecutivo activo si esta persona se desactiva.
export function projectsLeftUncovered(member, members = []) {
  return (member?.proyectos || []).filter((project) => !members.some((other) =>
    other.id !== member.id && other.estado !== "desactivado"
    && (other.proyectos || []).some((assigned) => assigned.id === project.id)));
}

export function statusLine(member) {
  if (member.correo_fallido && member.estado === "invitado") return "La invitación no llegó a enviarse.";
  if (member.estado === "invitado") {
    return `Invitación enviada el ${formatDate(member.invitado_en)}. Aún no define su contraseña.`;
  }
  if (member.estado === "desactivado") return "No puede entrar a RutaHogar. Su historial se conserva.";
  return member.ultimo_ingreso ? `Último ingreso: ${formatDateTime(member.ultimo_ingreso)}.` : "";
}

export function inviteToast({ nombre, email, data }) {
  if (data?.vinculado) {
    return data.email_enviado
      ? `${nombre} ya tenía cuenta: se sumó al equipo y le avisamos por correo.`
      : `${nombre} ya tenía cuenta y se sumó al equipo, pero no pudimos avisarle por correo.`;
  }
  return data?.email_enviado
    ? `Invitación enviada a ${email}.`
    : `La cuenta se creó, pero no pudimos enviar el correo a ${email}.`;
}

export function historyIcon(entry) {
  const icons = {
    // index.html carga una versión de Tabler sin building-plus ni building-minus.
    "equipo.proyecto_asignado": "circle-plus",
    "equipo.proyecto_retirado": "circle-minus",
    "equipo.invitacion_fallida": "mail-off",
    "equipo.datos_actualizados": "pencil",
    "equipo.acceso_desactivado": "user-off",
    "equipo.acceso_reactivado": "user-check",
  };
  if (entry.event_type === "equipo.rol_cambiado") {
    return entry.rol_nuevo === "ejecutivo" ? "shield-down" : "shield-up";
  }
  return icons[entry.event_type] || "mail-forward";
}
