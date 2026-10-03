// Roles de profiles.role (espejo de profiles_role_check).
// admin_inmobiliario es un admin acotado a su inmobiliaria: ve lo mismo que un
// admin con inmobiliaria_id, nunca las superficies de admin global.
export const roles = {
  user: "usuario",
  sales: "ejecutivo",
  admin: "admin",
  tenantAdmin: "admin_inmobiliario",
};

const roleAliases = {
  usuario_comun: roles.user,
  usuario: roles.user,
  ejecutivo_comercial: roles.sales,
  ejecutivo: roles.sales,
  admin: roles.admin,
  admin_inmobiliario: roles.tenantAdmin,
};

export function normalizeRole(role) {
  return roleAliases[role] || roles.user;
}

export function isAdminRole(role) {
  return role === roles.admin || role === roles.tenantAdmin;
}

export function isStaffRole(role) {
  return role === roles.sales || isAdminRole(role);
}

// Global = rol admin sin inmobiliaria. Un admin_inmobiliario sin inmobiliaria
// es un perfil mal configurado, no un admin global.
export function isGlobalAdmin(role, inmobiliariaId) {
  return role === roles.admin && !inmobiliariaId;
}
