// Corre contra un stack local con la migración aplicada, el backend y create-executive servidos.
// Nunca contra producción: exige URLs locales. Cubre lo que hu28_gestion_equipo.sql no alcanza:
// GoTrue (baneo real), PostgREST (llamadas anónimas), dos conexiones (carrera por el último admin)
// y el backend de punta a punta. Un correo con "falla" en el destinatario simula un rechazo de
// Resend si la función corre con supabase/tests/hu28_create_executive_harness.ts.
//
//   SB_URL=http://127.0.0.1:54321 SB_ANON=... SB_SERVICE=... SB_FUNCTIONS=http://127.0.0.1:8000 \
//     BACKEND_URL=http://127.0.0.1:8010 node supabase/tests/hu28_team_stack.mjs
import assert from "node:assert/strict";
import { rmSync, writeFileSync } from "node:fs";

const { SB_URL, SB_ANON, SB_SERVICE, SB_FUNCTIONS, BACKEND_URL } = process.env;
assert.match(SB_URL, /^http:\/\/(127\.0\.0\.1|localhost):/, "solo un stack local");
assert.match(BACKEND_URL, /^http:\/\/(127\.0\.0\.1|localhost):/, "solo un backend local");

const run = Date.now();
const password = `Hu28-${run}-aA1!`;
const mail = (name) => `hu28-${name}-${run}@example.invalid`;
const failures = [];

