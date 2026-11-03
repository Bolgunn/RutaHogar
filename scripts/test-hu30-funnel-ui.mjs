// Isolated UI contract test: no hosted Supabase, credentials or production calls.
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "../frontend/node_modules/vite/dist/node/index.js";
import { chromium } from "../frontend/node_modules/playwright/index.mjs";
import { computeFunnelMetrics } from "../frontend/src/lib/commercial/funnelMetrics.js";

process.env.VITE_SUPABASE_URL = "http://metrics-fixture.invalid";
process.env.VITE_SUPABASE_PUBLISHABLE_KEY = "fixture-only-not-a-production-key";
const project = { id: "ca300000-0000-0000-0000-000000000003", nombre: "Proyecto A", comuna: "Macul", tipo: "casa", precio_min_uf: 1000, precio_max_uf: 2000, estado: "disponible" };
const evaluation = { input: { complemento_renta: true, ingreso_mensual_complementario: 987654321, ahorro_disponible: 30000000, comuna_objetivo: "Macul" }, onboarding: { tipo_propiedad: "casa" }, result: { classification: "Alto", blockers: [], commercial_priority_detail: { action_key: "contact_now" }, financial_indicators: { capacidad_compra_estimada_uf: 2800, ingreso_total: 999999999, capacidad_status: "ok", capacidad_supuestos: { uf_value_clp: 40695, ratio_dividendo_max: 0.3, ratio_dividendo_saludable: 0.25 } } } };
const fact = { lead_id: "PRIVATE_SENTINEL", first_evaluation_at: "2026-10-01T12:00:00Z", evaluacion_actual: evaluation, evaluaciones: [{ at: "2026-10-01T12:00:00Z", project_goal_id: project.id }], proyectos: [project.id], postulaciones: [], stage_events: [], plan: null, favoritos: [], progress_update_ats: [], confirmed_goal_ats: [] };
const now = "2026-10-30T12:00:00Z";
const html = '<html><body><div id="root"></div><script type="module" src="/__metrics-entry.js"></script></body></html>';
const server = await createServer({ root: fileURLToPath(new URL("../frontend", import.meta.url)), configFile: false,
  server: { host: "127.0.0.1", port: 0, hmr: false }, plugins: [{ name: "hu30-metrics-fixture",
    resolveId(id) { if (id === "/__metrics-entry.js") return "\0hu30-metrics-entry"; },
    load(id) { if (id === "\0hu30-metrics-entry") return `import React from "react"; import {createRoot} from "react-dom/client"; import Panel from "/src/components/CommercialMetrics.jsx"; const root=createRoot(document.getElementById("root")); window.mountMetrics=key=>root.render(React.createElement(Panel,{key,role:"admin_inmobiliario"})); window.mountMetrics("A");`; },
    configureServer(vite) { vite.middlewares.use(async (req, res, next) => { if (req.url !== "/__metrics") return next(); res.setHeader("Content-Type", "text/html"); res.end(await vite.transformIndexHtml(req.url, html)); }); },
  }] });
let browser;
try {
  await server.listen(); const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ headless: true }); const page = await browser.newPage();
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  let hidden = false, delay = false, refreshAt = null, requests = 0;
  await page.route("http://metrics-fixture.invalid/**", async route => {
    const request = route.request();
    const headers = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Headers": "authorization,apikey,x-client-info,content-type,x-supabase-api-version", "Access-Control-Allow-Methods": "POST,OPTIONS", "Cache-Control": "private, no-store" };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    assert(request.url().endsWith("/functions/v1/commercial-funnel-metrics"), "unexpected external call");
    requests++; const controls = request.postDataJSON();
    assert.deepEqual(Object.keys(controls).sort(), ["filtros", "granularidad"]);
    const isHidden = hidden; const wait = delay; delay = false;
    const facts = [{ ...fact, evaluacion_actual: isHidden ? { input: {}, onboarding: {}, result: {}, co_debtor_visibility: "hidden" } : evaluation }];
    const body = JSON.stringify({ now, proyectos: [project], total_leads: 1, privacy_hidden: isHidden ? 1 : 0, refresh_at: refreshAt,
      metrics: computeFunnelMetrics({ facts, proyectos: [project], now, ...controls }) });
    assert(!/987654321|999999999|PRIVATE_SENTINEL|financial_indicators|evaluacion_actual/.test(body));
    if (wait) await new Promise(resolve => setTimeout(resolve, 1500));
    await route.fulfill({ status: 200, headers, contentType: "application/json", body });
  });
  await page.goto(origin + "/__metrics");
  await page.getByRole("status").filter({ hasText: "1 de 1 leads" }).waitFor();
  await page.getByRole("button", { name: "Compatible", exact: true }).click();
  await page.getByRole("button", { name: "Compatible", exact: true }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Compatible", exact: true }).getAttribute("aria-pressed"), "true");
  await page.getByRole("tab", { name: "Evoluciones históricas", exact: true }).click();
  console.log("PASS real HU15 panel renders aggregate response and preserves filter results");
  // A late response from an old mounted actor must not overwrite the new scope.
  delay = true;
  await page.getByRole("button", { name: "Compatible", exact: true }).click();
  await page.getByText("Cargando métricas…", { exact: true }).waitFor();
  hidden = true;
  await page.evaluate(() => window.mountMetrics("B"));
  await page.getByRole("status").filter({ hasText: "antecedentes financieros protegidos" }).waitFor();
  await new Promise(resolve => setTimeout(resolve, 1700));
  assert.match(await page.getByRole("status").innerText(), /antecedentes financieros protegidos/);
  console.log("PASS actor remount discards the previous scope's delayed response");
  hidden = false; refreshAt = new Date(Date.now() + 1800).toISOString();
  await page.evaluate(() => window.mountMetrics("C"));
  await page.getByRole("status").filter({ hasText: "1 de 1 leads" }).waitFor();
  hidden = true; refreshAt = null;
  await page.getByRole("status").filter({ hasText: "antecedentes financieros protegidos" }).waitFor();
  console.log("PASS server cutoff invalidates and refreshes the displayed aggregate");
  assert(requests >= 6); assert.deepEqual(errors, []);
} catch (error) { console.error(error.message); throw error; } finally { if (browser) await browser.close(); await server.close(); }
