import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PRIORITY_ACTIONS, priorityKeyFromDetail } from "../priorityActions";

const constantsUrl = new URL("../../../../../backend/app/scoring_engine/constants.py", import.meta.url);

function commercialActionsFromPython() {
  const source = readFileSync(fileURLToPath(constantsUrl), "utf-8");
  const block = source.match(/^COMMERCIAL_ACTIONS\s*=\s*\{([\s\S]*?)^\}/m);
  if (!block) throw new Error("COMMERCIAL_ACTIONS not found in constants.py");
  return Object.fromEntries([...block[1].matchAll(/"([^"]+)"\s*:\s*"([^"]+)"/g)].map(([, key, label]) => [key, label]));
}

describe("priorityKeyFromDetail (ALG-18 R1b)", () => {
  it("P1 prefers a known action_key", () => {
    expect(priorityKeyFromDetail({ action_key: "nurture", action: "Contactar ahora" })).toEqual({ key: "nurture", reconocida: true });
  });

  it("P2 maps a stored label to its key", () => {
    expect(priorityKeyFromDetail({ level: "Contactar ahora", action: "Contactar ahora" })).toEqual({ key: "contact_now", reconocida: true });
    expect(priorityKeyFromDetail({ action_key: "desconocida", action: "No derivar todavía" })).toEqual({ key: "do_not_route", reconocida: true });
  });

  it("P3 no detail or no action → sin_prioridad, not counted as unrecognised", () => {
    expect(priorityKeyFromDetail(undefined)).toEqual({ key: "sin_prioridad", reconocida: true });
    expect(priorityKeyFromDetail(null)).toEqual({ key: "sin_prioridad", reconocida: true });
    expect(priorityKeyFromDetail({ reason: "x" })).toEqual({ key: "sin_prioridad", reconocida: true });
  });

  it("P4 an unknown label → sin_prioridad and unrecognised", () => {
    expect(priorityKeyFromDetail({ action: "Contactar de inmediato" })).toEqual({ key: "sin_prioridad", reconocida: false });
  });
});

describe("PRIORITY_ACTIONS parity with constants.py", () => {
  it("has the same six keys and labels as COMMERCIAL_ACTIONS", () => {
    const python = commercialActionsFromPython();
    expect(Object.keys(python)).toHaveLength(6);
    expect(PRIORITY_ACTIONS).toEqual(python);
  });
});
