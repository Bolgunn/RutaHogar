// Etapa comercial global de un lead a partir de sus registros (general + uno por proyecto).
// Implementa ALG-18 R3 (filas O1–O5) y la causa de pérdida G8, tal como están escritas en
// docs/algorithms/ALG-18-commercial-funnel-metrics.md. Única implementación: la insignia del
// lead la usa hoy y funnelMetrics.js (HU 15) la llama en cada paso de su repetición.
//
// records: [{ proyecto_id: string | null, stage, at, por_sistema }], uno por registro existente:
// su etapa vigente, más el instante y por_sistema de su último evento. [] = sin registros.
import { DEFAULT_STAGE, STAGES } from "./stageRules";

const RANKED = STAGES.map((stage) => stage.value).filter((value) => value !== "perdido");

function rank(stage) {
  const index = RANKED.indexOf(stage);
  return index === -1 ? null : index + 1;
}

function instant(value) {
  return new Date(value).getTime();
}

function lossCause(holdingRecords) {
  return holdingRecords.every((record) => record.por_sistema === true) ? "por_agotamiento" : "por_gestion";
}

export function overallStage(records = []) {
  const leadLevel = records.find((record) => record.proyecto_id == null);
  const projects = records.filter((record) => record.proyecto_id != null);

  if (!leadLevel && !projects.length) return { stage: DEFAULT_STAGE, causa: null };

  if (!projects.length) {
    const stage = leadLevel.stage;
    return { stage, causa: stage === "perdido" ? lossCause([leadLevel]) : null };
  }

  if (projects.every((record) => record.stage === "perdido")) {
    const latestLoss = Math.max(...projects.map((record) => instant(record.at)));
    if (leadLevel && leadLevel.stage !== "perdido" && instant(leadLevel.at) > latestLoss) {
      return { stage: leadLevel.stage, causa: null };
    }
    return { stage: "perdido", causa: lossCause(projects) };
  }

  const best = records
    .filter((record) => rank(record.stage) !== null)
    .reduce((top, record) => (rank(record.stage) > rank(top.stage) ? record : top));
  return { stage: best.stage, causa: null };
}