async function http(url, { key = SB_ANON, token, method = "GET", body, headers = {} } = {}) {
  const res = await fetch(url, {
    method,
    headers: { apikey: key, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* cuerpo no JSON */ }
  return { status: res.status, json, text };
}

const admin = (path, options = {}) => http(`${SB_URL}${path}`, { key: SB_SERVICE, token: SB_SERVICE, ...options });
const rest = (path, options) => http(`${SB_URL}/rest/v1/${path}`, options);
const api = (path, token, options = {}) => http(`${BACKEND_URL}/tracking${path}`, { token, ...options });
const createExecutive = (token, body) => http(`${SB_FUNCTIONS}/create-executive`, { method: "POST", token, body });
const login = (email, pass = password) => http(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", body: { email, password: pass } });

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

async function user(name, role, inmobiliaria_id = null) {
  const email = mail(name);
  const created = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  assert.equal(created.status, 200, created.text);
  const id = created.json.id;
  const set = await admin("/rest/v1/profiles?on_conflict=id", {
    method: "POST",
    body: { id, full_name: name, role, inmobiliaria_id },
    headers: { Prefer: "resolution=merge-duplicates" },
  });
  assert.ok(set.status < 300, set.text);
  const session = await login(email);
  assert.equal(session.status, 200, session.text);
  return { id, email, token: session.json.access_token, refresh: session.json.refresh_token };
}

const insertOne = async (table, row) => {
  const res = await admin(`/rest/v1/${table}`, { method: "POST", body: row, headers: { Prefer: "return=representation" } });
  assert.ok(res.status < 300, res.text);
  return res.json[0];
};

const events = async (subject) => (await admin(`/rest/v1/audit_events?subject_user_id=eq.${subject}&select=event_type,details,actor_id&order=occurred_at`)).json;
const role = async (id) => (await admin(`/rest/v1/profiles?id=eq.${id}&select=role,inmobiliaria_id,estado_acceso`)).json[0];
const member = async (token, id, query = "") => (await api(`/staff/team${query}`, token)).json.miembros.find((item) => item.id === id);

const tenantA = await insertOne("inmobiliarias", { nombre: `HU28 A ${run}` });
const tenantB = await insertOne("inmobiliarias", { nombre: `HU28 B ${run}` });
const tenantC = await insertOne("inmobiliarias", { nombre: `HU28 C ${run}` });
const project = await insertOne("proyectos", {
  inmobiliaria_id: tenantA.id, nombre: `HU28 ${run}`, comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: 3000, precio_max_uf: 5000,
});

const adminA = await user("admin-a", "admin_inmobiliario", tenantA.id);
const adminA2 = await user("admin-a2", "admin", tenantA.id);
const execA = await user("exec-a", "ejecutivo", tenantA.id);
const adminB = await user("admin-b", "admin_inmobiliario", tenantB.id);
const execB = await user("exec-b", "ejecutivo", tenantB.id);
const globalAdmin = await user("global", "admin");
const lead = await user("lead", "usuario");
const looseExec = await user("loose", "ejecutivo");

await insertOne("proyecto_ejecutivos", { proyecto_id: project.id, ejecutivo_id: execA.id, ejecutivo_email: execA.email, source: "manual", estado: "vinculado" });

await step("anon: ninguna RPC de equipo ni audit_events por HTTP", async () => {
  const body = { p_inmobiliaria: tenantA.id };
  for (const fn of ["hu28_list_team", "hu28_set_member_role", "hu28_set_member_access", "hu28_update_member", "hu28_log_event"]) {
    const res = await rest(`rpc/${fn}`, { method: "POST", body });
    assert.ok([401, 403, 404].includes(res.status), `${fn}: ${res.status} ${res.text}`);
  }
  const read = await rest("audit_events?select=id");
  assert.ok([401, 403].includes(read.status), read.text);
});

await step("authenticated: tampoco alcanza las RPC ni audit_events", async () => {
  const res = await rest("rpc/hu28_list_team", { token: adminA.token, method: "POST", body: { p_inmobiliaria: tenantA.id } });
  assert.ok([401, 403, 404].includes(res.status), res.text);
  const read = await rest("audit_events?select=id", { token: adminA.token });
  assert.ok([401, 403].includes(read.status), read.text);
});

await step("backend: un admin ve su equipo y sólo su equipo", async () => {
  const res = await api("/staff/team", adminA.token);
  assert.equal(res.status, 200, res.text);
  const ids = res.json.miembros.map((item) => item.id).sort();
  assert.deepEqual(ids, [adminA.id, adminA2.id, execA.id].sort());
  assert.equal(res.json.miembros.find((item) => item.id === adminA.id).es_propio, true);
  assert.equal(res.json.miembros.find((item) => item.id === execA.id).email, execA.email);
});

await step("backend: ejecutivo y lead no entran; otro tenant no existe", async () => {
  assert.equal((await api("/staff/team", execA.token)).status, 403);
  assert.equal((await api("/staff/team", lead.token)).status, 403);
  assert.equal((await api("/staff/team/history", execA.token)).status, 403);
  assert.equal((await api(`/staff/team?inmobiliaria_id=${tenantB.id}`, adminA.token)).status, 403);
  assert.equal((await api(`/staff/team/${execB.id}`, adminA.token, { method: "PATCH", body: { nombre: "x" } })).status, 404);
  assert.equal((await api(`/staff/team/${execB.id}/role`, adminA.token, { method: "POST", body: { rol: "admin_inmobiliario" } })).status, 404);
  assert.equal((await api(`/staff/team/${execB.id}/access`, adminA.token, { method: "POST", body: { estado: "desactivado" } })).status, 404);
  assert.equal((await api(`/staff/team/${execB.id}/access`, adminA.token, { method: "POST", body: { estado: "activo" } })).status, 404);
  assert.equal((await role(execB.id)).estado_acceso, "activo");
  assert.ok((await login(execB.email)).status === 200, "el otro tenant quedó baneado");
});

await step("backend: el admin global elige inmobiliaria", async () => {
  assert.equal((await api("/staff/team", globalAdmin.token)).status, 422);
  const res = await api(`/staff/team?inmobiliaria_id=${tenantB.id}`, globalAdmin.token);
  assert.equal(res.status, 200, res.text);
  assert.deepEqual(res.json.miembros.map((item) => item.id).sort(), [adminB.id, execB.id].sort());
  assert.equal((await member(globalAdmin.token, adminB.id, `?inmobiliaria_id=${tenantB.id}`)).bloqueo, "ultimo_administrador");
});

await step("backend: datos organizacionales, sin valores en el registro", async () => {
  const res = await api(`/staff/team/${execA.id}`, adminA.token, { method: "PATCH", body: { nombre: "Exec Editado", telefono: "+56 9 1234 5678" } });
  assert.equal(res.status, 200, res.text);
  assert.equal((await member(adminA.token, execA.id)).nombre, "Exec Editado");
  const entry = (await events(execA.id)).find((item) => item.event_type === "equipo.datos_actualizados");
  assert.deepEqual(entry.details, { campos: ["nombre", "telefono"] });
});

await step("backend: límites propios y último administrador", async () => {
  const self = await api(`/staff/team/${adminA.id}/access`, adminA.token, { method: "POST", body: { estado: "desactivado" } });
  assert.equal(self.status, 409, self.text);
  assert.equal(self.json.detail.code, "self_change_forbidden");
  const last = await api(`/staff/team/${adminB.id}/role`, globalAdmin.token + "", { method: "POST", body: { rol: "ejecutivo" } });
  assert.equal(last.status, 422, "sin inmobiliaria elegida");
  const chosen = await api(`/staff/team/${adminB.id}/role?inmobiliaria_id=${tenantB.id}`, globalAdmin.token, { method: "POST", body: { rol: "ejecutivo" } });
  assert.equal(chosen.status, 409, chosen.text);
  assert.equal(chosen.json.detail.code, "last_active_admin");
  assert.equal((await role(adminB.id)).role, "admin_inmobiliario");
});

await step("backend: dos cambios simultáneos no dejan la inmobiliaria sin administrador", async () => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const tenant = await insertOne("inmobiliarias", { nombre: `HU28 race ${run} ${attempt}` });
    const one = await user(`race-${attempt}-1`, "admin_inmobiliario", tenant.id);
    const two = await user(`race-${attempt}-2`, "admin_inmobiliario", tenant.id);
    const results = await Promise.all([one, two].map((target) =>
      api(`/staff/team/${target.id}/access?inmobiliaria_id=${tenant.id}`, globalAdmin.token, { method: "POST", body: { estado: "desactivado" } })));
    assert.deepEqual(results.map((res) => res.status).sort(), [200, 409], results.map((res) => res.text).join(" | "));
    const active = (await admin(`/rest/v1/profiles?inmobiliaria_id=eq.${tenant.id}&estado_acceso=eq.activo&select=id`)).json;
    assert.equal(active.length, 1);
  }
});

await step("GoTrue: desactivar corta el acceso en la siguiente request y bloquea el login", async () => {
  const before = await api("/staff/evaluations", execA.token);
  assert.equal(before.status, 200, before.text);
  const res = await api(`/staff/team/${execA.id}/access`, adminA.token, { method: "POST", body: { estado: "desactivado" } });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.proyectos.length, 1);

  // El access token sigue vigente hasta una hora: el estado es lo que corta.
  const after = await api("/staff/evaluations", execA.token);
  assert.ok([401, 403].includes(after.status), after.text);
  const projects = await rest("proyectos?select=id", { token: execA.token });
  assert.ok(projects.status >= 400 || projects.json.length === 0, projects.text);
  const colleagues = await rest("profiles?select=id", { token: execA.token });
  assert.ok(colleagues.status >= 400 || colleagues.json.length <= 1, colleagues.text);

  const signIn = await login(execA.email);
  assert.equal(signIn.status, 400, signIn.text);
  assert.match(signIn.text, /banned/i);
  const refresh = await http(`${SB_URL}/auth/v1/token?grant_type=refresh_token`, { method: "POST", body: { refresh_token: execA.refresh } });
  assert.equal(refresh.status, 400, refresh.text);

  assert.equal((await member(adminA.token, execA.id)).estado, "desactivado");
  assert.deepEqual((await member(adminA.token, execA.id)).proyectos, []);
  assert.deepEqual((await api("/staff/team", adminA.token)).json.proyectos_sin_ejecutivo.map((item) => item.id), [project.id]);
});

