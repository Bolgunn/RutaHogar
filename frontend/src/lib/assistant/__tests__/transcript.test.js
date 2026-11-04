import { describe, it, expect } from "vitest";
import { buildTranscriptForTicket } from "../transcript";

describe("transcript.js (HU24 - E4)", () => {
  it("returns empty array for invalid input", () => {
    expect(buildTranscriptForTicket(null)).toEqual([]);
    expect(buildTranscriptForTicket([])).toEqual([]);
  });

  it("extracts and bounds user and assistant messages up to maxTurns", () => {
    const raw = Array.from({ length: 15 }, (_, i) => ({
      id: `msg-${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Mensaje número ${i}`,
      createdAt: "2026-10-27T10:00:00Z",
    }));

    const result = buildTranscriptForTicket(raw, 5);
    expect(result).toHaveLength(5);
    expect(result[0].content).toBe("Mensaje número 10");
    expect(result[4].content).toBe("Mensaje número 14");
    expect(result[0].role).toBe("user");
    expect(result[1].role).toBe("assistant");
  });

  it("filters out system messages or messages with empty content", () => {
    const raw = [
      { role: "system", content: "System initialized" },
      { role: "user", content: "   " },
      { role: "user", content: "Tengo una duda" },
      { role: "assistant", content: "Dime cuál es tu duda" },
    ];

    const result = buildTranscriptForTicket(raw);
    expect(result).toHaveLength(2);
    expect(result[0].content).toBe("Tengo una duda");
    expect(result[1].content).toBe("Dime cuál es tu duda");
  });

  it("truncates excessively long message content to 1000 chars", () => {
    const longText = "A".repeat(1500);
    const raw = [{ role: "user", content: longText }];

    const result = buildTranscriptForTicket(raw);
    expect(result[0].content).toHaveLength(1000);
  });
});
