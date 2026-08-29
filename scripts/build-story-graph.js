#!/usr/bin/env node
// Genera docs/story-graph.html a partir de las HU del wiki.
// El HTML es autocontenido (sin CDN ni fetch) para poder compartirlo como archivo suelto.
//
// Política de fallos:
//   - Faltas estructurales (ciclo, wikilink colgante, campo ausente, sprint desconocido) -> aborta.
//   - Hallazgos semánticos (aristas de un solo lado, dependencias hacia atrás, huérfanos) -> advierte y renderiza.

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const STORIES_DIR = path.join(ROOT, "Wiki ScoreLeads", "UserStories");
const INDEX_FILE = path.join(STORIES_DIR, "index.md");
const FINDINGS_FILE = path.join(ROOT, "Wiki ScoreLeads", "dependency-analysis.md");
const OUT_FILE = path.join(ROOT, "docs", "story-graph.html");

const LANES = ["PMV", "Sprint 1", "Sprint 2", "Sprint 3"];
const REQUIRED_FIELDS = ["Category", "Story Points", "Actor", "Status", "Sprint"];

const fatal = [];
const warn = [];

/* ------------------------------------------------------------------ parseo */

function field(text, name) {
  const re = new RegExp("^\\|\\s*\\*\\*" + name + "\\*\\*\\s*\\|(.*)\\|\\s*$", "m");
  const m = text.match(re);
  return m ? m[1].trim() : null;
}

