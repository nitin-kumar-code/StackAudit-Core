import { describe, it, expect } from "vitest";
import { analyzeAudit } from "@/lib/engine";

describe("Annual Plan Logic", () => {
  it("recommends annual billing when savings are meaningful", () => {
    const result = analyzeAudit({
      companySize: "mid-size",
      teamSize: "25",
      useCase: "coding",
      selectedTools: ["github-copilot"],
      toolDetails: {
        "github-copilot": {
          plan: "business",
          monthlySpend: 950,
          seats: 25,
        },
      },
    });

    const annualRecommendation = result.recommendations.find(
      (r) => r.type === "annual_commitment"
    );

    expect(annualRecommendation).toBeDefined();
  });
});

