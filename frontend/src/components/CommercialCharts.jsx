import React, { useEffect, useRef, useState } from "react";

const rateText = (value) => value == null ? "— sin datos" : `${Math.round(value * 100)} %`;
// Conservative spacing for the chart's 12px type, including long dates and sample sizes.
const textWidth = (text) => Array.from(String(text)).length * 9;

export function chartLayout({ periods, series, width, format, rate = false, secondaryAxis = false }) {
  const values = periods.flatMap((period) => series.map((serie) => serie.value(period))).filter((value) => value != null);
  const max = rate ? 1 : Math.max(1, ...values);
  const left = Math.max(60, textWidth(rate ? "100 %" : Math.round(max)) + 18);
  const right = secondaryAxis ? 64 : 18;
  const maxLabelLength = width < 500 ? 14 : 24;
  const labelWidth = Math.max(0, ...periods.map((period) => textWidth(String(period.label).slice(0, maxLabelLength))));
  const valueWidth = rate ? 0 : Math.max(0, ...periods.flatMap((period) => series.map((serie) => {
    const value = serie.value(period);
    return textWidth(value == null ? "—" : format(value, period));
  })));
  const canvasWidth = width;
  const groupWidth = (canvasWidth - left - right) / Math.max(1, periods.length);
  const labelStride = Math.max(1, Math.ceil((labelWidth * 2 + 24) / groupWidth));
  const showValues = !secondaryAxis && groupWidth * .8 / Math.max(1, series.length) >= valueWidth + 18;
  return { max, left, right, canvasWidth, groupWidth, labelStride, showValues, maxLabelLength };
}

function useChartWidth(fallback) {
  const ref = useRef(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => { const measured = element.parentElement?.clientWidth; if (measured > 0) setWidth(measured); };
    measure();
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(measure) : null;
    observer?.observe(element.parentElement || element);
    window.addEventListener("resize", measure);
    return () => { observer?.disconnect(); window.removeEventListener("resize", measure); };
  }, []);
  return [ref, width];
}

function PeriodLabel({ period, i, x, height, left, right, canvasWidth, groupWidth, periodCount, labelStride, maxLabelLength }) {
  const last = i === periodCount - 1 && i !== 0;
  const labelSpace = maxLabelLength * 9 + 12;
  if (last && canvasWidth - left - right < labelSpace * 2) return null;
  if (!last && i % labelStride !== 0) return null;
  if (i !== 0 && !last && (periodCount - 1 - i) * groupWidth < labelSpace * 2) return null;
  const label = String(period.label);
  return <text x={i === 0 ? left : last ? canvasWidth - right : x(i)} y={height - 14} textAnchor={i === 0 ? "start" : last ? "end" : "middle"}>
    {label.length > maxLabelLength ? `${label.slice(0, maxLabelLength - 1)}…` : label}<title>{label}</title>
  </text>;
}

function ChartFrame({ label, periods, series, format, rateLine, children }) {
  const columns = rateLine ? [...series, rateLine] : series;
  return <div className="cm-chart-frame">
    <div className="cm-chart-viewport">
      {children}
    </div>
    <details className="cm-chart-data">
      <summary>Ver todos los valores</summary>
      <div className="cm-scroll">
        <table className="cm-table">
          <caption>{label}</caption>
          <thead><tr><th scope="col">Período</th>{columns.map((serie) => <th scope="col" key={serie.key || serie.name}>{serie.name}</th>)}</tr></thead>
          <tbody>{periods.map((period) => <tr key={period.clave}>
            <th scope="row">{period.label}{period.en_curso ? " · En curso" : ""}</th>
            {columns.map((serie) => {
              const value = serie.value(period);
              return <td key={serie.key || serie.name}>{value == null ? "— sin datos" : serie === rateLine ? rateText(value) : format(value, period)}{serie.detail && <small className="cm-chart-detail">{serie.detail(period)}</small>}</td>;
            })}
          </tr>)}</tbody>
        </table>
      </div>
    </details>
  </div>;
}

function Axis({ max, left, right, width, y, rate = false }) {
  // Integer counts must not repeat 0 or 1 when the maximum is small.
  const ticks = [...new Set([0, rate ? .5 : Math.round(max / 2), max])];
  return ticks.map((value) => <g key={value}>
    <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} stroke="#E8E5DF" />
    <text x={left - 12} y={y(value) + 4} textAnchor="end">{rate ? rateText(value) : value}</text>
  </g>);
}

function CurrentPeriod({ period, i, left, groupWidth, top, plotHeight }) {
  return period.en_curso && <rect x={left + groupWidth * i + Math.min(3, groupWidth / 4)} y={top} width={Math.max(.1, groupWidth - Math.min(6, groupWidth / 2))} height={plotHeight} rx="3" fill="none" stroke="#D4A843" strokeDasharray="5 4" />;
}