// Los alias de Obsidian llevan `\|` dentro de celdas de tabla: capturar hasta el
// final de línea y no hasta el primer pipe, o los campos multi-enlace se truncan.
function wikilinkIds(value) {
  if (!value || value === "—") return [];
  return [...value.matchAll(/\[\[(?:\.\.\/)?(?:[^\]]*\/)?HU(\d+)-/g)].map((m) => "HU" + m[1]);
}

function section(text, heading) {
  const re = new RegExp("^## " + heading + "\\s*$", "m");
  const m = text.match(re);
  if (!m) return "";
  const rest = text.slice(m.index + m[0].length);
  const next = rest.search(/^## /m);
  return (next === -1 ? rest : rest.slice(0, next)).trim();
}

function laneOf(sprintValue) {
  const v = (sprintValue || "").trim();
  if (/^PMV/.test(v)) return 0;
  const i = LANES.indexOf(v);
  return i === -1 ? null : i;
}

function statusKey(statusValue) {
  const v = statusValue || "";
  if (v.includes("✅")) return "done";
  if (v.includes("🔜")) return "next";
  if (v.includes("🗓")) return "planned";
  return "planned";
}

function parseStory(file) {
  const text = fs.readFileSync(path.join(STORIES_DIR, file), "utf8");
  const id = "HU" + file.match(/^HU(\d+)/)[1];
  const h1 = text.match(/^#\s+(.*)$/m);
  const title = h1 ? h1[1].replace(/^HU\s*\d+\s*—\s*/, "").trim() : id;

  for (const f of REQUIRED_FIELDS) {
    if (!field(text, f)) fatal.push(`${file}: falta el campo "${f}" en la tabla Overview`);
  }

  const sprint = field(text, "Sprint");
  const lane = laneOf(sprint);
  if (lane === null) fatal.push(`${file}: valor de Sprint no reconocido: "${sprint}"`);

  // Lede: primer párrafo tras el H1, sea blockquote (> 🔜 **Sprint 1.** ...) o texto plano.
  const afterH1 = h1 ? text.slice(h1.index + h1[0].length) : text;
  const ledeRaw = afterH1.split(/\n---/)[0].trim();
  const lede = ledeRaw
    .split("\n")
    .map((l) => l.replace(/^>\s?/, "").trim())
    .filter(Boolean)
    .join(" ")
    // El lede de las HU planificadas abre con "🔜 **Sprint 1.**", que ya sale como badge.
    // Hace falta el flag u: 🔜 y 🗓 son pares suplentes y no calzan en una clase sin él.
    .replace(/^\s*\p{Extended_Pictographic}+️?\s*\*\*[^*]+\*\*\s*/u, "");

  const acs = [];
  const acSection = section(text, "Acceptance Criteria");
  const parts = acSection.split(/^### /m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf("\n");
    const head = (nl === -1 ? part : part.slice(0, nl)).trim();
    const body = (nl === -1 ? "" : part.slice(nl))
      .split(/^---\s*$/m)[0]
      .trim();
    const hm = head.match(/^(E\d+)\s*—\s*(.*)$/);
    acs.push({ code: hm ? hm[1] : head, title: hm ? hm[2] : "", body });
  }

  return {
    id,
    num: Number(id.slice(2)),
    kind: "story",
    slug: file.replace(/\.md$/, ""),
    title,
    lede,
    category: field(text, "Category"),
    sp: Number(field(text, "Story Points")) || 0,
    actor: field(text, "Actor"),
    status: field(text, "Status"),
    statusKey: statusKey(field(text, "Status")),
    sprint,
    lane,
    depends: wikilinkIds(field(text, "Depends on")),
    required: wikilinkIds(field(text, "Required by")),
    story: section(text, "User Story").replace(/^>\s?/gm, "").trim(),
    notes: section(text, "Notes"),
    why: parseWhy(section(text, "Dependencies")),
    acs,
  };
}

// "## Dependencies" lleva un bullet por dependencia aguas arriba con su porqué y
// una etiqueta documented/inferred al final. Es la fuente del texto del panel.
function parseWhy(sec) {
  const out = {};
  for (const m of sec.matchAll(/^-\s+\*\*\[\[[^\]]*?HU(\d+)-[^\]]*\]\]\*\*\s*—\s*([\s\S]*?)`([^`]+)`\s*$/gm)) {
    out["HU" + m[1]] = { text: m[2].trim(), tag: m[3].trim() };
  }
  return out;
}

function parseSpikes() {
  const text = fs.readFileSync(INDEX_FILE, "utf8");
  const block = section(text, "Spikes");
  const rows = block.split("\n").filter((l) => /^\|\s*Spike \d/.test(l));
  return rows.map((line) => {
    const c = line.split("|").map((s) => s.trim());
    const lane = laneOf(c[4]);
    if (lane === null) fatal.push(`index.md: sprint no reconocido para ${c[1]}: "${c[4]}"`);
    return {
      id: c[1].replace(/\s+/g, ""),
      kind: "spike",
      title: c[2],
      lede: "",
      sp: Number(c[3]) || 0,
      sprint: c[4],
      lane,
      statusKey: "spike",
      depends: [],
      required: [],
      acs: [],
      notes: "",
      story: "",
    };
  });
}

/* ------------------------------------------------------- carga y validación */

const files = fs.readdirSync(STORIES_DIR).filter((f) => /^HU\d+-.*\.md$/.test(f));
const stories = files.map(parseStory).sort((a, b) => a.num - b.num);
const spikes = parseSpikes();
const byId = Object.fromEntries(stories.map((s) => [s.id, s]));

for (const s of stories) {
  for (const t of [...s.depends, ...s.required]) {
    if (!byId[t]) fatal.push(`${s.slug}.md: enlace a una HU inexistente: ${t}`);
  }
}

// Unión de ambas direcciones; se recuerda quién declaró cada arista.
const edgeMap = new Map();
const addEdge = (from, to, side) => {
  if (!byId[from] || !byId[to]) return;
  const key = from + "->" + to;
  const e = edgeMap.get(key) || { from, to, byChild: false, byParent: false };
  e[side] = true;
  edgeMap.set(key, e);
};
for (const s of stories) {
  s.depends.forEach((d) => addEdge(d, s.id, "byChild"));
  s.required.forEach((r) => addEdge(s.id, r, "byParent"));
}
// "Depends on" es el campo que el equipo mantiene; "Required by" está desactualizado.
// Por eso sólo se marca como sin confirmar la arista que el hijo nunca declaró:
// que el padre no liste un dependiente es higiene del wiki, no una duda de planificación.
const edges = [...edgeMap.values()].map((e) => ({
  ...e,
  unconfirmed: !e.byChild,
  missingBackref: e.byChild && !e.byParent,
  backward: byId[e.from].lane > byId[e.to].lane,
  sameLane: byId[e.from].lane === byId[e.to].lane,
}));

// Ciclos: sin DAG el layout por carriles no significa nada.
{
  const adj = {};
  stories.forEach((s) => (adj[s.id] = []));
  edges.forEach((e) => adj[e.from].push(e.to));
  const color = {};
  const stack = [];
  const walk = (n) => {
    color[n] = 1;
    stack.push(n);
    for (const m of adj[n]) {
      if (color[m] === 1) fatal.push(`ciclo detectado: ${stack.slice(stack.indexOf(m)).join(" -> ")} -> ${m}`);
      else if (!color[m]) walk(m);
    }
    stack.pop();
    color[n] = 2;
  };
  stories.forEach((s) => !color[s.id] && walk(s.id));
}

if (fatal.length) {
  console.error("✗ No se generó nada. Faltas estructurales:");
  fatal.forEach((f) => console.error("  - " + f));
  process.exit(1);
}

const touched = new Set();
edges.forEach((e) => {
  touched.add(e.from);
  touched.add(e.to);
});
const unconfirmed = edges.filter((e) => e.unconfirmed);
const missingBackref = edges.filter((e) => e.missingBackref);
const backward = edges.filter((e) => e.backward);
const orphans = stories.filter((s) => !touched.has(s.id));
const doubleCounted = stories.filter((s) => s.statusKey === "done" && s.lane !== 0);

if (unconfirmed.length)
  warn.push(
    `${unconfirmed.length} aristas sin confirmar (sólo las declara "Required by" del padre): ` +
      unconfirmed.map((e) => `${e.from}→${e.to}`).join(", ")
  );
if (missingBackref.length)
  warn.push(
    `${missingBackref.length} aristas sin retro-referencia (el padre no las lista en "Required by"): ` +
      missingBackref.map((e) => `${e.from}→${e.to}`).join(", ")
  );
if (backward.length)
  warn.push(`${backward.length} aristas apuntan hacia atrás en el tiempo: ` + backward.map((e) => `${e.from}→${e.to}`).join(", "));
orphans.forEach((o) => warn.push(`${o.id} no tiene dependencias en ninguna dirección`));
doubleCounted.forEach((s) =>
  warn.push(`${s.id} (${s.sp} SP) está marcada como implementada pero vive en ${s.sprint}: sus SP se cuentan dos veces`)
);

/* --------------------------------------------------- hallazgos propuestos */

// dependency-analysis.md es opcional: sin él el grafo se genera igual, sólo sin
// la capa de propuestas. Nada de aquí toca las aristas declaradas.
let findings = null;
if (fs.existsSync(FINDINGS_FILE)) {
  const raw = fs.readFileSync(FINDINGS_FILE, "utf8").match(/```json scoreleads-findings-v1\n([\s\S]*?)\n```/);
  if (!raw) warn.push("dependency-analysis.md existe pero no tiene bloque `json scoreleads-findings-v1`: se omite la capa de propuestas");
  else {
    try {
      findings = JSON.parse(raw[1]);
    } catch (e) {
      warn.push("el bloque de hallazgos no es JSON válido (" + e.message + "): se omite la capa de propuestas");
    }
  }
} else {
  warn.push("no existe dependency-analysis.md: se genera sin capa de propuestas");
}

let proposed = [];
let statusFlags = {};
if (findings) {
  const declaredKeys = new Set(edges.map((e) => e.from + ">" + e.to));
  let graduated = 0;
  for (const p of findings.proposed_edges || []) {
    if (!byId[p.from] || !byId[p.to]) {
      warn.push(`hallazgo ${p.id} referencia una HU inexistente (${p.from}→${p.to}): se omite`);
      continue;
    }
    // Una propuesta que ya está declarada dejó de ser propuesta: dibujarla otra vez
    // sólo duplicaría la arista declarada. Se cuenta y se descarta.
    if (declaredKeys.has(p.from + ">" + p.to)) graduated++;
    else proposed.push(p);
  }
  if (graduated) warn.push(`${graduated} hallazgos ya están declarados en las HU: no se dibujan como propuesta`);
  for (const s of findings.status_flags || []) {
    if (!byId[s.id]) {
      warn.push(`status_flag para una HU inexistente (${s.id}): se omite`);
      continue;
    }
    // "planned" con código encontrado = va por delante del papel; "next" sin nada = va por detrás.
    // El avance parcial sobre trabajo ya comprometido es normal y no se marca.
    const covered = (s.covered || []).length;
    const mark = s.wiki === "planned" && covered > 0 ? "ahead" : s.wiki === "next" && covered === 0 ? "behind" : null;
    statusFlags[s.id] = { ...s, mark };
  }
}
const marked = Object.values(statusFlags).filter((s) => s.mark);
if (proposed.length)
  warn.push(
    `capa de propuestas: ${proposed.filter((p) => p.type === "blocks").length} blocks + ` +
      `${proposed.filter((p) => p.type === "enhances").length} enhances` +
      (proposed.some((p) => p.alreadyDeclared) ? ` (${proposed.filter((p) => p.alreadyDeclared).length} ya declarada)` : "")
  );

/* ------------------------------------------------------------------ layout */

const NODE_W = 200;
const NODE_H = 46;
const ROW_PITCH = 58;
const SUB_GAP = 40; // entre subcolumnas de un mismo sprint
const LANE_GAP = 92; // entre sprints: mayor que SUB_GAP para que el carril siga leyéndose como grupo
const PAD_L = 44;
const PAD_R = 44;
const HEADER_H = 84;
const TOP = HEADER_H + 20;
const MAX_SUBCOLS = 4;

const nodes = [...spikes, ...stories];
const nodeById = Object.fromEntries(nodes.map((n) => [n.id, n]));
const lanes = LANES.map((_, i) => nodes.filter((n) => n.lane === i));

// Profundidad intra-carril por camino más largo: la subcolumna es "cuántas HU del
// mismo sprint hay que terminar antes". Con el tope, todo lo más hondo se apila en
// la última subcolumna y sus aristas vuelven al arco lateral.
const clamped = [];
lanes.forEach((members, L) => {
  const intra = edges.filter((e) => nodeById[e.from].lane === L && nodeById[e.to].lane === L);
  const parentsOf = (id) => intra.filter((e) => e.to === id).map((e) => e.from);
  const raw = {};
  const calc = (id, seen) => {
    if (raw[id] != null) return raw[id];
    const ps = parentsOf(id);
    return (raw[id] = ps.length ? 1 + Math.max(...ps.map((p) => calc(p, seen))) : 0);
  };
  members.forEach((n) => calc(n.id));
  const needed = Math.max(0, ...members.map((n) => raw[n.id])) + 1;
  if (needed > MAX_SUBCOLS) {
    const deep = members.filter((n) => raw[n.id] >= MAX_SUBCOLS - 1).map((n) => n.id);
    clamped.push({ lane: LANES[L], needed, deep });
  }
  members.forEach((n) => (n.sub = Math.min(raw[n.id], MAX_SUBCOLS - 1)));
});

const subCount = lanes.map((members) => Math.max(0, ...members.map((n) => n.sub)) + 1);
const laneWidth = subCount.map((c) => c * NODE_W + (c - 1) * SUB_GAP);
const laneX = [];
laneWidth.reduce((acc, w, i) => ((laneX[i] = acc), acc + w + LANE_GAP), PAD_L);
const subX = (lane, sub) => laneX[lane] + sub * (NODE_W + SUB_GAP);

// Las columnas de ordenamiento vertical son ahora (carril, subcolumna).
const groups = [];
lanes.forEach((members, L) => {
  for (let s = 0; s < subCount[L]; s++) {
    const g = members.filter((n) => n.sub === s);
    if (g.length) groups.push(g);
  }
});
groups.forEach((g) =>
  g.sort((a, b) => (a.kind === b.kind ? (a.num || 0) - (b.num || 0) : a.kind === "spike" ? -1 : 1))
);

const rowOf = {};
const reindex = () => groups.forEach((g) => g.forEach((n, i) => (rowOf[n.id] = i)));
reindex();

const neighbours = {};
nodes.forEach((n) => (neighbours[n.id] = []));
edges.forEach((e) => {
  neighbours[e.from].push(e.to);
  neighbours[e.to].push(e.from);
});

// Barycenter sobre todos los vecinos de otra subcolumna: ahora los vecinos del mismo
// sprint también cuentan, que es lo que acerca cada hijo intra-sprint a su padre.
const sameGroup = (a, b) => a.lane === b.lane && a.sub === b.sub;
for (let sweep = 0; sweep < 24; sweep++) {
  const order = sweep % 2 ? [...groups].reverse() : groups;
  for (const g of order) {
    const bary = new Map();
    for (const n of g) {
      if (n.kind === "spike") {
        bary.set(n.id, -1);
        continue;
      }
      const ys = neighbours[n.id].filter((m) => !sameGroup(nodeById[m], n)).map((m) => rowOf[m]);
      bary.set(n.id, ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : rowOf[n.id]);
    }
    g.sort((a, b) => bary.get(a.id) - bary.get(b.id) || rowOf[a.id] - rowOf[b.id]);
    reindex();
  }
}

nodes.forEach((n) => {
  n.x = subX(n.lane, n.sub);
  n.y = TOP + rowOf[n.id] * ROW_PITCH;
});

const maxRows = Math.max(...groups.map((g) => g.length));
const W = PAD_L + laneWidth.reduce((a, b) => a + b, 0) + (LANES.length - 1) * LANE_GAP + PAD_R;
const H = TOP + maxRows * ROW_PITCH + 28;

clamped.forEach((c) =>
  warn.push(
    `${c.lane} necesita ${c.needed} subcolumnas y el tope es ${MAX_SUBCOLS}: ` +
      `${c.deep.join(", ")} quedan apiladas en la última y sus aristas vuelven al arco lateral`
  )
);

/* ----------------------------------------------------------------- render */

const esc = (s) =>
  String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function mdInline(src) {
  let t = esc(src);
  t = t.replace(/\[\[([^\]]+)\]\]/g, (_, inner) => {
    const [target, label] = inner.split(/\\?\|/);
    const hu = /HU(\d+)-/.exec(target);
    const text = (label || target).trim();
    return hu && nodeById["HU" + hu[1]]
      ? `<a class="xref" data-go="HU${hu[1]}" href="#HU${hu[1]}">${text}</a>`
      : `<span class="xref-ext">${text}</span>`;
  });
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  // Después de negritas: los `*` que quedan son cursivas (las citas de los porqués).
  t = t.replace(/\*([^*\n]+)\*/g, "<em>$1</em>");
  return t;
}

function mdBlock(src) {
  const out = [];
  let inList = false;
  for (const raw of String(src || "").split("\n")) {
    const line = raw.trim();
    if (!line || /^---$/.test(line)) {
      if (inList) (out.push("</ul>"), (inList = false));
      continue;
    }
    const bullet = /^[-*]\s+(.*)$/.exec(line);
    if (bullet) {
      if (!inList) (out.push("<ul>"), (inList = true));
      out.push("<li>" + mdInline(bullet[1]) + "</li>");
    } else {
      if (inList) (out.push("</ul>"), (inList = false));
      out.push("<p>" + mdInline(line.replace(/^>\s?/, "")) + "</p>");
    }
  }
  if (inList) out.push("</ul>");
  return out.join("");
}

// El trazado es puramente geométrico: con subcolumnas, una arista intra-sprint ya
// avanza hacia la derecha como cualquier otra. El arco lateral queda sólo para el
// caso topado, donde origen y destino comparten subcolumna y por tanto la misma x.
function edgePath(e) {
  const a = nodeById[e.from];
  const b = nodeById[e.to];
  const ay = a.y + NODE_H / 2;
  const by = b.y + NODE_H / 2;
  if (a.x === b.x) {
    const x = a.x;
    return `M${x},${ay} C${x - 52},${ay} ${x - 52},${by} ${x},${by}`;
  }
  if (b.x < a.x) {
    const sx = a.x;
    const tx = b.x + NODE_W;
    const dx = Math.max(48, (sx - tx) * 0.45);
    return `M${sx},${ay} C${sx - dx},${ay} ${tx + dx},${by} ${tx},${by}`;
  }
  const sx = a.x + NODE_W;
  const tx = b.x;
  const dx = Math.max(44, (tx - sx) * 0.45);
  return `M${sx},${ay} C${sx + dx},${ay} ${tx - dx},${by} ${tx},${by}`;
}

const edgeSvg = edges
  .map((e) => {
    const cls = ["edge"];
    if (e.unconfirmed) cls.push("one-sided");
    if (e.backward) cls.push("backward");
    return `<path class="${cls.join(" ")}" data-from="${e.from}" data-to="${e.to}" d="${edgePath(e)}" marker-end="url(#${e.backward ? "arrow-back" : "arrow"})"><title>${e.from} → ${e.to}${e.unconfirmed ? " (unconfirmed)" : ""}${e.backward ? " (backward across sprints)" : ""}</title></path>`;
  })
  .join("\n");

// Las propuestas se dibujan sobre el layout ya calculado: no participan en el
// ordenamiento. Si una apunta hacia atrás es justamente la señal de que aceptarla
// obligaría a reordenar ese sprint.
const proposedReorder = proposed.filter((p) => nodeById[p.to].x <= nodeById[p.from].x);
if (proposedReorder.length)
  warn.push(
    `${proposedReorder.length} propuestas apuntan hacia atrás en el layout actual (aceptarlas reordenaría su sprint): ` +
      proposedReorder.map((p) => `${p.id} ${p.from}→${p.to}`).join(", ")
  );

const proposedSvg = proposed
  .map((p) => {
    const cls = ["prop", p.type, p.alreadyDeclared ? "confirms" : ""].filter(Boolean).join(" ");
    const tip = `${p.id}: ${p.from} → ${p.to} · proposed ${p.type} · ${p.basis}${p.alreadyDeclared ? " · confirms a declared edge" : ""}`;
    return `<path class="${cls}" data-from="${p.from}" data-to="${p.to}" data-pid="${p.id}" d="${edgePath({
      from: p.from,
      to: p.to,
    })}" marker-end="url(#arrow-prop)"><title>${esc(tip)}</title></path>`;
  })
  .join("\n");

