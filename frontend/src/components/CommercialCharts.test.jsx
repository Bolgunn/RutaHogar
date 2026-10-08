import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BarsChart, RateChart, chartLayout } from "./CommercialCharts";

const periods = Array.from({ length: 48 }, (_, i) => ({ clave: String(i), label: `Semana ${i + 1} · octubre de 2026`, value: i === 2 ? null : 123456 + i }));
const series = [{ key: "a", name: "Leads nuevos", color: "#132B4A", value: (period) => period.value }];

describe("commercial charts: dense data and missing values", () => {
  it("fits dense periods within the available width and thins labels instead of data", () => {
    const layout = chartLayout({ periods, series: [...series, { ...series[0], key: "b" }], width: 440, format: (value) => `${value} días (n=999999)`, secondaryAxis: true });
    expect(layout.canvasWidth).toBe(440);
    expect(layout.labelStride).toBeGreaterThan(1);
    expect(layout.showValues).toBe(false);
    expect(layout.left).toBeGreaterThan(String(layout.max).length * 9);
    expect(layout.right).toBeGreaterThan('100 %'.length * 9);
  });
  it("keeps every period and exact value available, including null versus zero", () => {
    const html = renderToStaticMarkup(<BarsChart periods={[{ clave: "zero", label: "Cero", value: 0 }, ...periods]} series={series} width={440} height={230} label="Cohortes" />);
    expect((html.match(/scope="row"/g) || []).length).toBe(49);
    expect(html).toContain('— sin datos');
    expect(html).toContain('<td>0</td>');
    expect(html).toContain('<td>123503</td>');
    expect(html).toContain('Ver todos los valores');
    expect(html).toContain('width:100%');
    expect(html).not.toContain('cm-chart__value');
    expect((html.match(/<rect/g) || []).length).toBe(48);
  });
  it("does not connect rate lines through periods without data", () => {
    const rows = [0, null, .5].map((value, i) => ({ clave: String(i), label: `P${i}`, value }));
    const rate = { ...series[0], detail: () => '1 de 2' };
    const html = renderToStaticMarkup(<RateChart periods={rows} series={[rate]} width={440} height={240} label="Conversión" />);
    expect((html.match(/<polyline/g) || []).length).toBe(2);
    expect(html).toContain('50 %');
    expect(html).not.toContain('cm-chart__value');
    const bars = renderToStaticMarkup(<BarsChart periods={rows} series={series} rateLine={rate} width={440} height={230} label="Activos" />);
    expect(bars).not.toContain('stroke-dasharray="4 3"');
    expect(bars).toContain('— sin datos');
  });
  it("avoids repeated count ticks for a maximum of one", () => {
    const html = renderToStaticMarkup(<BarsChart periods={[{ clave: "1", label: "Mes", value: 1 }]} series={series} width={440} height={230} label="Leads" />);
    expect((html.match(/text-anchor="end"/g) || []).length).toBe(2);
  });
  it("shows bar values only when their actual text fits the available slot", () => {
    const sparse = [{ clave: '1', label: 'Octubre', value: 20 }];
    expect(chartLayout({ periods: sparse, series, width: 900, format: String }).showValues).toBe(true);
    expect(chartLayout({ periods: sparse, series, width: 320, format: () => 'Una explicación larga con muchos números y muestras' }).showValues).toBe(false);
  });
});