// Keep gaps for missing rates; values are available on each point and in the table.
export function RateChart({ periods, series, width, height, label }) {
  const [containerRef, availableWidth] = useChartWidth(width);
  const { left, right, canvasWidth, groupWidth, labelStride, maxLabelLength } = chartLayout({ periods, series, width: availableWidth, rate: true });
  const top = 26, bottom = 44, plotHeight = height - top - bottom;
  const x = (i) => left + groupWidth * (i + .5);
  const y = (value) => top + plotHeight * (1 - value);
  return <ChartFrame label={label} periods={periods} series={series} format={rateText}>
    <svg ref={containerRef} className="cm-chart" style={{ width: "100%", height }} viewBox={`0 0 ${canvasWidth} ${height}`} role="img" aria-label={label}>
      <Axis max={1} left={left} right={right} width={canvasWidth} y={y} rate />
      {periods.map((period, i) => <g key={period.clave}>
        <CurrentPeriod {...{ period, i, left, groupWidth, top, plotHeight }} />
        <PeriodLabel {...{ period, i, x, height, left, right, canvasWidth, groupWidth, labelStride, maxLabelLength }} periodCount={periods.length} />
      </g>)}
      {series.map((serie) => {
        const segments = [];
        let current = [];
        periods.forEach((period, i) => {
          const value = serie.value(period);
          if (value == null) { if (current.length) segments.push(current); current = []; }
          else current.push({ i, value, period });
        });
        if (current.length) segments.push(current);
        return <g key={serie.key}>
          {segments.map((segment) => <polyline key={segment[0].i} fill="none" stroke={serie.color} strokeWidth="2.5" points={segment.map((point) => `${x(point.i)},${y(point.value)}`).join(" ")} />)}
          {segments.flat().map((point) => <circle key={point.i} cx={x(point.i)} cy={y(point.value)} r="4" fill={serie.color}>
            <title>{`${point.period.label} · ${serie.name}: ${rateText(point.value)} (${serie.detail(point.period)})`}</title>
          </circle>)}
        </g>;
      })}
    </svg>
  </ChartFrame>;
}

export function BarsChart({ periods, series, width, height, label, format = (value) => value, rateLine = null }) {
  const [containerRef, availableWidth] = useChartWidth(width);
  const { max, left, right, canvasWidth, groupWidth, labelStride, showValues, maxLabelLength } = chartLayout({ periods, series, width: availableWidth, format, secondaryAxis: Boolean(rateLine) });
  const top = 28, bottom = 44, plotHeight = height - top - bottom;
  const barWidth = groupWidth * .8 / Math.max(1, series.length);
  const x = (i) => left + groupWidth * (i + .5);
  const y = (value) => top + plotHeight * (1 - value / max);
  const rateY = (value) => top + plotHeight * (1 - value);
  return <ChartFrame {...{ label, periods, series, format, rateLine }}>
    <svg ref={containerRef} className="cm-chart" style={{ width: "100%", height }} viewBox={`0 0 ${canvasWidth} ${height}`} role="img" aria-label={label}>
      <Axis {...{ max, left, right, y }} width={canvasWidth} />
      {periods.map((period, i) => <g key={period.clave}>
        <CurrentPeriod {...{ period, i, left, groupWidth, top, plotHeight }} />
        {series.map((serie, j) => {
          const value = serie.value(period);
          const barX = left + groupWidth * (i + .1) + j * barWidth;
          const center = barX + barWidth / 2;
          return <g key={serie.key}>
            {value != null && <rect x={barX + barWidth * .1} y={y(value)} width={barWidth * .8} height={height - bottom - y(value)} rx="2" fill={serie.color}>
              <title>{`${period.label} · ${serie.name}: ${format(value, period)}`}</title>
            </rect>}
            {showValues && <text x={center} y={value == null ? height - bottom - 8 : y(value) - 8} textAnchor="middle" className="cm-chart__value">{value == null ? "—" : format(value, period)}</text>}
          </g>;
        })}
        <PeriodLabel {...{ period, i, x, height, left, right, canvasWidth, groupWidth, labelStride, maxLabelLength }} periodCount={periods.length} />
      </g>)}
      {rateLine && <g>
        {[0, 1].map((value) => <text key={value} x={canvasWidth - right + 12} y={rateY(value) + 4}>{rateText(value)}</text>)}
        {periods.map((period, i) => {
          const value = rateLine.value(period);
          if (value == null) return null;
          const previous = i > 0 ? rateLine.value(periods[i - 1]) : null;
          return <g key={period.clave}>
            {previous != null && <line x1={x(i - 1)} y1={rateY(previous)} x2={x(i)} y2={rateY(value)} stroke={rateLine.color} strokeWidth="2" strokeDasharray="4 3" />}
            <circle cx={x(i)} cy={rateY(value)} r="4" fill={rateLine.color}><title>{`${period.label} · ${rateLine.name}: ${rateText(value)}`}</title></circle>
          </g>;
        })}
      </g>}
    </svg>
  </ChartFrame>;
}
