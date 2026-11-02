export function filterReportHistory(history, search, status) {
  const term = search.trim().toLocaleLowerCase("es");
  return history.filter((item) => {
    const searchMatches = !term || [item.lead_name, item.lead_email, item.reason].some((value) => String(value || "").toLocaleLowerCase("es").includes(term));
    const statusMatches = status === "todos" || item.new_status === status || (status === "silenciado" && item.new_status === "descartado") || (status === "reactivado" && item.new_status === "normal");
    return searchMatches && statusMatches;
  }).sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0));
}

export function leadFromReport(item, history = [], evaluations = []) {
  if (!item.profile_id) return null;
  const latestEvaluation = evaluations.filter((entry) => entry.user_id === item.profile_id || entry.id === item.profile_id)
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0];
  const latestEvent = history.filter((entry) => entry.profile_id === item.profile_id)
    .sort((a, b) => (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0))[0];
  return {
    ...latestEvaluation,
    id: latestEvaluation?.id || item.profile_id,
    user_id: item.profile_id,
    full_name: item.lead_name || latestEvaluation?.full_name,
    email: item.lead_email || latestEvaluation?.email,
    reliability_status: latestEvent?.new_status || latestEvaluation?.reliability_status,
  };
}
