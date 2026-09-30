import { beforeEach, describe, expect, it } from "vitest";
import { addFavorite, getFavorites, localProvider, removeFavorite } from "../favoritesService";

// No hay jsdom en el proyecto (guardrail 1 de CLAUDE.md: no agregar
// dependencias sin necesidad concreta) y el proveedor local solo necesita
// localStorage, así que se le da uno en memoria.
function installLocalStorage() {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
    clear: () => store.clear(),
  };
}

const USUARIO = "11111111-1111-1111-1111-111111111111";
const OTRO_USUARIO = "22222222-2222-2222-2222-222222222222";
const PROYECTO = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTRO_PROYECTO = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

describe("favoritesService — proveedor local", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("parte sin favoritos", () => {
    expect(localProvider.get(USUARIO)).toEqual([]);
  });

  it("guarda un favorito y lo devuelve", () => {
    localProvider.add(USUARIO, PROYECTO);
    expect(localProvider.get(USUARIO)).toEqual([PROYECTO]);
  });

  // La PK compuesta hace el toggle idempotente en Supabase; el proveedor local
  // tiene que comportarse igual o el estado diverge según el entorno.
  it("agregar dos veces el mismo proyecto no lo duplica", () => {
    localProvider.add(USUARIO, PROYECTO);
    localProvider.add(USUARIO, PROYECTO);
    expect(localProvider.get(USUARIO)).toEqual([PROYECTO]);
  });

  it("quitar un favorito que no existe no falla ni altera el resto", () => {
    localProvider.add(USUARIO, PROYECTO);
    localProvider.remove(USUARIO, OTRO_PROYECTO);
    expect(localProvider.get(USUARIO)).toEqual([PROYECTO]);
  });

  it("soporta quitar y volver a agregar", () => {
    localProvider.add(USUARIO, PROYECTO);
    localProvider.remove(USUARIO, PROYECTO);
    expect(localProvider.get(USUARIO)).toEqual([]);

    localProvider.add(USUARIO, PROYECTO);
    expect(localProvider.get(USUARIO)).toEqual([PROYECTO]);
  });

  // Sin Supabase varias cuentas comparten el mismo navegador.
  it("no mezcla los favoritos de dos usuarios", () => {
    localProvider.add(USUARIO, PROYECTO);
    localProvider.add(OTRO_USUARIO, OTRO_PROYECTO);

    expect(localProvider.get(USUARIO)).toEqual([PROYECTO]);
    expect(localProvider.get(OTRO_USUARIO)).toEqual([OTRO_PROYECTO]);
  });

  it("tolera un localStorage corrupto", () => {
    localStorage.setItem("scoreleads_proyecto_favoritos", "no es json");
    expect(localProvider.get(USUARIO)).toEqual([]);
  });

  // Un id guardado que ya no está en el catálogo no puede reventar la lectura:
  // los favoritos de la versión anterior eran ids del mock ("proj-1"…).
  it("devuelve ids huérfanos tal cual; filtrarlos es del catálogo", () => {
    localProvider.add(USUARIO, "proj-1");
    localProvider.add(USUARIO, PROYECTO);
    expect(localProvider.get(USUARIO)).toEqual(["proj-1", PROYECTO]);
  });
});

// Estas validaciones ocurren antes de elegir proveedor, así que valen en
// cualquier entorno.
describe("favoritesService — validación de argumentos", () => {
  beforeEach(() => {
    installLocalStorage();
  });

  it("devuelve vacío sin usuario", async () => {
    expect(await getFavorites(null)).toEqual([]);
  });

  it("rechaza escrituras sin usuario o sin proyecto", async () => {
    await expect(addFavorite(null, PROYECTO)).rejects.toThrow();
    await expect(removeFavorite(USUARIO, "")).rejects.toThrow();
  });
});