const nodeSvg = nodes
  .map((n) => {
    const label = n.kind === "spike" ? n.id.replace(/(\d)/, " $1") : n.id.replace(/HU(\d+)/, "HU $1");
    const short = n.kind === "spike" ? n.title.split(":")[0] : n.title;
    const f = statusFlags[n.id];
    const marker = f && f.mark
      ? `<g class="flag ${f.mark}"><circle cx="${NODE_W - 8}" cy="${NODE_H - 8}" r="5.5"></circle>
  <text x="${NODE_W - 8}" y="${NODE_H - 5}" text-anchor="middle">${f.mark === "ahead" ? "↑" : "!"}</text></g>`
      : "";
    return `<g class="node ${n.statusKey} ${n.kind}" data-id="${n.id}" transform="translate(${n.x},${n.y})" tabindex="0" role="button" aria-label="${esc(label + " — " + n.title)}">
  <rect class="box" width="${NODE_W}" height="${NODE_H}" rx="${n.kind === "spike" ? 2 : 7}"></rect>
  <text class="nid" x="11" y="19">${esc(label)}</text>
  <text class="sp" x="${NODE_W - 11}" y="19" text-anchor="end">${n.sp} SP</text>
  <text class="ntitle" x="11" y="35">${esc(short.length > 30 ? short.slice(0, 29) + "…" : short)}</text>
  ${marker}
  <title>${esc(n.title)}</title>
</g>`;
  })
  .join("\n");

