import { describe, expect, it } from "vitest";

import { isAdminRole, isGlobalAdmin, isStaffRole, normalizeRole, roles } from "../roles";
import { canViewStaffPage, resolveStaffRoute, staffInitialPage } from "../staffRoutes";

const TENANT = "8f6b1d2e-0000-4000-8000-000000000001";

describe("admin_inmobiliario role", () => {
  it("survives normalization instead of degrading to usuario", () => {
    expect(normalizeRole("admin_inmobiliario")).toBe(roles.admin_inmo);
    expect(normalizeRole("admin")).toBe(roles.admin);
    expect(normalizeRole("rol_desconocido")).toBe(roles.user);
  });

  it("is an admin and staff role", () => {
    expect(isAdminRole(roles.admin_inmo)).toBe(true);
    expect(isStaffRole(roles.admin_inmo)).toBe(true);
    expect(isAdminRole(roles.sales)).toBe(false);
    expect(isStaffRole(roles.user)).toBe(false);
  });

  it("lands on the admin panel and reaches every admin page", () => {
    expect(staffInitialPage(roles.admin_inmo)).toBe("admin");
    expect(resolveStaffRoute("/", roles.admin_inmo)).toEqual({ page: "admin", path: "/admin" });
    expect(resolveStaffRoute("/admin", roles.admin_inmo)).toEqual({ page: "admin" });
    expect(resolveStaffRoute("/admin/proyectos", roles.admin_inmo)).toEqual({ page: "admin-projects" });
    expect(resolveStaffRoute("/admin/perfil", roles.admin_inmo)).toEqual({ page: "admin-profile" });
    expect(resolveStaffRoute("/admin/reportes", roles.admin_inmo)).toEqual({ page: "admin-reports" });
    expect(resolveStaffRoute("/dashboard", roles.admin_inmo)).toEqual({ page: "leads", path: "/dashboard" });
    for (const page of ["admin", "admin-projects", "admin-profile", "admin-reports", "leads"]) {
      expect(canViewStaffPage(page, roles.admin_inmo)).toBe(true);
    }
  });

  it("routes exactly like a tenant admin", () => {
    for (const path of ["/", "/inicio", "/admin", "/admin/proyectos", "/admin/perfil", "/proyectos", "/dashboard", "/ejecutivo/leads", "/perfil", "/x"]) {
      expect(resolveStaffRoute(path, roles.admin_inmo)).toEqual(resolveStaffRoute(path, roles.admin));
    }
  });

  it("does not get executive-only pages", () => {
    expect(canViewStaffPage("projects", roles.admin_inmo)).toBe(false);
    expect(canViewStaffPage("sales-profile", roles.admin_inmo)).toBe(false);
  });

  it("never counts as a global admin, even without an inmobiliaria", () => {
    expect(isGlobalAdmin(roles.admin_inmo, TENANT)).toBe(false);
    expect(isGlobalAdmin(roles.admin_inmo, null)).toBe(false);
    expect(isGlobalAdmin(roles.admin, TENANT)).toBe(false);
    expect(isGlobalAdmin(roles.admin, null)).toBe(true);
  });
});

describe("existing roles keep their routes", () => {
  it("usuario is not routed by the staff resolver", () => {
    expect(staffInitialPage(roles.user)).toBe(null);
    expect(resolveStaffRoute("/admin", roles.user)).toBe(null);
    expect(canViewStaffPage("admin", roles.user)).toBe(false);
    expect(canViewStaffPage("leads", roles.user)).toBe(false);
  });

  it("ejecutivo keeps its home and cannot open admin pages", () => {
    expect(staffInitialPage(roles.sales)).toBe("home");
    expect(resolveStaffRoute("/admin", roles.sales)).toEqual({ page: "home", path: "/inicio" });
    expect(resolveStaffRoute("/ejecutivo/leads", roles.sales)).toEqual({ page: "leads", path: "/dashboard" });
    expect(canViewStaffPage("admin", roles.sales)).toBe(false);
    expect(canViewStaffPage("leads", roles.sales)).toBe(true);
  });

  it("opens the HU 15 metrics page for ejecutivos and admins only", () => {
    for (const role of [roles.sales, roles.admin, roles.admin_inmo]) {
      expect(resolveStaffRoute("/metricas", role)).toEqual({ page: "metricas" });
      expect(canViewStaffPage("metricas", role)).toBe(true);
    }
    expect(resolveStaffRoute("/metricas", roles.user)).toBe(null);
    expect(canViewStaffPage("metricas", roles.user)).toBe(false);
  });
});
