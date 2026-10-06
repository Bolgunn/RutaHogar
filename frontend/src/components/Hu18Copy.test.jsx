import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hu18Sources = [
  new URL("../App.jsx", import.meta.url),
  new URL("./CoDebtorSection.jsx", import.meta.url),
  new URL("./PublicCoDebtorPages.jsx", import.meta.url),
  new URL("./Recommendations.jsx", import.meta.url),
  new URL("./ScoreForm.jsx", import.meta.url),
  new URL("../services/coDebtorService.js", import.meta.url),
];

describe("HU18 copy", () => {
  it("does not contain mojibake in the co-debtor UI", () => {
    for (const source of hu18Sources) {
      expect(readFileSync(source, "utf8")).not.toContain("Ã");
    }
  });
});
