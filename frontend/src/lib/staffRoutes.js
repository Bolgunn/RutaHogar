import { isAdminRole, isStaffRole, roles } from "./roles";

export function staffInitialPage(role) {
  if (role === roles.sales) return "home";
  if (isAdminRole(role)) return "admin";
  return null;
}

// Ruta de un pathname ya normalizado para ejecutivo o admin; null para otros roles.
export function resolveStaffRoute(path, role) {
  if (role === roles.sales) {
    if (path === "/") return { page: "home", path: "/inicio" };
    if (path === "/inicio") return { page: "home" };
    if (path === "/proyectos") return { page: "projects" };
    if (path === "/perfil") return { page: "sales-profile" };
    if (path === "/metricas") return { page: "metricas" };
    if (path === "/dashboard" || path === "/ejecutivo/leads") {
      return { page: "leads", path: path === "/dashboard" ? undefined : "/dashboard" };
    }
    return { page: "home", path: "/inicio" };
  }

  if (isAdminRole(role)) {
    if (path === "/") return { page: "admin", path: "/admin" };
    if (path === "/admin") return { page: "admin" };
    if (path === "/admin/proyectos") return { page: "admin-projects" };
    if (path === "/admin/perfil") return { page: "admin-profile" };
    if (path === "/metricas") return { page: "metricas" };
    if (path === "/admin/reportes") return { page: "admin-reports" };
    if (path === "/proyectos") return { page: "admin-projects", path: "/admin/proyectos" };
    if (path === "/dashboard" || path === "/ejecutivo/leads") return { page: "leads", path: "/dashboard" };
    if (path === "/inicio") return { page: "admin", path: "/admin" };
    return { page: "admin", path: "/admin" };
  }

  return null;
}

const staffPageGuards = {
  leads: isStaffRole,
  metricas: isStaffRole,
  projects: (role) => role === roles.sales,
  "sales-profile": (role) => role === roles.sales,
  admin: isAdminRole,
  "admin-projects": isAdminRole,
  "admin-profile": isAdminRole,
  "admin-reports": isAdminRole,
};

export function canViewStaffPage(page, role) {
  return Boolean(staffPageGuards[page]?.(role));
}
