import { describe, it, expect } from "vitest";
import { analyzeAudit } from "@/lib/engine";

describe("Savings Calculations", () => {
  it("calculates downgrade savings correctly", () => {
    const result = analyzeAudit({
      companySize: "small",
      teamSize: "3",
      useCase: "coding",
      selectedTools: ["chatgpt"],
      toolDetails: {
        chatgpt: {
          plan: "team",
          monthlySpend: 90,
          seats: 3,
        },
      },
    });

    expect(result.totalMonthlySavings).toBeGreaterThan(0);

    expect(result.totalAnnualSavings).toBe(
      result.totalMonthlySavings * 12
    );
  });

  it("does not generate negative savings", () => {
    const result = analyzeAudit({
      companySize: "small",
      teamSize: "2",
      useCase: "research",
      selectedTools: ["claude"],
      toolDetails: {
        claude: {
          plan: "pro",
          monthlySpend: 40,
          seats: 2,
        },
      },
    });

    expect(result.totalMonthlySavings).toBeGreaterThanOrEqual(0);
  });
});

