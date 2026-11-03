import { afterEach, beforeEach, expect, it, vi } from "vitest";

// #148: a session revoked on the server (logout elsewhere, shared demo account) must send
// this tab back to sign-in. trackingService signs out locally on 401, and supabase-js then
// emits SIGNED_OUT; this checks the HU27 SessionAccess half of that chain.
const hooks = vi.hoisted(() => ({ states: [], refs: [], effects: [], index: 0 }));
const auth = vi.hoisted(() => ({ restore: vi.fn(), clear: vi.fn(), listener: null }));
vi.mock("react", async (original) => {
  const actual = await original();
  const useState = (initial) => {
    const index = hooks.index++;
    if (!(index in hooks.states)) hooks.states[index] = initial;
    return [hooks.states[index], (value) => { hooks.states[index] = typeof value === "function" ? value(hooks.states[index]) : value; }];
  };
  const useRef = (initial) => {
    const index = hooks.index++;
    if (!(index in hooks.refs)) hooks.refs[index] = { current: initial };
    return hooks.refs[index];
  };
  const useEffect = (effect) => { hooks.effects.push(effect); };
  return { ...actual, default: { ...actual.default, useState, useRef, useEffect }, useState, useRef, useEffect };
});
vi.mock("../utils/supabase", () => ({ supabase: { auth: { onAuthStateChange: (callback) => {
  auth.listener = callback;
  return { data: { subscription: { unsubscribe: vi.fn() } } };
} } } }));
vi.mock("../services/auth", () => ({ restoreAuth: auth.restore, clearPrivateAuth: auth.clear,
  isInteractiveAuth: () => false, signOut: vi.fn() }));
vi.mock("../lib/authPolicy", () => ({ callbackAccessError: () => null, normalizeEmail: (value) => value, recoverySession: () => false }));
vi.mock("../services/httpRequest", () => ({ withTimeout: (promise) => promise }));

import SessionAccess from "./SessionAccess";

const lead = { session: { user: { id: "lead-1" } }, profile: { id: "lead-1", role: "usuario" } };
const children = vi.fn(() => null);
const render = () => { hooks.index = 0; return SessionAccess({ children }); };

beforeEach(() => {
  vi.useFakeTimers();
  Object.assign(hooks, { states: [], refs: [], effects: [], index: 0 });
  vi.clearAllMocks();
  vi.stubGlobal("window", { location: { href: "https://rutahogar.test/", pathname: "/", replace: vi.fn() },
    history: { replaceState: vi.fn() }, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("document", { visibilityState: "visible", addEventListener: vi.fn(), removeEventListener: vi.fn() });
  vi.stubGlobal("sessionStorage", { getItem: () => null, removeItem: vi.fn() });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

it("returns to sign-in and clears private data when the server revokes the session", async () => {
  auth.restore.mockResolvedValueOnce(lead).mockResolvedValueOnce({ session: null, profile: null });
  render();
  hooks.effects[0]();
  await vi.runAllTimersAsync();
  render();
  expect(children).toHaveBeenLastCalledWith(lead, expect.any(Function));

  auth.listener("SIGNED_OUT", null);
  expect(auth.clear).toHaveBeenCalledTimes(1);
  await vi.runAllTimersAsync();
  render();

  expect(auth.restore).toHaveBeenCalledTimes(2);
  expect(children).toHaveBeenLastCalledWith({ session: null, profile: null }, expect.any(Function));
});