await step("backend: una persona desactivada no cambia de función, y repetir no duplica", async () => {
  const roleChange = await api(`/staff/team/${execA.id}/role`, adminA.token, { method: "POST", body: { rol: "admin_inmobiliario" } });
  assert.equal(roleChange.status, 409, roleChange.text);
  assert.equal(roleChange.json.detail.code, "member_deactivated");
  const again = await api(`/staff/team/${execA.id}/access`, adminA.token, { method: "POST", body: { estado: "desactivado" } });
  assert.equal(again.status, 200, again.text);
  assert.equal((await events(execA.id)).filter((item) => item.event_type === "equipo.acceso_desactivado").length, 1);
});

await step("GoTrue: reactivar devuelve el login, no los proyectos, y conserva el historial", async () => {
  const res = await api(`/staff/team/${execA.id}/access`, adminA.token, { method: "POST", body: { estado: "activo" } });
  assert.equal(res.status, 200, res.text);
  const signIn = await login(execA.email);
  assert.equal(signIn.status, 200, signIn.text);
  assert.equal((await api("/staff/evaluations", signIn.json.access_token)).status, 200);
  const current = await member(adminA.token, execA.id);
  assert.equal(current.estado, "activo");
  assert.deepEqual(current.proyectos, []);
  const types = (await events(execA.id)).map((item) => item.event_type);
  for (const type of ["equipo.acceso_desactivado", "equipo.acceso_reactivado", "equipo.proyecto_retirado", "equipo.datos_actualizados"]) {
    assert.ok(types.includes(type), type);
  }
  const line = (await api(`/staff/team/history?miembro_id=${execA.id}`, adminA.token)).json.items;
  assert.equal(line.filter((item) => item.event_type === "equipo.proyecto_retirado").length, 0, "la línea de desactivación ya nombra los proyectos");
  const deactivated = line.find((item) => item.event_type === "equipo.acceso_desactivado");
  assert.equal(deactivated.actor_nombre, "admin-a");
  assert.equal(deactivated.segmentos.at(-1).texto, project.nombre);
});

