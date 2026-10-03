import { describe, expect, it } from "vitest";

import { isAdminRole, isGlobalAdmin, isStaffRole, normalizeRole, roles } from "../roles";
import { canViewStaffPage, resolveStaffRoute, staffInitialPage } from "../staffRoutes";

const TENANT = "8f6b1d2e-0000-4000-8000-000000000001";

describe("admin_inmobiliario role", () => {
  it("survives normalization instead of degrading to usuario", () => {
    expect(normalizeRole("admin_inmobiliario")).toBe(roles.tenantAdmin);
    expect(normalizeRole("admin")).toBe(roles.admin);
    expect(normalizeRole("rol_desconocido")).toBe(roles.user);
  });

  it("is an admin and staff role", () => {
    expect(isAdminRole(roles.tenantAdmin)).toBe(true);
    expect(isStaffRole(roles.tenantAdmin)).toBe(true);
    expect(isAdminRole(roles.sales)).toBe(false);
    expect(isStaffRole(roles.user)).toBe(false);
  });

  it("lands on the admin panel and reaches every admin page", () => {
    expect(staffInitialPage(roles.tenantAdmin)).toBe("admin");
    expect(resolveStaffRoute("/", roles.tenantAdmin)).toEqual({ page: "admin", path: "/admin" });
    expect(resolveStaffRoute("/admin", roles.tenantAdmin)).toEqual({ page: "admin" });
    expect(resolveStaffRoute("/admin/proyectos", roles.tenantAdmin)).toEqual({ page: "admin-projects" });
    expect(resolveStaffRoute("/admin/perfil", roles.tenantAdmin)).toEqual({ page: "admin-profile" });
    expect(resolveStaffRoute("/dashboard", roles.tenantAdmin)).toEqual({ page: "leads", path: "/dashboard" });
    for (const page of ["admin", "admin-projects", "admin-profile", "leads"]) {
      expect(canViewStaffPage(page, roles.tenantAdmin)).toBe(true);
    }
  });

  it("routes exactly like a tenant admin", () => {
    for (const path of ["/", "/inicio", "/admin", "/admin/proyectos", "/admin/perfil", "/proyectos", "/dashboard", "/ejecutivo/leads", "/perfil", "/x"]) {
      expect(resolveStaffRoute(path, roles.tenantAdmin)).toEqual(resolveStaffRoute(path, roles.admin));
    }
  });

  it("does not get executive-only pages", () => {
    expect(canViewStaffPage("projects", roles.tenantAdmin)).toBe(false);
    expect(canViewStaffPage("sales-profile", roles.tenantAdmin)).toBe(false);
  });

  it("never counts as a global admin, even without an inmobiliaria", () => {
    expect(isGlobalAdmin(roles.tenantAdmin, TENANT)).toBe(false);
    expect(isGlobalAdmin(roles.tenantAdmin, null)).toBe(false);
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
});
