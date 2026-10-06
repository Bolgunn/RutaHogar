import { describe, expect, it } from "vitest";

import { formatChileanRutInput, isValidChileanRut, normalizeChileanRut } from "../chileanRut";

describe("Chilean RUT", () => {
  it("normalizes a valid RUT to the project canonical representation", () => {
    expect(normalizeChileanRut(" 12.345.678-5 ")).toBe("12345678-5");
    expect(normalizeChileanRut("17.493.972-k")).toBe("17493972-K");
  });

  it("rejects an invalid verification digit or incomplete value", () => {
    expect(isValidChileanRut("12.345.678-4")).toBe(false);
    expect(normalizeChileanRut("123456-7")).toBe("");
  });

  it("formats natural typing while preserving the canonical value for submission", () => {
    expect(formatChileanRutInput("123456785")).toBe("12.345.678-5");
    expect(formatChileanRutInput("17493972k")).toBe("17.493.972-K");
    expect(formatChileanRutInput("12.345.678-")).toBe("12.345.678");
    expect(normalizeChileanRut(formatChileanRutInput("123456785"))).toBe("12345678-5");
  });
});
