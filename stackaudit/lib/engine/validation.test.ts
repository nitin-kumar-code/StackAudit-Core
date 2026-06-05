import { describe, it, expect } from "vitest";
import { auditFormSchema } from "@/lib/validations/audit";

describe("Audit Form Validation", () => {
  it("rejects invalid team sizes", () => {
    const result = auditFormSchema.safeParse({
      companySize: "small",
      teamSize: "",
      useCase: "coding",
      selectedTools: [],
      toolDetails: {},
    });

    expect(result.success).toBe(false);
  });

  it("accepts valid audit payloads", () => {
    const result = auditFormSchema.safeParse({
      companySize: "startup",
      teamSize: "8",
      useCase: "coding",
      selectedTools: ["chatgpt"],
      toolDetails: {
        chatgpt: {
          plan: "team",
          monthlySpend: 240,
          seats: 8,
        },
      },
    });

    expect(result.success).toBe(true);
  });
});