await step("Historial: una asignación pendiente no revela el nombre de la cuenta", async () => {
  for (const target of [lead, adminB]) {
    const res = await rest("rpc/assign_executive", { token: adminA2.token, method: "POST", body: { p_project_id: project.id, p_email: target.email } });
    assert.equal(res.status, 200, res.text);
  }
  const history = (await api("/staff/team/history", adminA2.token)).json.items;
  const text = history.slice(0, 2).map((item) => item.segmentos.map((part) => part.texto).join("")).join(" | ");
  assert.ok(!/\blead\b|admin-b/.test(text.replaceAll(mail("lead"), "").replaceAll(mail("admin-b"), "")), text);
  assert.ok(text.includes(lead.email) && text.includes(adminB.email), text);
  assert.ok(history.slice(0, 2).every((item) => item.miembro_id === null));
  for (const target of [lead, adminB]) {
    await rest("rpc/unassign_executive", { token: adminA2.token, method: "POST", body: { p_project_id: project.id, p_email: target.email } });
  }
});

await step("Historial: \"Ver más\" no repite entradas aunque lleguen nuevas", async () => {
  const first = (await api("/staff/team/history?limit=3", adminA.token)).json;
  assert.ok(first.next_cursor, "hacen falta más de 3 entradas");
  await rest("rpc/assign_executive", { token: adminA.token, method: "POST", body: { p_project_id: project.id, p_email: mail("nuevo-en-medio") } });
  await rest("rpc/unassign_executive", { token: adminA.token, method: "POST", body: { p_project_id: project.id, p_email: mail("nuevo-en-medio") } });
  const seen = first.items.map((item) => item.id);
  let cursor = first.next_cursor;
  while (cursor) {
    const page = (await api(`/staff/team/history?limit=3&cursor=${encodeURIComponent(cursor)}`, adminA.token)).json;
    seen.push(...page.items.map((item) => item.id));
    cursor = page.next_cursor;
  }
  assert.equal(new Set(seen).size, seen.length, "se repitió una entrada");
});

