import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StaffParticipationBadge from "./StaffParticipationBadge";
import { matchesParticipationFilter, participationFilters } from "../lib/commercial/bipersonalProjection";
const projection = (evaluation_type, extra = {}) => ({ version: "hu30-projection-v1", evaluation_type, ...extra });
describe("HU30 staff badge and filter contract", () => {
  it("provides exactly the three agreed options", () => {
    expect(participationFilters.map(([, label]) => label)).toEqual(["Todos", "Titular individual", "Con co-deudor"]);
  });
  it.each([["individual", "Titular individual"], ["bipersonal_confirmed", "Bipersonal confirmado"], ["declared_complement", "Complemento declarado"], ["unverifiable_origin", "Origen no verificable"]])("labels %s only from the server type", (type, label) => {
    expect(renderToStaticMarkup(<StaffParticipationBadge projection={projection(type)} />)).toContain(label);
  });
  it.each([null, { evaluation_type: "bipersonal_confirmed" }, { version: "future", evaluation_type: "individual" }])("does not infer a type for missing/unknown contract", (value) => {
    expect(renderToStaticMarkup(<StaffParticipationBadge projection={value} />)).toContain("Participación no disponible");
    expect(matchesParticipationFilter(value, "individual")).toBe(false);
    expect(matchesParticipationFilter(value, "bipersonal_confirmed")).toBe(false);
    expect(matchesParticipationFilter(value, "all")).toBe(true);
  });
  it.each(["individual", "bipersonal_confirmed", "declared_complement", "unverifiable_origin"])("maps %s to its exact commercial filter, including Todos", (type) => {
    expect(matchesParticipationFilter(projection(type), "all")).toBe(true);
    expect(matchesParticipationFilter(projection(type), "individual")).toBe(type === "individual");
    expect(matchesParticipationFilter(projection(type), "bipersonal_confirmed")).toBe(type === "bipersonal_confirmed");
  });
  it.each([["historical_consent_revoked", "Histórica · consentimiento revocado"], ["historical_participation_replaced", "Histórica · participación reemplazada"]])("shows historical warning %s from backend in the badge", (code, label) => {
    expect(renderToStaticMarkup(<StaffParticipationBadge projection={projection("bipersonal_confirmed", { warnings: [code] })} />)).toContain(label);
  });
  it.each(["revoked", "replaced"])("keeps historical %s in Con co-deudor after redaction", (status) => {
    const value = projection("bipersonal_confirmed", { status, visibility: "hidden", capacity: null });
    expect(matchesParticipationFilter(value, "bipersonal_confirmed")).toBe(true);
    expect(renderToStaticMarkup(<StaffParticipationBadge projection={value} />)).toContain("Bipersonal confirmado");
  });
});
