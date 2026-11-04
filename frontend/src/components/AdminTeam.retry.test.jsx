import React from "react";
import { beforeEach, expect, it, vi } from "vitest";

// No DOM environment here: hooks are replaced by a minimal store so the component renders as a function.
const hooks = vi.hoisted(() => ({ states: [], refs: [], effects: [], index: 0 }));
const team = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("react", async (original) => {
  const actual = await original();
  const useState = (initial) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.states[index], (value) => { hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value; }];
  };
  const useRef = (initial) => {
    const index = hooks.index++;
    if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
    return hooks.refs[index];
  };
  const useCallback = (callback) => callback;
  const useEffect = (effect) => { hooks.effects.push(effect); };
  return { ...actual, default: { ...actual.default, useState, useRef, useCallback, useEffect }, useState, useRef, useCallback, useEffect };
});
vi.mock("react-dom", () => ({ createPortal: (node) => node }));
vi.mock("./useModalFocus", () => ({ default: () => {} }));
vi.mock("../services/teamService", () => ({ getTeam: team.get, getTeamHistory: vi.fn(), setTeamMemberAccess: vi.fn(),
  setTeamMemberRole: vi.fn(), updateTeamMember: vi.fn() }));
vi.mock("../services/executiveService", () => ({ createExecutive: vi.fn(), resendExecutiveInvitation: vi.fn() }));
vi.mock("../services/projectService", () => ({ assignExecutive: vi.fn(), getInmobiliarias: vi.fn(), unassignExecutive: vi.fn() }));

import AdminTeam from "./AdminTeam";

const find = (node, predicate) => {
  if (Array.isArray(node)) return node.map((item) => find(item, predicate)).find(Boolean);
  if (!React.isValidElement(node)) return null;
  return predicate(node) ? node : find(node.props.children, predicate);
};
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
const render = () => {
  hooks.index = 0;
  hooks.effects = [];
  return AdminTeam({ profile: { id: "admin-1", role: "admin_inmobiliario" }, inmobiliariaId: "tenant-1" });
};

beforeEach(() => {
  Object.assign(hooks, { states: [], refs: [], effects: [], index: 0 });
  vi.clearAllMocks();
  vi.stubGlobal("document", { body: {} });
});

it("lets the administrator retry a failed team load without reloading the page", async () => {
  team.get.mockRejectedValueOnce(new Error("No pudimos cargar el equipo."))
    .mockResolvedValueOnce({ miembros: [], proyectos: [], proyectos_sin_ejecutivo: [] });
  render();
  hooks.effects.forEach((effect) => effect());
  await flush();

  const alert = find(render(), (node) => node.props.role === "alert");
  expect(alert).toBeTruthy();
  const retry = find(alert.props.children, (node) => node.type === "button");
  expect(retry.props.children).toBe("Reintentar");

  retry.props.onClick();
  await flush();

  expect(team.get).toHaveBeenCalledTimes(2);
  expect(find(render(), (node) => node.props.role === "alert")).toBeFalsy();
});
