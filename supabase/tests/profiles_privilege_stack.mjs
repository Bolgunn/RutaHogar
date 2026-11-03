// Corre contra un stack de `supabase start` con la migración aplicada y create-executive
// servida. Nunca contra producción: exige una URL local. Cubre lo que profiles_privilege_guard.sql
// no alcanza: GoTrue, PostgREST y la Edge Function reales.
//
//   SB_URL=http://127.0.0.1:54321 SB_ANON=... SB_SERVICE=... SB_FUNCTIONS=http://127.0.0.1:54321/functions/v1 \
//     node supabase/tests/profiles_privilege_stack.mjs
import assert from "node:assert/strict";

const { SB_URL, SB_ANON, SB_SERVICE, SB_FUNCTIONS } = process.env;
assert.match(SB_URL, /^http:\/\/(127\.0\.0\.1|localhost):/, "solo un stack local");

const run = Date.now();
const password = `Pr171-${run}-aA1!`;
const mail = (name) => `pg-${name}-${run}@example.invalid`;
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

async function step(name, fn) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (error) {
    failures.push(name);
    console.log(`FAIL ${name}: ${error.message}`);
  }
}

async function signUp(name, data = {}) {
  const email = mail(name);
  const res = await http(`${SB_URL}/auth/v1/signup`, { method: "POST", body: { email, password, data } });
  assert.equal(res.status, 200, res.text);
  return { id: res.json.user.id, email, token: res.json.access_token };
}

async function adminUser(name, role, inmobiliaria_id = null) {
  const email = mail(name);
  const created = await admin("/auth/v1/admin/users", { method: "POST", body: { email, password, email_confirm: true } });
  assert.equal(created.status, 200, created.text);
  const id = created.json.id;
  const set = await admin(`/rest/v1/profiles?id=eq.${id}`, { method: "PATCH", body: { role, inmobiliaria_id } });
  assert.ok(set.status < 300, set.text);
  const login = await http(`${SB_URL}/auth/v1/token?grant_type=password`, { method: "POST", body: { email, password } });
  assert.equal(login.status, 200, login.text);
  return { id, email, token: login.json.access_token };
}

async function profile(id) {
  const res = await admin(`/rest/v1/profiles?id=eq.${id}&select=role,inmobiliaria_id,reliability_status`);
  return res.json[0];
}

const createExecutive = (token, body) =>
  http(`${SB_FUNCTIONS}/create-executive`, { method: "POST", token, body });

const insertOne = async (table, row) => {
  const res = await admin(`/rest/v1/${table}`, { method: "POST", body: row, headers: { Prefer: "return=representation" } });
  assert.ok(res.status < 300, res.text);
  return res.json[0];
};

const tenantA = await insertOne("inmobiliarias", { nombre: `PG A ${run}` });
const tenantB = await insertOne("inmobiliarias", { nombre: `PG B ${run}` });
const project = await insertOne("proyectos", {
  inmobiliaria_id: tenantA.id, nombre: `PG ${run}`, comuna: "Ñuñoa", tipo: "departamento", precio_min_uf: 3000, precio_max_uf: 5000,
});

const lead = await signUp("lead");
const staffMetadata = await signUp("metadata", { role: "admin", full_name: "Atacante" });
const globalAdmin = await adminUser("global", "admin");
const tenantAdmin = await adminUser("tenant", "admin_inmobiliario", tenantA.id);
const otherAdmin = await adminUser("other", "admin_inmobiliario", tenantB.id);

await step("GoTrue: sign-up crea usuario sin tenant", async () => {
  assert.deepEqual(await profile(lead.id), { role: "usuario", inmobiliaria_id: null, reliability_status: "normal" });
});

await step("GoTrue: metadata de admin no crea staff", async () => {
  assert.equal((await profile(staffMetadata.id)).role, "usuario");
});

