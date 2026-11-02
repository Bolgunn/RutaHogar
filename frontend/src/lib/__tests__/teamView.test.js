import { describe, expect, it } from "vitest";

import {
  filterMembers,
  formatDate,
  formatDateTime,
  historyIcon,
  initials,
  inviteToast,
  LOCK_MESSAGES,
  projectsLeftUncovered,
  statusCounts,
  statusLine,
} from "../teamView";
import { canViewStaffPage, resolveStaffRoute } from "../staffRoutes";
import { roles } from "../roles";

const altos = { id: "p1", nombre: "Altos" };
const sur = { id: "p2", nombre: "Sur" };
const camila = { id: "c", nombre: "Camila Soto", email: "camila@ejemplo.cl", estado: "activo", proyectos: [altos, sur] };
const diego = { id: "d", nombre: "Diego Fuentes", email: "diego@empresa.cl", estado: "invitado", proyectos: [altos] };
const tomas = { id: "t", nombre: "Tomás Vera", email: "tomas@ejemplo.cl", estado: "desactivado", proyectos: [sur] };
const team = [camila, diego, tomas];

describe("team counters and filters", () => {
  it("counts every status", () => {
    expect(statusCounts(team)).toEqual({ todos: 3, activo: 1, invitado: 1, desactivado: 1 });
    expect(statusCounts()).toEqual({ todos: 0, activo: 0, invitado: 0, desactivado: 0 });
  });

  it("a counter filters and the search matches name or email", () => {
    expect(filterMembers(team, "invitado").map((item) => item.id)).toEqual(["d"]);
    expect(filterMembers(team, "todos", "EMPRESA").map((item) => item.id)).toEqual(["d"]);
    expect(filterMembers(team, "todos", "tomás").map((item) => item.id)).toEqual(["t"]);
    expect(filterMembers(team, "activo", "tomás")).toEqual([]);
  });
});

describe("deactivation warning", () => {
  it("names projects nobody active keeps, and an invited person keeps none", () => {
    expect(projectsLeftUncovered(camila, team)).toEqual([altos, sur]);
    const activo = { ...diego, estado: "activo" };
    expect(projectsLeftUncovered(camila, [camila, activo, tomas])).toEqual([sur]);
  });

  it("leaves out agotado projects", () => {
    const agotado = { id: "p3", nombre: "Agotado", estado: "agotado" };
    expect(projectsLeftUncovered({ ...camila, proyectos: [agotado] }, team)).toEqual([]);
  });
});

describe("Gestionar header", () => {
  it("follows the member's state", () => {
    expect(statusLine({ estado: "invitado", correo_fallido: true })).toBe("La invitación no llegó a enviarse.");
    expect(statusLine({ estado: "invitado", invitado_en: "2026-10-30T16:05:00" }))
      .toBe("Invitación enviada el 30-10-2026. Aún no define su contraseña.");
    expect(statusLine({ estado: "desactivado", correo_fallido: true })).toBe("No puede entrar a RutaHogar. Su historial se conserva.");
    expect(statusLine({ estado: "activo", ultimo_ingreso: "2026-11-02T09:14:00" })).toBe("Último ingreso: 02-11-2026 09:14.");
  });

  it("explains each lock with the approved copy", () => {
    expect(LOCK_MESSAGES.propio).toBe("No puedes cambiar tu propia función ni desactivar tu acceso. Otro administrador debe hacerlo.");
    expect(LOCK_MESSAGES.ultimo_administrador).toBe("Es el único administrador activo de esta inmobiliaria. Asigna otro administrador antes de hacer este cambio.");
  });
});

describe("invitation result", () => {
  const args = { nombre: "Ana Soto", email: "ana@ejemplo.cl" };
  it("tells the sent, failed and linked cases apart", () => {
    expect(inviteToast({ ...args, data: { created: true, email_enviado: true } })).toBe("Invitación enviada a ana@ejemplo.cl.");
    expect(inviteToast({ ...args, data: { created: true, email_enviado: false } }))
      .toBe("La cuenta se creó, pero no pudimos enviar el correo a ana@ejemplo.cl.");
    expect(inviteToast({ ...args, data: { vinculado: true, email_enviado: true } }))
      .toBe("Ana Soto ya tenía cuenta: se sumó al equipo y le avisamos por correo.");
    expect(inviteToast({ ...args, data: { vinculado: true, email_enviado: false } })).toContain("no pudimos avisarle");
  });
});

describe("presentation helpers", () => {
  it("formats dates and initials", () => {
    expect(formatDate("2026-11-02T09:14:00")).toBe("02-11-2026");
    expect(formatDateTime("2026-11-02T09:14:00")).toBe("02-11-2026 09:14");
    expect(formatDate(null)).toBe("");
    expect(initials("Ellison De Moraes")).toBe("ED");
  });

  it("picks the history icon from the event", () => {
    expect(historyIcon({ event_type: "equipo.rol_cambiado", rol_nuevo: "ejecutivo" })).toBe("shield-down");
    expect(historyIcon({ event_type: "equipo.rol_cambiado", rol_nuevo: "admin_inmobiliario" })).toBe("shield-up");
    expect(historyIcon({ event_type: "equipo.invitacion_enviada" })).toBe("mail-forward");
    expect(historyIcon({ event_type: "equipo.invitacion_fallida" })).toBe("mail-off");
    expect(historyIcon({ event_type: "equipo.proyecto_asignado" })).toBe("circle-plus");
    expect(historyIcon({ event_type: "equipo.proyecto_retirado" })).toBe("circle-minus");
  });
});

describe("/admin/equipo route", () => {
  it("belongs to both admin roles, global included", () => {
    expect(resolveStaffRoute("/admin/equipo", roles.admin_inmo)).toEqual({ page: "admin-equipo" });
    expect(resolveStaffRoute("/admin/equipo", roles.admin)).toEqual({ page: "admin-equipo" });
    expect(canViewStaffPage("admin-equipo", roles.admin_inmo, "tenant")).toBe(true);
    expect(canViewStaffPage("admin-equipo", roles.admin, null)).toBe(true);
  });

  it("is closed to executives and leads", () => {
    expect(canViewStaffPage("admin-equipo", roles.sales, "tenant")).toBe(false);
    expect(canViewStaffPage("admin-equipo", roles.user)).toBe(false);
    expect(resolveStaffRoute("/admin/equipo", roles.sales)).toEqual({ page: "home", path: "/inicio" });
  });
});
