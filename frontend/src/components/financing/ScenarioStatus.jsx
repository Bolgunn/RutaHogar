import React from "react";

const money = (value) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 0 }).format(Math.round(Number(value) || 0));
const oneDecimal = (value) => Number(value || 0).toLocaleString("es-CL", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

function statusConfig(status) {
  if (status === "Compatible") return { label: "Compatible", tone: "compatible", message: "Tu escenario se encuentra dentro de los rangos referenciales considerados." };
  if (status === "Cercano") return { label: "Cercano", tone: "near", message: "Tu escenario es viable como referencia, pero hay algunos aspectos que podrían ajustarse." };
  return { label: "Requiere ajuste", tone: "adjustment", message: "Tu escenario requiere ajustes para acercarse a los rangos referenciales considerados." };
}

function Metric({ icon, label, value, detail, tone }) {
  const indicatorIcon = tone === "compatible" ? "ti-check" : "ti-exclamation-mark";
  return <article className="scenario-status__metric"><span className="scenario-status__metric-icon"><i className={`ti ${icon}`} aria-hidden="true" /><b className={`is-${tone}`}><i className={`ti ${indicatorIcon}`} aria-hidden="true" /></b></span><div><small>{label}</small><strong>{value}</strong>{detail ? <span>{detail}</span> : null}</div></article>;
}

export default function ScenarioStatus({ result, ufReference }) {
  if (!result) return null;
  const status = statusConfig(result.financial_status);
  const price = Number(result.precio_clp) || 0;
  const pie = Number(result.pie_clp) || 0;
  const ufValue = Number(ufReference?.uf_value_clp || result.uf_reference?.uf_value_clp) || 0;
  const pieUf = ufValue > 0 ? pie / ufValue : 0;
  const piePercent = price > 0 ? (pie / price) * 100 : 0;
  const income = Number(result.renta_total_clp) || 0;
  const burden = income > 0 ? (Number(result.dividendo_clp || 0) / income) * 100 : 0;
  const message = result.reasons?.[0] || status.message;
  const explanation = result.financial_status === "Compatible"
    ? `Con un pie de ${oneDecimal(piePercent)}%, financiarías ${money(result.credito_clp)}. El dividendo estimado es ${money(result.dividendo_clp)} y representa ${oneDecimal(burden)}% de los ingresos considerados; se mantiene dentro de los rangos referenciales de RutaHogar.`
    : `Con un pie de ${oneDecimal(piePercent)}%, financiarías ${money(result.credito_clp)}. El dividendo estimado es ${money(result.dividendo_clp)} y representa ${oneDecimal(burden)}% de los ingresos considerados. ${result.reasons?.[0] || status.message}`;

  return <section className={`scenario-status scenario-status--${status.tone}`} aria-labelledby="scenario-status-title">
    <h3 id="scenario-status-title">Estado del escenario</h3>
    <article className="scenario-status__card">
      <header className="scenario-status__header"><span className="scenario-status__badge">{status.label}</span><div><strong>Estado del escenario</strong><p>{message}</p></div></header>
      <div className="scenario-status__metrics">
        <Metric icon="ti-home" label="Pie" value={`${oneDecimal(piePercent)}%`} detail={`${oneDecimal(pieUf)} UF`} tone={status.tone} />
        <Metric icon="ti-coins" label="Dividendo" value={money(result.dividendo_clp)} detail="/ mes" tone={status.tone} />
        <Metric icon="ti-chart-bar" label="Carga financiera" value={`${oneDecimal(burden)}%`} detail="de tus ingresos" tone={status.tone} />
      </div>
      <div className="scenario-status__accordions"><details><summary>Entender este resultado</summary><p>{explanation}</p></details></div>
    </article>
  </section>;
}
