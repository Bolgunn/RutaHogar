import React from "react";
import { beforeEach, expect, it, vi } from "vitest";
const hooks = vi.hoisted(() => ({ states: [], index: 0 }));
const auth = vi.hoisted(() => ({ signup: vi.fn(), signin: vi.fn() }));
vi.mock("react", async original => ({ ...await original(), default: { ...(await original()).default, useEffect: () => {} },
  useState: initial => { const index=hooks.index++; if (!(index in hooks.states)) hooks.states[index]=typeof initial==='function' ? initial() : initial;
    return [hooks.states[index], value => { hooks.states[index]=typeof value==='function' ? value(hooks.states[index]) : value; }]; },
  useRef: () => ({ current: null }), useMemo: callback => callback(), useEffect: () => {},
}));
vi.mock("../services/auth", () => ({ signUp: auth.signup, signIn: auth.signin, roles: { user: "usuario" }, roleLabels: {} }));
vi.mock("../services/profileService", () => ({ isSupabaseDataConfigured: true }));
import AuthPanel from "./AuthPanel";
const find = (node, predicate) => {
  if (Array.isArray(node)) return node.map(item => find(item,predicate)).find(Boolean);
  if (!React.isValidElement(node)) return null;
  return predicate(node) ? node : find(node.props.children,predicate);
};
const onAuth=vi.fn();
const render = (mode="signup") => { hooks.index=0; return AuthPanel({ initialMode: mode, onAuth, invitationContext: "context-nonce" }); };
beforeEach(() => { hooks.states=[]; vi.clearAllMocks(); });
it("keeps the verification-pending registration on screen without invoking an authenticated return", async () => {
  render();
  hooks.states[1]={ nombre:"Nombre",apellido_paterno:"Apellido",apellido_materno:"Apellido", rut_number:"12345678",rut_dv:"5",
    phone:"12345678",birth_day:"01",birth_month:"01",birth_year:"1990",email:"own@test.cl",password:"StrongPassword1!",role:"usuario" };
  auth.signup.mockResolvedValue({ emailConfirmationRequired:true,session:null,profile:null });
  await find(render(),node => node.type==='form').props.onSubmit({ preventDefault(){} });
  expect(auth.signup).toHaveBeenCalledWith(expect.objectContaining({ invitationContext:"context-nonce" }));
  expect(onAuth).not.toHaveBeenCalled();
  expect(find(render(),node => node.props.role==='status')).toBeTruthy();
  expect(find(render(),node => node.type==='form')).toBeFalsy();
});
it("returns to the invitation only after an actual sign-in session", async () => {
  render('signin');
  hooks.states[1]={ ...hooks.states[1],email:"own@test.cl",password:"password" };
  const session={ session:{access_token:"session"},profile:{id:"own"} };
  auth.signin.mockResolvedValue(session);
  await find(render('signin'),node => node.type==='form').props.onSubmit({ preventDefault(){} });
  expect(onAuth).toHaveBeenCalledWith(session);
});