const headerSvg = LANES.map((lane, i) => {
  const col = lanes[i];
  const sp = col.reduce((a, n) => a + n.sp, 0);
  const sub = subCount[i];
  return `<g class="lane-head" transform="translate(${laneX[i]},34)">
  <text class="lane-name" x="0" y="0">${lane}</text>
  <text class="lane-meta" x="0" y="18">${col.length} items · ${sp} SP${sub > 1 ? ` · ${sub} dependency levels` : ""}</text>
</g>`;
}).join("\n");

const laneBands = LANES.map(
  (_, i) =>
    `<rect class="band" x="${laneX[i] - 18}" y="12" width="${laneWidth[i] + 36}" height="${H - 24}" rx="10"></rect>`
).join("\n");

const payload = {};
for (const n of nodes) {
  payload[n.id] = {
    id: n.id,
    kind: n.kind,
    title: n.title,
    lede: n.lede ? mdInline(n.lede) : "",
    sprint: n.sprint,
    status: n.status || "Spike de investigación",
    category: n.category || "Spike",
    sp: n.sp,
    actor: n.actor || "—",
    story: n.story ? mdBlock(n.story) : "",
    notes: n.notes ? mdBlock(n.notes) : "",
    acs: n.acs.map((a) => ({ code: a.code, title: a.title, body: mdBlock(a.body) })),
    up: edges
      .filter((e) => e.to === n.id)
      .map((e) => ({
        id: e.from,
        oneSided: e.unconfirmed,
        why: (n.why || {})[e.from] ? mdInline((n.why || {})[e.from].text) : null,
        tag: (n.why || {})[e.from] ? (n.why || {})[e.from].tag : null,
        backward: e.backward,
      })),
    down: edges.filter((e) => e.from === n.id).map((e) => ({ id: e.to, oneSided: e.unconfirmed })),
    propUp: proposed.filter((p) => p.to === n.id).map((p) => ({ ...p, dir: "up" })),
    propDown: proposed.filter((p) => p.from === n.id).map((p) => ({ ...p, dir: "down" })),
    flag: statusFlags[n.id] || null,
  };
}

