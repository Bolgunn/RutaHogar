import { describe, expect, it } from "vitest";

import { formatMoneyInput, stripMoneyInput } from "../moneyFormat";

describe("shared monetary input formatting", () => {
  it("displays thousands separators while keeping the submitted value numeric", () => {
    expect(formatMoneyInput("1500000")).toBe("1.500.000");
    expect(stripMoneyInput("1.500.000")).toBe("1500000");
  });
});
