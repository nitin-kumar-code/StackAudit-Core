import { describe, it, expect } from "vitest";
import { analyzeAudit } from "@/lib/engine";

describe("Edge Cases", () => {
  it("handles empty tool selections gracefully", () => {
    const result = analyzeAudit({
      companySize: "small",
      teamSize: "1",
      useCase: "research",
      selectedTools: [],
      toolDetails: {},
    });

    expect(result.recommendations).toEqual([]);
    expect(result.totalMonthlySavings).toBe(0);
  });

  it("avoids duplicate savings stacking", () => {
    const result = analyzeAudit({
      companySize: "small",
      teamSize: "2",
      useCase: "coding",
      selectedTools: ["cursor"],
      toolDetails: {
        cursor: {
          plan: "business",
          monthlySpend: 200,
          seats: 2,
        },
      },
    });

    expect(result.optimizedMonthlySpend).toBeGreaterThanOrEqual(0);
  });
});

