#!/usr/bin/env node
// Compara supabase/schema.sql contra supabase/migrations/*.sql.
//
// Las dos rutas definen los mismos objetos: schema.sql levanta un entorno nuevo,
// las migraciones actualizan el hosteado. Como las policies usan drop + create,
// una migracion que reescribe una policy deja schema.sql declarando la version
// vieja del MISMO nombre y nada falla: los dos entornos simplemente dejan de
// coincidir. Este script hace visible esa deriva. Ver docs/database.md.
//
// Politica de fallos:
//   - Objeto declarado por una migracion y ausente de schema.sql   -> falta (exit 1).
//   - Mismo nombre en ambos con cuerpo distinto                    -> divergencia (exit 1).
//   - Migracion sin rollback                                       -> advierte, no aborta.
//
// Uso: node scripts/check-schema-drift.js

const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..", "supabase");
const ESQUEMA = path.join(RAIZ, "schema.sql");
const MIGRACIONES = path.join(RAIZ, "migrations");
const ROLLBACKS = path.join(RAIZ, "rollback");

// Los comentarios explican, no definen: dos cuerpos que solo difieren en
// comentarios o espacios son el mismo predicado.
const normalizar = (texto) =>
  texto.replace(/--[^\n]*/g, " ").replace(/\s+/g, " ").trim();

function objetos(sql) {
  const encontrados = new Map();
  const policy = /create policy\s+"([^"]+)"([\s\S]*?);\s*\n/g;
  const funcion = /create or replace function\s+(public\.\w+)\s*\(([^)]*)\)([\s\S]*?)\$\$;/g;
  for (const m of sql.matchAll(policy)) {
    encontrados.set(`policy ${m[1]}`, normalizar(m[2]));
  }
  for (const m of sql.matchAll(funcion)) {
    encontrados.set(`function ${m[1]}`, normalizar(m[3]));
  }
  return encontrados;
}

const leer = (p) => fs.readFileSync(p, "utf8");

const enEsquema = objetos(leer(ESQUEMA));
const archivos = fs.readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql")).sort();
const conRollback = new Set(
  fs.readdirSync(ROLLBACKS).map((f) => f.replace(/_rollback\.sql$/, ".sql")),
);

const faltantes = [];
const divergentes = [];
const sinRollback = [];

// Las migraciones corren en orden y se pisan entre si: una policy reescrita tres
// veces solo debe compararse en su ULTIMA definicion, que es la que queda viva en
// el hosteado. Comparar cada migracion por separado marcaria como divergente todo
// lo que fue superado despues, que es ruido.
const ultimaDefinicion = new Map();
for (const archivo of archivos) {
  const declarados = objetos(leer(path.join(MIGRACIONES, archivo)));
  for (const [nombre, cuerpo] of declarados) ultimaDefinicion.set(nombre, { archivo, cuerpo });
}

// El rollback no depende de lo que la migracion declare. Condicionarlo a que
// hubiera policies o funciones dejaba fuera justo a las que crean tablas,
// agregan columnas o siembran datos -- donde revertir importa mas y es mas
// dificil de improvisar despues.
for (const archivo of archivos) {
  if (!conRollback.has(archivo)) sinRollback.push(archivo);
}

for (const [nombre, { archivo, cuerpo }] of ultimaDefinicion) {
  if (!enEsquema.has(nombre)) faltantes.push({ archivo, nombre });
  else if (enEsquema.get(nombre) !== cuerpo) divergentes.push({ archivo, nombre });
}

if (faltantes.length) {
  console.log(`\nAusentes de schema.sql (${faltantes.length}):`);
  console.log("  Un entorno levantado desde schema.sql no tiene estos objetos.");
  for (const { archivo, nombre } of faltantes) console.log(`    ${nombre}\n      declarado por ${archivo}`);
}

if (divergentes.length) {
  console.log(`\nMismo nombre, cuerpo distinto (${divergentes.length}):`);
  console.log("  El hosteado y un entorno nuevo se comportan distinto.");
  for (const { archivo, nombre } of divergentes) console.log(`    ${nombre}\n      la ultima definicion es de ${archivo}`);
}

if (sinRollback.length) {
  // El "de N" no es adorno: si el chequeo vuelve a filtrarse por lo que la
  // migracion declara, la resta deja de cuadrar y se ve en la misma linea.
  console.log(
    `\nAdvertencia — ${sinRollback.length} de ${archivos.length} migraciones sin rollback:`,
  );
  for (const archivo of sinRollback) console.log(`    ${archivo}`);
}

const roto = faltantes.length + divergentes.length;
console.log(
  roto === 0
    ? `\nschema.sql refleja las ${archivos.length} migraciones.`
    : `\n${roto} objeto(s) de policy/funcion fuera de sincronia (${faltantes.length} ausente(s), ${divergentes.length} divergente(s)).\nReflejalos en schema.sql, en el mismo commit que la migracion.`,
);
process.exit(roto === 0 ? 0 : 1);