let commit = "sin git";
try {
  commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], { cwd: ROOT }).toString().trim();
} catch {}

const totalAcs = stories.reduce((a, s) => a + s.acs.length, 0);
const stamp = new Date().toISOString().slice(0, 16).replace("T", " ");

const html = `<!doctype html>
<!-- GENERATED by scripts/build-story-graph.js — do not edit by hand. Edit the HU markdown and re-run \`make story-graph\`. -->
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ScoreLeads — Story Dependency Graph</title>
<style>
:root{
  --bg:#f7f8fa; --ink:#1c2530; --muted:#6b7785; --line:#d6dbe2; --panel:#fff;
  --done-bg:#e6f4ea; --done-br:#2e7d32; --next-bg:#e4f0fb; --next-br:#1565c0;
  --plan-bg:#f2f4f7; --plan-br:#98a2b0; --spike-bg:#f4ecfa; --spike-br:#7b3fa0;
  --edge:#c2cad3; --edge-hot:#33414f; --amber:#e08600;
  --prop:#7c4dff; --ahead:#00867d; --behind:#c62828;
}
*{box-sizing:border-box}
html,body{margin:0;height:100%}
/* Flujo normal en columna: el header envuelve a anchos chicos y su alto varía,
   así que reservarle una altura fija dejaba el grafo por debajo del encabezado. */
body{background:var(--bg);color:var(--ink);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;
  display:flex;flex-direction:column}
header.top{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:baseline;gap:8px 18px;padding:14px 22px;background:var(--panel);border-bottom:1px solid var(--line)}
header.top h1{font-size:16px;margin:0;font-weight:650;letter-spacing:-.01em}
.counts{color:var(--muted);font-size:12.5px}
.counts b{color:var(--amber);font-weight:650}
.legend{display:flex;flex-wrap:wrap;gap:12px;margin-left:auto;font-size:12px;color:var(--muted);align-items:center}
.legend i{display:inline-block;width:11px;height:11px;border-radius:3px;border:1.5px solid;margin-right:5px;vertical-align:-1px}
.legend .l-done i{background:var(--done-bg);border-color:var(--done-br)}
.legend .l-next i{background:var(--next-bg);border-color:var(--next-br)}
.legend .l-plan i{background:var(--plan-bg);border-color:var(--plan-br)}
.legend .l-spike i{background:var(--spike-bg);border-color:var(--spike-br);border-radius:0}
.legend svg{vertical-align:-2px}

#canvas{flex:1 1 auto;min-height:0;overflow:auto;transition:padding-right .18s ease}
body.open #canvas{padding-right:428px}
svg.graph{display:block;margin:14px auto 40px}
/* Fit: el viewBox hace el escalado, así que basta soltar el ancho fijo. */
body.fit svg.graph{width:100%;height:auto;max-width:100%;margin:14px 0 20px}
body.fit #canvas{overflow-x:hidden}
.zoom{display:flex;gap:0;border:1px solid var(--line);border-radius:6px;overflow:hidden}
.zoom button{border:none;background:var(--panel);color:var(--muted);font:inherit;font-size:11.5px;font-weight:650;
  padding:3px 11px;cursor:pointer}
.zoom button+button{border-left:1px solid var(--line)}
.zoom button[aria-pressed="true"]{background:var(--next-bg);color:var(--next-br)}
#zprop[aria-pressed="true"]{background:#efe7ff;color:var(--prop)}
.prop-key .dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:5px;vertical-align:-1px}
.prop-key .dot.ahead{background:var(--ahead)}
.prop-key .dot.behind{background:var(--behind)}
.why{border:1px solid var(--line);border-left:3px solid var(--next-br);border-radius:0 6px 6px 0;padding:8px 10px;margin-bottom:7px;background:#fcfdfe}
.why .wh{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.why .wb{font-size:12px;color:#43505d;margin-top:5px;line-height:1.5}
.why .wb.none{font-style:italic;color:var(--muted)}
.wtag{font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 6px;border-radius:3px}
.wtag.doc{background:#e6f4ea;color:#1d5c26}
.wtag.inf{background:#fff3e0;color:#8a5200}
.wtag.back{background:#fdeaea;color:#a02020}
.prop-item{border-left:3px solid var(--prop);background:#faf7ff;padding:8px 10px;border-radius:0 6px 6px 0;margin-bottom:7px}
.prop-item .ph{font-size:12px;font-weight:700;color:var(--prop)}
.prop-item .pb{font-size:11.5px;color:#4a5561;margin-top:3px}
.prop-item .tag{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#7a869a;margin-left:6px}
.flagbox{border-radius:7px;padding:9px 11px;margin-bottom:8px;font-size:12.5px}
.flagbox.ahead{background:#e4f4f2;border-left:3px solid var(--ahead)}
.flagbox.behind{background:#fdeaea;border-left:3px solid var(--behind)}
.flagbox.plain{background:#f2f4f7;border-left:3px solid var(--muted)}
.flagbox b{display:block;margin-bottom:4px}
.flagbox code{font-size:11px;background:#fff;display:inline-block;margin:1px 2px 1px 0}

.band{fill:#fff;stroke:var(--line);stroke-width:1}
.lane-name{font-size:13.5px;font-weight:650;fill:var(--ink)}
.lane-meta{font-size:11.5px;fill:var(--muted)}

.edge{fill:none;stroke:var(--edge);stroke-width:1.5;transition:stroke .12s,stroke-width .12s,opacity .12s}
.edge.one-sided{stroke-dasharray:5 4}
.edge.backward{stroke:var(--amber);stroke-width:1.9;opacity:.85}
.node .box{fill:var(--plan-bg);stroke:var(--plan-br);stroke-width:1.5;transition:filter .12s}
.node.done .box{fill:var(--done-bg);stroke:var(--done-br)}
.node.next .box{fill:var(--next-bg);stroke:var(--next-br)}
.node.spike .box{fill:var(--spike-bg);stroke:var(--spike-br);stroke-dasharray:4 3}
.node{cursor:pointer;outline:none}
.node .nid{font-size:12px;font-weight:700;fill:var(--ink)}
.node .sp{font-size:10.5px;fill:var(--muted);font-weight:600}
.node .ntitle{font-size:11px;fill:#48535f}
.node.spike .ntitle{font-style:italic}
.node:hover .box,.node:focus-visible .box{filter:brightness(.97)}

/* Capa de propuestas: apagada por defecto, para que el grafo abra mostrando
   sólo lo que el equipo declaró. */
.prop{fill:none;stroke:var(--prop);stroke-width:1.8;opacity:0;pointer-events:none;transition:opacity .15s}
.prop.enhances{stroke-width:1.4;stroke-dasharray:2 5;opacity:0}
.prop.blocks{stroke-dasharray:9 4}
.prop.confirms{stroke-dasharray:none}
body.props .prop{opacity:.85;pointer-events:auto}
body.props .prop.enhances{opacity:.55}
.flag circle{stroke:#fff;stroke-width:1.5}
.flag text{font-size:8px;font-weight:800;fill:#fff}
.flag.ahead circle{fill:var(--ahead)}
.flag.behind circle{fill:var(--behind)}
svg.graph.sel .prop{opacity:0}
body.props svg.graph.sel .prop.rel{opacity:.9}

svg.graph.sel .node{opacity:.22}
svg.graph.sel .edge{opacity:.09}
svg.graph.sel .node.rel{opacity:1}
svg.graph.sel .edge.rel{opacity:1;stroke:var(--edge-hot);stroke-width:2.1}
svg.graph.sel .edge.rel.backward{stroke:var(--amber)}
svg.graph.sel .node.cur .box{stroke-width:3}

aside{position:fixed;top:0;right:0;width:428px;height:100%;background:var(--panel);border-left:1px solid var(--line);
  transform:translateX(100%);transition:transform .18s ease;overflow:auto;padding:20px 22px 60px}
body.open aside{transform:none}
aside h2{font-size:17px;margin:0 0 4px;letter-spacing:-.01em}
aside .lede{color:var(--muted);font-size:12.5px;margin:0 0 12px}
.badges{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px}
.badge{font-size:11px;padding:2.5px 8px;border-radius:20px;background:#eef1f5;color:#41505f;font-weight:600}
.badge.st-done{background:var(--done-bg);color:#1d5c26}
.badge.st-next{background:var(--next-bg);color:#0f4c8f}
.badge.st-spike{background:var(--spike-bg);color:#5c2b7a}
aside h3{font-size:11px;text-transform:uppercase;letter-spacing:.07em;color:var(--muted);margin:20px 0 8px;font-weight:700}
blockquote.story{margin:0;padding:11px 13px;background:#f4f6f9;border-left:3px solid var(--next-br);border-radius:0 6px 6px 0;font-size:13px}
blockquote.story p{margin:0}
.chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:11.5px;padding:3px 9px;border-radius:5px;border:1px solid var(--line);background:#fbfcfd;cursor:pointer;font-weight:600;color:#38434f}
.chip:hover{border-color:var(--next-br);color:var(--next-br)}
.chip.unconfirmed{border-style:dashed}
.chip.unconfirmed::after{content:" ?";color:var(--amber)}
.none{color:var(--muted);font-size:12.5px;font-style:italic}
.ac{border:1px solid var(--line);border-radius:7px;padding:10px 12px;margin-bottom:8px;background:#fcfdfe}
.ac .code{font-size:11px;font-weight:700;color:var(--next-br);letter-spacing:.03em}
.ac .actitle{font-size:12.5px;font-weight:650;margin:1px 0 6px}
.ac p{margin:0 0 3px;font-size:12.5px;color:#3c4652}
.ac strong{color:var(--ink)}
details.notes{margin-top:6px}
details.notes summary{cursor:pointer;font-size:12px;color:var(--muted);font-weight:600}
details.notes ul{margin:8px 0 0;padding-left:18px;font-size:12.5px;color:#3c4652}
details.notes li{margin-bottom:5px}
code{background:#eef1f5;padding:1px 4px;border-radius:3px;font-size:11.5px}
.xref{color:var(--next-br);text-decoration:none;font-weight:600}
.xref:hover{text-decoration:underline}
.xref-ext{color:var(--muted)}
.close{position:absolute;top:14px;right:16px;border:none;background:none;font-size:20px;line-height:1;color:var(--muted);cursor:pointer}
.close:hover{color:var(--ink)}
footer.stamp{flex:0 0 auto;padding:6px 22px;font-size:10.5px;color:#9aa4b0;background:var(--panel);border-top:1px solid var(--line)}
@media print{aside,.close{display:none}body{display:block;height:auto}#canvas{padding:0;overflow:visible}}
</style>
</head>
<body>

<header class="top">
  <h1>ScoreLeads — Story Dependency Graph</h1>
  <span class="counts">${stories.length} stories · ${spikes.length} spikes · ${edges.length} edges · ${totalAcs} acceptance criteria &nbsp;|&nbsp; <b>${backward.length} cross-sprint</b> · <b>${unconfirmed.length} unconfirmed</b> · <b>${orphans.length} isolated</b></span>
  <span class="legend">
    <span class="l-done"><i></i>Implemented</span>
    <span class="l-next"><i></i>Committed</span>
    <span class="l-plan"><i></i>Planned</span>
    <span class="l-spike"><i></i>Spike</span>
    <span><svg width="26" height="9"><line x1="0" y1="4.5" x2="26" y2="4.5" stroke="#c2cad3" stroke-width="1.6" stroke-dasharray="5 4"/></svg> unconfirmed</span>
    <span><svg width="26" height="9"><line x1="0" y1="4.5" x2="26" y2="4.5" stroke="#e08600" stroke-width="2"/></svg> backward</span>
    ${proposed.length
      ? `<span class="prop-key"><svg width="26" height="9"><line x1="0" y1="4.5" x2="26" y2="4.5" stroke="#7c4dff" stroke-width="1.8" stroke-dasharray="9 4"/></svg> proposed</span>
    <span class="prop-key"><i class="dot ahead"></i>ahead of status</span>
    <span class="prop-key"><i class="dot behind"></i>behind status</span>`
      : ""}
    <span class="zoom">${proposed.length ? `<button id="zprop" aria-pressed="false">Proposals</button>` : ""}<button id="z100" aria-pressed="true">100%</button><button id="zfit" aria-pressed="false">Fit</button></span>
  </span>
</header>

<div id="canvas">
<svg class="graph" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <marker id="arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0.5 L8,4 L0,7.5 z" fill="currentColor"></path>
    </marker>
    <marker id="arrow-back" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0.5 L8,4 L0,7.5 z" fill="#e08600"></path>
    </marker>
    <marker id="arrow-prop" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M0,0.5 L8,4 L0,7.5 z" fill="#7c4dff"></path>
    </marker>
  </defs>
  <g class="bands">${laneBands}</g>
  <g class="heads">${headerSvg}</g>
  <g class="edges" color="#c2cad3">${edgeSvg}</g>
  <g class="proposals">${proposedSvg}</g>
  <g class="nodes">${nodeSvg}</g>
</svg>
</div>

<aside aria-live="polite">
  <button class="close" aria-label="Close">&times;</button>
  <div id="panel"></div>
</aside>

<footer class="stamp">Generated ${stamp} · source commit ${commit} · scripts/build-story-graph.js</footer>

<script>
var DATA = ${JSON.stringify(payload)};
var svg = document.querySelector('svg.graph');
var body = document.body;
var panel = document.getElementById('panel');
var current = null;

var up = {}, down = {};
Object.keys(DATA).forEach(function (id) {
  up[id] = DATA[id].up.map(function (x) { return x.id; });
  down[id] = DATA[id].down.map(function (x) { return x.id; });
});

function reach(id, map) {
  var seen = {}, stack = [id];
  while (stack.length) {
    var n = stack.pop();
    (map[n] || []).forEach(function (m) { if (!seen[m]) { seen[m] = 1; stack.push(m); } });
  }
  return seen;
}

function badge(text, cls) {
  return text ? '<span class="badge ' + (cls || '') + '">' + text + '</span>' : '';
}

function why(list) {
  if (!list.length) return '<div class="none">No upstream dependencies.</div>';
  return list.map(function (d) {
    var tag = d.tag ? '<span class="wtag ' + (/inferred/.test(d.tag) ? 'inf' : 'doc') + '">' + d.tag + '</span>' : '';
    var back = d.backward ? '<span class="wtag back">crosses sprints backward</span>' : '';
    return '<div class="why"><div class="wh"><button class="chip" data-go="' + d.id + '">' +
      d.id.replace(/HU(\\d+)/, 'HU $1') + '</button>' + tag + back + '</div>' +
      (d.why ? '<div class="wb">' + d.why + '</div>' : '<div class="wb none">No rationale recorded.</div>') + '</div>';
  }).join('');
}

function chips(list) {
  if (!list.length) return '<div class="none">none</div>';
  return '<div class="chips">' + list.map(function (d) {
    return '<button class="chip' + (d.oneSided ? ' unconfirmed' : '') + '" data-go="' + d.id + '">' +
      d.id.replace(/HU(\\d+)/, 'HU $1') + '</button>';
  }).join('') + '</div>';
}

function render(id) {
  var d = DATA[id];
  var stKey = d.kind === 'spike' ? 'st-spike' : (/✅/.test(d.status) ? 'st-done' : (/🔜/.test(d.status) ? 'st-next' : ''));
  var h = '<h2>' + d.id.replace(/HU(\\d+)/, 'HU $1').replace(/Spike(\\d+)/, 'Spike $1') + ' — ' + d.title + '</h2>';
  if (d.lede) h += '<p class="lede">' + d.lede + '</p>';
  h += '<div class="badges">' + badge(d.sprint) + badge(d.status, stKey) + badge(d.category) +
       badge(d.sp + ' SP') + badge(d.actor) + '</div>';
  if (d.story) h += '<h3>User story</h3><blockquote class="story">' + d.story + '</blockquote>';
  h += '<h3>Depends on (' + d.up.length + ')</h3>' + why(d.up);
  h += '<h3>Required by (' + d.down.length + ')</h3>' + chips(d.down);
  if (d.flag) {
    var f = d.flag;
    var cls = f.mark || 'plain';
    var head = f.mark === 'ahead' ? 'Implementation found — status says planned'
      : f.mark === 'behind' ? 'No implementation found' : 'Implementation evidence';
    h += '<h3>Implementation</h3><div class="flagbox ' + cls + '"><b>' + head + '</b>';
    if (f.covered && f.covered.length) h += 'Appears covered: ' + f.covered.join(', ') + '<br>';
    if (f.not_located && f.not_located.length) h += 'Not located: ' + f.not_located.join(', ') + '<br>';
    if (f.note) h += f.note + '<br>';
    if (f.evidence && f.evidence.length)
      h += f.evidence.map(function (x) { return '<code>' + x + '</code>'; }).join(' ');
    h += '</div>';
  }
  var props = (d.propUp || []).concat(d.propDown || []);
  if (props.length) {
    h += '<h3>Proposed (' + props.length + ')</h3>';
    h += props.map(function (p) {
      var other = p.dir === 'up' ? p.from : p.to;
      var arrow = p.dir === 'up' ? '← depends on ' : '→ required by ';
      return '<div class="prop-item"><div class="ph">' + p.id + ' ' + arrow +
        '<button class="chip" data-go="' + other + '">' + other.replace(/HU(\\d+)/, 'HU $1') + '</button>' +
        '<span class="tag">' + p.type + ' · ' + p.basis + (p.backward ? ' · backward' : '') + '</span></div>' +
        '<div class="pb">' + p.evidence + '</div></div>';
    }).join('');
  }
  if (d.acs.length) {
    h += '<h3>Acceptance criteria (' + d.acs.length + ')</h3>';
    h += d.acs.map(function (a) {
      return '<div class="ac"><div class="code">' + a.code + '</div><div class="actitle">' + a.title + '</div>' + a.body + '</div>';
    }).join('');
  } else if (d.kind === 'spike') {
    h += '<h3>Acceptance criteria</h3><div class="none">Research spike — no acceptance criteria defined.</div>';
  }
  if (d.notes) h += '<h3>Notes</h3><details class="notes"><summary>Show notes</summary>' + d.notes + '</details>';
  panel.innerHTML = h;
  panel.scrollTop = 0;
  document.querySelector('aside').scrollTop = 0;
}

function select(id) {
  if (!DATA[id]) return;
  current = id;
  var anc = reach(id, up), desc = reach(id, down);
  var lit = {}; lit[id] = 1;
  Object.keys(anc).forEach(function (k) { lit[k] = 1; });
  Object.keys(desc).forEach(function (k) { lit[k] = 1; });

  svg.classList.add('sel');
  svg.querySelectorAll('.node').forEach(function (n) {
    var nid = n.getAttribute('data-id');
    n.classList.toggle('rel', !!lit[nid]);
    n.classList.toggle('cur', nid === id);
  });
  svg.querySelectorAll('.edge').forEach(function (e) {
    e.classList.toggle('rel', !!lit[e.getAttribute('data-from')] && !!lit[e.getAttribute('data-to')]);
  });
  // Las propuestas no entran en el alcance transitivo: sólo se encienden las que
  // tocan directamente el nodo elegido, para no mezclar propuesta con declarado.
  svg.querySelectorAll('.prop').forEach(function (e) {
    var a = e.getAttribute('data-from'), b = e.getAttribute('data-to');
    var touches = a === id || b === id;
    e.classList.toggle('rel', touches);
    if (touches) { lit[a] = 1; lit[b] = 1; }
  });
  svg.querySelectorAll('.node').forEach(function (n) {
    if (lit[n.getAttribute('data-id')]) n.classList.add('rel');
  });

  render(id);
  body.classList.add('open');
  if (history.replaceState) history.replaceState(null, '', '#' + id);
}

function clear() {
  current = null;
  svg.classList.remove('sel');
  svg.querySelectorAll('.rel,.cur').forEach(function (e) { e.classList.remove('rel', 'cur'); });
  body.classList.remove('open');
  if (history.replaceState) history.replaceState(null, '', location.pathname + location.search);
}

svg.addEventListener('click', function (ev) {
  var g = ev.target.closest('.node');
  if (g) select(g.getAttribute('data-id')); else clear();
});
svg.addEventListener('keydown', function (ev) {
  if (ev.key !== 'Enter' && ev.key !== ' ') return;
  var g = ev.target.closest('.node');
  if (g) { ev.preventDefault(); select(g.getAttribute('data-id')); }
});
document.addEventListener('click', function (ev) {
  var go = ev.target.closest('[data-go]');
  if (go) { ev.preventDefault(); select(go.getAttribute('data-go')); }
});
document.querySelector('.close').addEventListener('click', clear);
document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') clear(); });

var z100 = document.getElementById('z100'), zfit = document.getElementById('zfit');
function setZoom(fit) {
  body.classList.toggle('fit', fit);
  z100.setAttribute('aria-pressed', String(!fit));
  zfit.setAttribute('aria-pressed', String(fit));
}
z100.addEventListener('click', function () { setZoom(false); });
zfit.addEventListener('click', function () { setZoom(true); });

var zprop = document.getElementById('zprop');
if (zprop) zprop.addEventListener('click', function () {
  var on = !body.classList.contains('props');
  body.classList.toggle('props', on);
  zprop.setAttribute('aria-pressed', String(on));
  if (current) select(current);
});

var hash = (location.hash || '').replace('#', '');
if (DATA[hash]) select(hash);
</script>
</body>
</html>
`;

fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
fs.writeFileSync(OUT_FILE, html, "utf8");

console.log(
  `✓ ${stories.length} stories · ${spikes.length} spikes · ${edges.length} edges · ${totalAcs} acceptance criteria`
);
warn.forEach((w) => console.log("⚠ " + w));
console.log(
  `→ ${path.relative(ROOT, OUT_FILE).replace(/\\/g, "/")}  (gitignored, ${Math.round(Buffer.byteLength(html) / 1024)} KB)`
);
