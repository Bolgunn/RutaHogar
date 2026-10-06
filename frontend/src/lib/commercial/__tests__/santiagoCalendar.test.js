import { describe, expect, it } from "vitest";
import { periodOf, periodsBetween } from "../santiagoCalendar";

const at = (iso) => new Date(iso).toISOString();

describe("santiagoCalendar (ALG-18 R7)", () => {
  it("keeps Sunday 23:30 in Santiago in its ISO week, although it is Monday in UTC", () => {
    expect(periodOf("2026-10-05T02:30:00Z", "semana")).toEqual({
      clave: "2026-W40",
      desde: at("2026-09-28T03:00:00Z"),
      hasta: at("2026-10-05T03:00:00Z"),
    });
  });

  it("labels a week with its ISO week-year: 2027-01-01 is 2026-W53", () => {
    expect(periodOf("2027-01-01T12:00:00Z", "semana")).toEqual({
      clave: "2026-W53",
      desde: at("2026-12-28T03:00:00Z"),
      hasta: at("2027-01-04T03:00:00Z"),
    });
  });

  it("uses the calendar year for mes and año", () => {
    expect(periodOf("2027-01-01T12:00:00Z", "mes").clave).toBe("2027-01");
    expect(periodOf("2027-01-01T12:00:00Z", "año")).toEqual({
      clave: "2027",
      desde: at("2027-01-01T03:00:00Z"),
      hasta: at("2028-01-01T03:00:00Z"),
    });
  });

  it("reads the offset of each instant: 2026-07-01T03:30Z is 30 June in winter time", () => {
    expect(periodOf("2026-07-01T03:30:00Z", "mes")).toEqual({
      clave: "2026-06",
      desde: at("2026-06-01T04:00:00Z"),
      hasta: at("2026-07-01T04:00:00Z"),
    });
  });

  it("bounds 2026-09 between local midnights across the September DST change", () => {
    expect(periodOf("2026-09-15T00:00:00Z", "mes")).toEqual({
      clave: "2026-09",
      desde: at("2026-09-01T04:00:00Z"),
      hasta: at("2026-10-01T03:00:00Z"),
    });
  });

  it("treats periods as half-open: local midnight starts the new period", () => {
    expect(periodOf("2026-09-01T04:00:00Z", "mes").clave).toBe("2026-09");
    expect(periodOf("2026-09-01T03:59:59.999Z", "mes").clave).toBe("2026-08");
    expect(periodOf("2026-09-01T03:30:00Z", "mes").clave).toBe("2026-08");
  });

  it("spans the 2026 DST changes in a week (April back to UTC−4, September forward to UTC−3)", () => {
    expect(periodOf("2026-04-02T12:00:00Z", "semana")).toEqual({
      clave: "2026-W14",
      desde: at("2026-03-30T03:00:00Z"),
      hasta: at("2026-04-06T04:00:00Z"),
    });
    expect(periodOf("2026-09-02T12:00:00Z", "semana")).toEqual({
      clave: "2026-W36",
      desde: at("2026-08-31T04:00:00Z"),
      hasta: at("2026-09-07T03:00:00Z"),
    });
  });

  it("spans the 2027 DST changes in a week", () => {
    expect(periodOf("2027-04-02T12:00:00Z", "semana")).toEqual({
      clave: "2027-W13",
      desde: at("2027-03-29T03:00:00Z"),
      hasta: at("2027-04-05T04:00:00Z"),
    });
    expect(periodOf("2027-09-02T12:00:00Z", "semana")).toEqual({
      clave: "2027-W35",
      desde: at("2027-08-30T04:00:00Z"),
      hasta: at("2027-09-06T03:00:00Z"),
    });
  });

  it("accepts instants with a UTC offset", () => {
    expect(periodOf("2026-08-31T23:30:00-04:00", "mes").clave).toBe("2026-08");
  });

  it("lists contiguous periods from the first instant's to the last's, both included", () => {
    expect(periodsBetween("2026-12-20T12:00:00Z", "2027-01-12T12:00:00Z", "semana").map((p) => p.clave))
      .toEqual(["2026-W51", "2026-W52", "2026-W53", "2027-W01", "2027-W02"]);
    const months = periodsBetween("2026-08-15T12:00:00Z", "2026-10-04T15:00:00Z", "mes");
    expect(months.map((p) => p.clave)).toEqual(["2026-08", "2026-09", "2026-10"]);
    for (let i = 1; i < months.length; i += 1) expect(months[i].desde).toBe(months[i - 1].hasta);
    expect(periodsBetween("2026-10-04T15:00:00Z", "2026-10-04T15:00:00Z", "año").map((p) => p.clave)).toEqual(["2026"]);
  });
});
