export function buildAdminHomeSummary(evaluations = [], projects = []) {
  const counts = { total: evaluations.length, alto: 0, medio: 0, bajo: 0, sinDato: 0, review: 0 };
  const communes = new Map();
  for (const item of evaluations) {
    const key = { Alto: "alto", Medio: "medio", Bajo: "bajo" }[item.result?.classification] || "sinDato";
    counts[key] += 1;
    if (["sospechoso", "en_revision"].includes(item.reliability_status)) counts.review += 1;
    const commune = item.input?.comuna_objetivo || item.onboarding?.comuna_interes;
    if (commune) communes.set(commune, (communes.get(commune) || 0) + 1);
  }
  const projectCounts = { total: projects.length, disponibles: 0, construccion: 0, agotados: 0, conCobertura: 0, activeUncovered: 0 };
  for (const project of projects) {
    const key = { disponible: "disponibles", en_construccion: "construccion", agotado: "agotados" }[project.estado];
    if (key) projectCounts[key] += 1;
    const covered = (project.ejecutivos || []).some((item) => item.estado === "vinculado");
    if (covered) projectCounts.conCobertura += 1;
    if (!covered && ["disponible", "en_construccion"].includes(project.estado)) projectCounts.activeUncovered += 1;
  }
  const dateValue = (value) => { const date = value ? new Date(value).getTime() : NaN; return Number.isFinite(date) ? date : 0; };
  const recent = [...evaluations].sort((a, b) => dateValue(b.created_at) - dateValue(a.created_at)).slice(0, 6);
  const latestProjectDate = projects.reduce((latest, item) => {
    const candidate = dateValue(item.updated_at) || dateValue(item.created_at);
    return Math.max(latest, candidate);
  }, 0);
  return { counts, projectCounts, recent, latestLeadDate: recent[0]?.created_at || null, latestProjectDate: latestProjectDate || null, topCommunes: [...communes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3) };
}
