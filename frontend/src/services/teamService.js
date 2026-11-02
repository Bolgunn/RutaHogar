// HU 28 — equipo de la inmobiliaria. El backend resuelve el tenant desde la sesión; solo el admin
// global declara cuál, y el backend rechaza ese parámetro a cualquier otro rol.
import { trackingRequest } from "./trackingService";

function teamPath(path, inmobiliariaId, params = {}) {
  const query = new URLSearchParams();
  if (inmobiliariaId) query.set("inmobiliaria_id", inmobiliariaId);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  const suffix = query.toString();
  return `/staff/team${path}${suffix ? `?${suffix}` : ""}`;
}

const member = (id) => `/${encodeURIComponent(id)}`;

export const getTeam = (inmobiliariaId) => trackingRequest(teamPath("", inmobiliariaId), undefined);

export const getTeamHistory = (inmobiliariaId, { miembroId, cursor = 0 } = {}) =>
  trackingRequest(teamPath("/history", inmobiliariaId, { miembro_id: miembroId, cursor }), undefined);

export const updateTeamMember = (id, datos, inmobiliariaId) =>
  trackingRequest(teamPath(member(id), inmobiliariaId), datos, { method: "PATCH" });

export const setTeamMemberRole = (id, rol, inmobiliariaId) =>
  trackingRequest(teamPath(`${member(id)}/role`, inmobiliariaId), { rol });

export const setTeamMemberAccess = (id, estado, inmobiliariaId) =>
  trackingRequest(teamPath(`${member(id)}/access`, inmobiliariaId), { estado });
