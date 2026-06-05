import { describe, it, expect } from "vitest";
import { analyzeAudit } from "@/lib/engine";

describe("Recommendation Accuracy", () => {
  it("recommends downgrading enterprise plans for small teams", () => {
    const result = analyzeAudit({
      companySize: "small",
      teamSize: "4",
      useCase: "coding",
      selectedTools: ["cursor"],
      toolDetails: {
        cursor: {
          plan: "enterprise",
          monthlySpend: 400,
          seats: 4,
        },
      },
    });

    const downgradeRecommendation = result.recommendations.find(
      (r) => r.type === "downgrade"
    );

    expect(downgradeRecommendation).toBeDefined();
  });

  it("detects overlapping tools in the same category", () => {
    const result = analyzeAudit({
      companySize: "startup",
      teamSize: "10",
      useCase: "mixed",
      selectedTools: ["chatgpt", "claude"],
      toolDetails: {
        chatgpt: {
          plan: "team",
          monthlySpend: 300,
          seats: 10,
        },
        claude: {
          plan: "team",
          monthlySpend: 250,
          seats: 10,
        },
      },
    });

    const consolidationRecommendation = result.recommendations.find(
      (r) => r.type === "consolidation"
    );

    expect(consolidationRecommendation).toBeDefined();
  });
});