await step("Historial: quien no tiene nombre se muestra con su correo", async () => {
  const target = await user("sin-nombre", "ejecutivo", tenantA.id);
  const cleared = await admin(`/rest/v1/profiles?id=eq.${target.id}`, { method: "PATCH", body: { full_name: null } });
  assert.ok(cleared.status < 300, cleared.text);
  const log = await admin("/rest/v1/rpc/hu28_log_event", {
    method: "POST",
    body: { p_inmobiliaria: tenantA.id, p_actor: adminA.id, p_actor_role: "admin_inmobiliario", p_subject: target.id, p_event_type: "equipo.acceso_reactivado" },
  });
  assert.ok(log.status < 300, log.text);
  const entry = (await api(`/staff/team/history?miembro_id=${target.id}`, adminA.token)).json.items[0];
  assert.match(entry.segmentos.map((part) => part.texto).join(""), new RegExp(target.email.replace(/[.+]/g, "\\$&")));
});

await step("PostgREST: entre compañeros sólo se leen nombres", async () => {
  assert.deepEqual((await rest("profiles?select=id", { token: adminA.token })).json.map((row) => row.id), [adminA.id]);
  const names = await rest("rpc/list_staff_names", { token: adminA.token, method: "POST", body: { p_ids: [execA.id, execB.id, lead.id] } });
  assert.equal(names.status, 200, names.text);
  assert.deepEqual(names.json.map((row) => row.id), [execA.id]);
  assert.deepEqual(Object.keys(names.json[0]).sort(), ["full_name", "id"]);
  assert.equal((await rest("rpc/list_staff_names", { method: "POST", body: { p_ids: [execA.id] } })).status, 401);
});

await step("Backend: un acceso a medio aplicar se detecta y se reintenta", async () => {
  const target = await user("sync", "ejecutivo", tenantA.id);
  const banned = await admin(`/auth/v1/admin/users/${target.id}`, { method: "PUT", body: { ban_duration: "1h" } });
  assert.equal(banned.status, 200, banned.text);
  assert.equal((await member(adminA.token, target.id)).acceso_pendiente, true);
  const retry = await api(`/staff/team/${target.id}/access`, adminA.token, { method: "POST", body: { estado: "activo" } });
  assert.equal(retry.status, 200, retry.text);
  assert.equal((await member(adminA.token, target.id)).acceso_pendiente, false);
  assert.equal((await login(target.email)).status, 200);
});

await step("PostgREST: la asignación desde el catálogo queda en el historial con su origen", async () => {
  const res = await rest("rpc/assign_executive", { token: adminA2.token, method: "POST", body: { p_project_id: project.id, p_email: execA.email } });
  assert.equal(res.status, 200, res.text);
  const history = (await api(`/staff/team/history?miembro_id=${execA.id}`, adminA2.token)).json.items;
  assert.equal(history[0].event_type, "equipo.proyecto_asignado");
  assert.equal(history[0].origen, "Desde Proyectos");
  assert.equal(history[0].actor_nombre, "admin-a2");
  const fromTeam = await rest("rpc/unassign_executive", { token: adminA2.token, method: "POST", body: { p_project_id: project.id, p_email: execA.email, p_origen: "equipo" } });
  assert.equal(fromTeam.status, 200, fromTeam.text);
  const latest = (await api(`/staff/team/history?miembro_id=${execA.id}`, adminA2.token)).json.items[0];
  assert.equal(latest.event_type, "equipo.proyecto_retirado");
  assert.equal(latest.origen, null);
});