await step("PostgREST: un lead no cambia su rol, tenant ni reliability_status", async () => {
  for (const change of [{ role: "admin" }, { inmobiliaria_id: tenantA.id }, { reliability_status: "reactivado" }]) {
    const res = await rest(`profiles?id=eq.${lead.id}`, { token: lead.token, method: "PATCH", body: change });
    assert.equal(res.status, 403, `${JSON.stringify(change)}: ${res.text}`);
    assert.match(res.text, /profile_privilege_change_forbidden/);
  }
  assert.equal((await profile(lead.id)).role, "usuario");
});

await step("PostgREST: upsert del propio perfil, lead y staff", async () => {
  for (const [who, role] of [[lead, "usuario"], [tenantAdmin, "admin_inmobiliario"], [globalAdmin, "admin"]]) {
    const res = await rest("profiles?on_conflict=id", {
      token: who.token, method: "POST", body: { id: who.id, full_name: "Guardado", role },
      headers: { Prefer: "resolution=merge-duplicates" },
    });
    assert.ok(res.status < 300, `${role}: ${res.text}`);
  }
  assert.equal((await profile(tenantAdmin.id)).inmobiliaria_id, tenantA.id);
});

await step("PostgREST: anon no ejecuta assign_executive ni unassign_executive", async () => {
  for (const fn of ["assign_executive", "unassign_executive"]) {
    const res = await rest(`rpc/${fn}`, { method: "POST", body: { p_project_id: project.id, p_email: mail("forged") } });
    assert.equal(res.status, 401, res.text);
    assert.equal(res.json.code, "42501", res.text);
  }
});

await step("PostgREST: un lead no ejecuta assign_executive", async () => {
  const res = await rest("rpc/assign_executive", { token: lead.token, method: "POST", body: { p_project_id: project.id, p_email: mail("forged") } });
  assert.match(res.text, /No tienes permisos/);
});

await step("Edge Function: ejecutivo nuevo por GoTrue real", async () => {
  const email = mail("exec-new");
  const res = await createExecutive(tenantAdmin.token, { email, full_name: "Exec Nuevo" });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.created, true);
  assert.deepEqual(await profile(res.json.ejecutivo.id), { role: "ejecutivo", inmobiliaria_id: tenantA.id, reliability_status: "normal" });
});

await step("Edge Function: rechaza vincular a un admin global, sin cambiarlo", async () => {
  const res = await createExecutive(tenantAdmin.token, { email: globalAdmin.email, full_name: "X" });
  assert.equal(res.status, 409, res.text);
  assert.match(res.json.error, /administrador/);
  assert.deepEqual(await profile(globalAdmin.id), { role: "admin", inmobiliaria_id: null, reliability_status: "normal" });
});

await step("Edge Function: rechaza a un admin de inmobiliaria, propia u otra", async () => {
  for (const target of [otherAdmin, tenantAdmin]) {
    const res = await createExecutive(tenantAdmin.token, { email: target.email, full_name: "X" });
    assert.equal(res.status, 409, res.text);
    assert.equal((await profile(target.id)).role, "admin_inmobiliario");
  }
});

await step("Edge Function: un admin global tampoco degrada a otro admin", async () => {
  const res = await createExecutive(globalAdmin.token, { email: tenantAdmin.email, full_name: "X", inmobiliaria_id: tenantB.id });
  assert.equal(res.status, 409, res.text);
  assert.equal((await profile(tenantAdmin.id)).inmobiliaria_id, tenantA.id);
});

await step("Edge Function: un lead existente sigue vinculándose (decisión abierta de HU 28)", async () => {
  const res = await createExecutive(tenantAdmin.token, { email: lead.email, full_name: "Lead" });
  assert.equal(res.status, 200, res.text);
  assert.equal(res.json.created, false);
  assert.equal((await profile(lead.id)).role, "ejecutivo");
});

await step("Edge Function: un lead no puede invocarla", async () => {
  const res = await createExecutive(staffMetadata.token, { email: mail("x"), full_name: "X" });
  assert.equal(res.status, 403, res.text);
});

console.log(failures.length ? `\n${failures.length} fallo(s)` : "\nPASS");
process.exit(failures.length ? 1 : 0);
