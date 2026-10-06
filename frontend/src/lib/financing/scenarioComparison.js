const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

function benefitLabel(snapshot) {
  const benefit = snapshot?.result_snapshot?.benefit || snapshot?.benefit_catalogue_snapshot?.benefit || {};
  if (!benefit?.selected) return "Sin subsidio seleccionado";
  return benefit?.entry?.name || benefit?.entry?.title || benefit.selected;
}

export function historicalScenarioView(snapshot) {
  const input = snapshot?.input_snapshot || {};
  const result = snapshot?.result_snapshot || {};
  const ufValue = number(result?.uf_reference?.uf_value_clp || snapshot?.market_reference_snapshot?.selected_uf?.uf_value_clp);
  const pie = number(result.pie_clp);
  const price = number(result.precio_clp);
  const income = number(result.renta_total_clp);
  const complementaryIncome = input.usar_renta_complementaria !== false ? number(input.renta_complementaria_clp) : 0;
  const burden = number(result?.ratios?.total_burden_ratio) || (income > 0 ? (number(input.deuda_mensual_clp) + number(result.dividendo_clp)) / income : 0);
  return {
    id: snapshot?.id,
    name: snapshot?.name || "Escenario sin nombre",
    status: result.financial_status || "Requiere ajuste",
    project: snapshot?.project_snapshot?.nombre || input?.project?.nombre || "Vivienda manual",
    price,
    priceUf: number(result.precio_uf || input.precio_uf),
    pie,
    pieUf: ufValue > 0 ? pie / ufValue : 0,
    piePercent: price > 0 ? (pie / price) * 100 : 0,
    benefit: benefitLabel(snapshot),
    benefitAmount: number(result.subsidio_principal_clp),
    credit: number(result.credito_clp),
    term: number(input.plazo_anios),
    annualRate: number(input.tasa_anual) * 100,
    dividend: number(result.dividendo_clp),
    income,
    complementaryIncome,
    burdenPercent: burden * 100,
    horizon: input.fecha_compra || "No indicado",
  };
}

const rounded = (value) => Math.round(number(value) * 10) / 10;

export function scenarioDifferences(leftSnapshot, rightSnapshot) {
  const left = historicalScenarioView(leftSnapshot);
  const right = historicalScenarioView(rightSnapshot);
  const differences = [];
  const pieGap = rounded(Math.abs(left.pieUf - right.pieUf));
  if (pieGap > 0) differences.push(`${left.pieUf > right.pieUf ? left.name : right.name} requiere ${pieGap.toLocaleString("es-CL", { maximumFractionDigits: 1 })} UF más de pie.`);
  const dividendGap = Math.abs(left.dividend - right.dividend);
  if (dividendGap > 0) differences.push(`El dividendo difiere en $${Math.round(dividendGap).toLocaleString("es-CL")} mensuales.`);
  const termGap = Math.abs(left.term - right.term);
  if (termGap > 0) differences.push(`${left.term > right.term ? left.name : right.name} tiene ${termGap} años más de plazo.`);
  if (left.complementaryIncome !== right.complementaryIncome) {
    const scenario = left.complementaryIncome > right.complementaryIncome ? left : right;
    if (scenario.complementaryIncome > 0) differences.push(`${scenario.name} considera $${Math.round(scenario.complementaryIncome).toLocaleString("es-CL")} de renta complementaria.`);
  }
  if (left.benefitAmount !== right.benefitAmount || left.benefit !== right.benefit) {
    if (left.benefitAmount <= 0 && right.benefitAmount > 0) differences.push(`Solo ${right.name} incorpora ${right.benefit} por $${Math.round(right.benefitAmount).toLocaleString("es-CL")}.`);
    else if (right.benefitAmount <= 0 && left.benefitAmount > 0) differences.push(`Solo ${left.name} incorpora ${left.benefit} por $${Math.round(left.benefitAmount).toLocaleString("es-CL")}.`);
    else if (left.benefit !== right.benefit) differences.push(`Los escenarios incluyen beneficios distintos: ${left.benefit} y ${right.benefit}.`);
    else differences.push(`${left.benefit} difiere en $${Math.round(Math.abs(left.benefitAmount - right.benefitAmount)).toLocaleString("es-CL")}.`);
  }
  if (rounded(left.annualRate) !== rounded(right.annualRate)) differences.push(`La tasa referencial difiere en ${Math.abs(left.annualRate - right.annualRate).toLocaleString("es-CL", { maximumFractionDigits: 2 })} puntos porcentuales.`);
  return differences;
}
