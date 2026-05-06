import * as z from 'zod';

export const AI_TOOLS = [
  'Cursor',
  'Claude',
  'ChatGPT',
  'GitHub Copilot',
  'Gemini',
  'OpenAI API',
  'Anthropic API',
  'Windsurf'
] as const;

export const auditFormSchema = z.object({
  companySize: z.string().min(1, 'Company size is required'),
  teamSize: z.string().min(1, 'Team size is required'),
  useCase: z.string().min(1, 'Primary use case is required'),
  selectedTools: z.array(z.string()).min(1, 'Select at least one tool'),
  toolDetails: z.record(
    z.string(),
    z.object({
      plan: z.string().min(1, 'Plan is required'),
      monthlySpend: z.coerce.number().min(0, 'Must be 0 or greater'),
      seats: z.coerce.number().min(1, 'Must be 1 or greater'),
    })
  ).default({}),
});

export type AuditFormData = z.infer<typeof auditFormSchema>;
