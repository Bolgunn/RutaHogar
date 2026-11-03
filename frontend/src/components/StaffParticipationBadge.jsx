import React from "react";
import { staffEvaluationType, staffTypeLabels } from "../lib/commercial/bipersonalProjection";
const historyLabels = {
  historical_consent_revoked: "Histórica · consentimiento revocado",
  historical_participation_replaced: "Histórica · participación reemplazada",
};
export default function StaffParticipationBadge({ projection }) {
  const type = staffEvaluationType(projection);
  return <><span className={`status-pill staff-participation-badge is-${type || "unknown"}`}>{staffTypeLabels[type] || "Participación no disponible"}</span>{(projection?.warnings || []).filter((code) => historyLabels[code]).map((code) => <small className="staff-participation-history" key={code}>{historyLabels[code]}</small>)}</>;
}
