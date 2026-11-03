import { expect, it } from "vitest";
import { reviewForm, reviewCommand, participationPath } from "../coDebtorReview";
const values = { ingreso_mensual_complementario: 1000000, deuda_mensual_complementario: 0,
  tipo_contrato_complementario: "indefinido", continuidad_laboral_complementario: "mas_3_anios", morosidad_complementario: "no" };
const review = { revision_number: 0, relation: { event_id: "relation" }, requires_relation_acceptance: true };
it("prefills only the five available fields without inventing missing values", () => {
  expect(reviewForm({ ingreso_mensual_complementario: 100, secret: "hidden" })).toEqual({
    ingreso_mensual_complementario: "100", deuda_mensual_complementario: "", tipo_contrato_complementario: "", continuidad_laboral_complementario: "", morosidad_complementario: "" });
});
it("submits edited five values with distinct relation/participation consent", () => {
  const form = { ...reviewForm(values), ingreso_mensual_complementario: "2000000" };
  const command = reviewCommand(review, form, true, true);
  expect(command.values.ingreso_mensual_complementario).toBe(2000000);
  expect(command.values.deuda_mensual_complementario).toBe(0);
  expect(command).not.toHaveProperty("participant_user_id");
  expect(command).not.toHaveProperty("treatment_consented_at");
});
it.each([[false, true], [true, false]])("requires independent acceptances: relation=%s, consent=%s", (relation, consent) => {
  expect(() => reviewCommand(review, reviewForm(values), relation, consent)).toThrow();
});
it.each(["", "-1", "NaN", "Infinity", "abc", "9007199254740992"])("rejects invalid amounts: %s", value => {
  for (const field of ["ingreso_mensual_complementario", "deuda_mensual_complementario"])
    expect(() => reviewCommand(review, { ...reviewForm(values), [field]: value }, true, true)).toThrow();
});
it.each(["tipo_contrato_complementario", "continuidad_laboral_complementario", "morosidad_complementario"])("rejects arbitrary enum %s", field => {
  expect(() => reviewCommand(review, { ...reviewForm(values), [field]: "arbitrary" }, true, true)).toThrow();
});
it("preserves first acceptance and does not record a fictitious new acceptance in later revisions", () => {
  const command = reviewCommand({ ...review, revision_number: 2, requires_relation_acceptance: false }, reviewForm(values), false, true);
  expect(command.accept_relation).toBe(false);
  expect(command.expected_revision).toBe(2);
});
it("requires an explicit titular declaration instead of inferring relation", () => {
  expect(() => reviewCommand({ ...review, relation: {} }, reviewForm(values), true, true)).toThrow("titular");
  expect(participationPath("https://evil.test")).toBeNull();
});
