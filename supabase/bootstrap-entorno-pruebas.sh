#!/usr/bin/env bash
# Levanta el esquema completo de RutaHogar en un proyecto Supabase VACÍO de pruebas.
#
#   DATABASE_URL='postgresql://postgres.<ref>:<clave>@<host>:5432/postgres' \
#     bash supabase/bootstrap-entorno-pruebas.sh
#
# Usa la cadena "Session pooler" de Project Settings → Database (IPv4). Nunca la
# commitees. psql corre dentro de Docker, así que no hace falta instalarlo.
#
# Por qué tres pasadas (docs/database.md, "Las dos fuentes de verdad"):
#   1. schema.sql crea casi todo. check_function_bodies = off deja crear funciones
#      que nombran tablas definidas más abajo en el archivo, como hace pg_dump.
#   2. Las migraciones agregan lo que schema.sql no tiene (HU 25 incluida). Dos
#      migraciones antiguas fallan porque schema.sql ya trae su versión nueva.
#   3. schema.sql otra vez: algunas funciones solo tienen su versión vigente en
#      schema.sql (p. ej. can_admin_inmobiliaria con admin_inmobiliario) y la
#      pasada 2 las dejó con la versión antigua de una migración.
set -uo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "Falta DATABASE_URL (cadena Session pooler del proyecto de PRUEBAS)." >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PROD_URL="$(grep -h '^VITE_SUPABASE_URL=' "$ROOT/frontend/.env" 2>/dev/null | cut -d= -f2-)"
PROD_REF="$(sed -E 's#https://([^.]+)\..*#\1#' <<<"$PROD_URL")"
if [[ -n "$PROD_REF" && "$DATABASE_URL" == *"$PROD_REF"* ]]; then
  echo "DATABASE_URL apunta al proyecto de frontend/.env ($PROD_REF). Este script es solo para pruebas." >&2
  exit 1
fi

psql_run() {
  docker run --rm -i -e PGCONNECT_TIMEOUT=15 postgres:16-alpine psql "$DATABASE_URL" -q -v ON_ERROR_STOP=0 "$@"
}

if ! psql_run -Atc "select 1" >/dev/null; then
  echo "No se pudo conectar. Revisa la cadena (Session pooler) y la clave." >&2
  exit 1
fi

existing="$(psql_run -Atc "select count(*) from information_schema.tables where table_schema = 'public' and table_name = 'profiles'")"
if [[ "$existing" != "0" ]]; then
  echo "La base ya tiene public.profiles: este script es para un proyecto vacío." >&2
  exit 1
fi

LOG="$(mktemp)"
schema_pass() {
  { echo "set check_function_bodies = off;"; cat "$ROOT/supabase/schema.sql"; } | psql_run 2>>"$LOG" >/dev/null
}

echo "1/3 schema.sql"
schema_pass
echo "2/3 migraciones"
for file in "$ROOT"/supabase/migrations/*.sql; do
  { echo "set check_function_bodies = off;"; cat "$file"; } | psql_run 2>>"$LOG" >/dev/null
done
echo "3/3 schema.sql de nuevo"
schema_pass
psql_run -c "notify pgrst, 'reload schema';" >/dev/null

echo
echo "Errores registrados (los de migraciones antiguas ya cubiertas por schema.sql son esperables):"
grep ERROR "$LOG" | sort | uniq -c | sort -rn | head -20
echo
echo "Comprobación de HU 25:"
rm -f "$LOG"
check="$(psql_run -Atc "select (select count(*) from pg_proc where proname = 'importar_proyectos') = 1
  and coalesce(pg_get_functiondef(to_regprocedure('public.can_admin_inmobiliaria(uuid)')) like '%admin_inmobiliario%', false)")"
if [[ "$check" != "t" ]]; then
  echo "FALLÓ: falta importar_proyectos o can_admin_inmobiliaria no acepta admin_inmobiliario." >&2
  exit 1
fi
echo "ok: importar_proyectos existe y can_admin_inmobiliaria acepta admin_inmobiliario."