if (SB_FUNCTIONS) {
  await step("Edge Function: invitación con correo, y aparece como Invitado", async () => {
    const email = mail("nuevo");
    const res = await createExecutive(adminA.token, { email, full_name: "Persona Nueva", phone: "+56 9 0000" });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.created, true);
    assert.equal(res.json.email_enviado, true, res.text);
    const current = await member(adminA.token, res.json.ejecutivo.id);
    assert.equal(current.estado, "invitado");
    assert.equal(current.correo_fallido, false);
    assert.equal(current.rol, "ejecutivo");
    assert.deepEqual((await events(current.id)).map((item) => item.event_type), ["equipo.invitacion_creada", "equipo.invitacion_enviada"]);
  });

  await step("GoTrue: abrir el enlace no termina la invitación; guardar la contraseña sí", async () => {
    const email = mail("enlace");
    const invited = await createExecutive(adminA.token, { email, full_name: "Con Enlace" });
    const id = invited.json.ejecutivo.id;
    const link = await admin("/auth/v1/admin/generate_link", { method: "POST", body: { type: "recovery", email } });
    const opened = await fetch(link.json.action_link, { redirect: "manual" });
    const token = new URLSearchParams(new URL(opened.headers.get("location")).hash.slice(1)).get("access_token");
    assert.ok(token, "el enlace no abrió sesión");

    const afterOpen = await member(adminA.token, id);
    assert.equal(afterOpen.estado, "invitado");
    assert.equal(afterOpen.ultimo_ingreso, null);
    assert.equal((await createExecutive(adminA.token, { reenviar: true, miembro_id: id })).status, 200);

    const saved = await http(`${SB_URL}/auth/v1/user`, { method: "PUT", token, body: { password: `${password}-nueva` } });
    assert.equal(saved.status, 200, saved.text);
    assert.equal((await member(adminA.token, id)).estado, "activo");
    const again = await createExecutive(adminA.token, { reenviar: true, miembro_id: id });
    assert.equal(again.status, 409, again.text);
    assert.match(again.json.error, /ya definió/);
  });

  if (process.env.HARNESS_AUDIT_FAIL_FILE) {
    const failAudit = (type) => writeFileSync(process.env.HARNESS_AUDIT_FAIL_FILE, type);
    const healAudit = () => rmSync(process.env.HARNESS_AUDIT_FAIL_FILE, { force: true });

    await step("Edge Function: sin registro no queda una cuenta nueva", async () => {
      const email = mail("sin-registro");
      failAudit("equipo.invitacion_creada");
      const res = await createExecutive(adminA.token, { email, full_name: "Sin Registro" });
      healAudit();
      assert.equal(res.status, 500, res.text);
      const account = await rest("rpc/find_user_id_by_email", { key: SB_SERVICE, token: SB_SERVICE, method: "POST", body: { p_email: email } });
      assert.equal(account.json, null, "la cuenta quedó sin registro");
    });

    await step("Edge Function: un resultado sin registrar queda visible y se puede reenviar", async () => {
      const email = mail("sin-resultado");
      failAudit("equipo.invitacion_enviada");
      const res = await createExecutive(adminA.token, { email, full_name: "Sin Resultado" });
      healAudit();
      assert.equal(res.status, 500, res.text);
      const account = await rest("rpc/find_user_id_by_email", { key: SB_SERVICE, token: SB_SERVICE, method: "POST", body: { p_email: email } });
      const current = await member(adminA.token, account.json);
      assert.equal(current.correo_fallido, true);
      assert.equal((await createExecutive(adminA.token, { reenviar: true, miembro_id: account.json })).json.email_enviado, true);
    });

    await step("Edge Function: un reenvío sin registro no sale", async () => {
      const created = await createExecutive(adminA.token, { email: mail("reenvio-sin-registro"), full_name: "Reenvío" });
      const before = (await events(created.json.ejecutivo.id)).length;
      failAudit("equipo.invitacion_creada");
      const res = await createExecutive(adminA.token, { reenviar: true, miembro_id: created.json.ejecutivo.id });
      healAudit();
      assert.equal(res.status, 500, res.text);
      assert.equal((await events(created.json.ejecutivo.id)).length, before);
    });
  }

  await step("Edge Function: un envío fallido conserva la cuenta y se reenvía", async () => {
    const email = mail("falla");
    const res = await createExecutive(adminA.token, { email, full_name: "Con Falla" });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.email_enviado, false);
    const id = res.json.ejecutivo.id;
    assert.equal((await member(adminA.token, id)).correo_fallido, true);
    assert.equal((await member(adminA.token, id)).estado, "invitado");

    const retry = await createExecutive(adminA.token, { reenviar: true, miembro_id: id });
    assert.equal(retry.status, 200, retry.text);
    assert.equal(retry.json.email_enviado, false, "sigue fallando con la misma dirección");
    assert.equal((await events(id)).filter((item) => item.event_type === "equipo.invitacion_fallida").length, 2);
  });

  await step("Edge Function: un reenvío exitoso limpia el fallo", async () => {
    const email = mail("nuevo2");
    const created = await createExecutive(adminA.token, { email, full_name: "Reenvío" });
    const id = created.json.ejecutivo.id;
    const failed = await admin("/rest/v1/rpc/hu28_log_event", {
      method: "POST",
      body: { p_inmobiliaria: tenantA.id, p_actor: adminA.id, p_actor_role: "admin_inmobiliario", p_subject: id, p_event_type: "equipo.invitacion_fallida" },
    });
    assert.ok(failed.status < 300, failed.text);
    assert.equal((await member(adminA.token, id)).correo_fallido, true);
    const retry = await createExecutive(adminA.token, { reenviar: true, miembro_id: id });
    assert.equal(retry.json.email_enviado, true, retry.text);
    assert.equal((await member(adminA.token, id)).correo_fallido, false);
    assert.equal((await events(id)).at(-1).event_type, "equipo.invitacion_reenviada");
  });

  await step("Edge Function: el reenvío respeta equipo, estado y primer ingreso", async () => {
    assert.equal((await createExecutive(adminA.token, { reenviar: true, miembro_id: execB.id })).status, 404);
    assert.equal((await createExecutive(adminA.token, { reenviar: true, miembro_id: lead.id })).status, 404);
    const signedIn = await createExecutive(adminA.token, { reenviar: true, miembro_id: execA.id });
    assert.equal(signedIn.status, 409, signedIn.text);
    assert.match(signedIn.json.error, /ya definió/);

    await api(`/staff/team/${execA.id}/access`, adminA.token, { method: "POST", body: { estado: "desactivado" } });
    const off = await createExecutive(adminA.token, { reenviar: true, miembro_id: execA.id });
    assert.equal(off.status, 409, off.text);
    assert.match(off.json.error, /desactivada/);
    await api(`/staff/team/${execA.id}/access`, adminA.token, { method: "POST", body: { estado: "activo" } });
  });

  await step("Edge Function: cada correo existente tiene su respuesta", async () => {
    const refused = [
      [lead, /comprador/],
      [execA, /ya es parte de tu equipo/],
      [adminA2, /ya es parte de tu equipo/],
      [execB, /otra inmobiliaria/],
      [adminB, /administrador/],
      [globalAdmin, /administrador/],
    ];
    for (const [target, message] of refused) {
      const before = await role(target.id);
      const res = await createExecutive(adminA.token, { email: target.email, full_name: "X" });
      assert.equal(res.status, 409, res.text);
      assert.match(res.json.error, message);
      assert.deepEqual(await role(target.id), before);
    }
  });

  await step("Edge Function: un ejecutivo sin inmobiliaria se vincula y se le avisa", async () => {
    const res = await createExecutive(adminA.token, { email: looseExec.email, full_name: "Suelto" });
    assert.equal(res.status, 200, res.text);
    assert.equal(res.json.vinculado, true);
    assert.equal(res.json.created, false);
    assert.equal(res.json.email_enviado, true);
    assert.equal((await role(looseExec.id)).inmobiliaria_id, tenantA.id);
    const entry = (await events(looseExec.id)).at(-1);
    assert.equal(entry.event_type, "equipo.miembro_vinculado");
    assert.equal(entry.actor_id, adminA.id);
  });

  await step("Edge Function: una cuenta desactivada ya no invita", async () => {
    await api(`/staff/team/${adminA2.id}/access`, adminA.token, { method: "POST", body: { estado: "desactivado" } });
    const res = await createExecutive(adminA2.token, { email: mail("x"), full_name: "X" });
    assert.ok([401, 403].includes(res.status), res.text);
  });

  await step("Edge Function: el admin global invita en la inmobiliaria elegida", async () => {
    const res = await createExecutive(globalAdmin.token, { email: mail("global-inv"), full_name: "Global Inv", inmobiliaria_id: tenantC.id });
    assert.equal(res.status, 200, res.text);
    assert.equal((await role(res.json.ejecutivo.id)).inmobiliaria_id, tenantC.id);
  });
} else {
  console.log("skip Edge Function: falta SB_FUNCTIONS");
}

console.log(failures.length ? `\n${failures.length} fallo(s)` : "\nPASS");
process.exit(failures.length ? 1 : 0);
