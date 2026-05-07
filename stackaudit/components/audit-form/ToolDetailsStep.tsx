'use client';

import { useFormContext } from 'react-hook-form';
import { AuditFormData } from '@/lib/validations/audit';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';

export default function ToolDetailsStep() {
  const { register, watch, formState: { errors } } = useFormContext<AuditFormData>();
  const selectedTools = watch('selectedTools') || [];

  if (selectedTools.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p>No tools selected. Please go back and select at least one tool.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {selectedTools.map((tool) => (
        <Card key={tool} className="overflow-hidden">
          <div className="bg-muted/50 px-6 py-3 border-b">
            <h4 className="font-semibold">{tool}</h4>
          </div>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`plan-${tool}`}>Plan</Label>
                <select
                  id={`plan-${tool}`}
                  className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...register(`toolDetails.${tool}.plan` as const)}
                >
                  <option value="">Select Plan...</option>
                  <option value="Free">Free</option>
                  <option value="Pro">Pro / Plus</option>
                  <option value="Team">Team / Business</option>
                  <option value="Enterprise">Enterprise</option>
                  <option value="Pay-as-you-go">Pay-as-you-go</option>
                </select>
                {errors.toolDetails?.[tool]?.plan && (
                  <p className="text-sm text-destructive">{errors.toolDetails[tool]?.plan?.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`spend-${tool}`}>Monthly Spend ($)</Label>
                <Input
                  id={`spend-${tool}`}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="e.g., 20"
                  {...register(`toolDetails.${tool}.monthlySpend` as const, { valueAsNumber: true })}
                />
                {errors.toolDetails?.[tool]?.monthlySpend && (
                  <p className="text-sm text-destructive">{errors.toolDetails[tool]?.monthlySpend?.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor={`seats-${tool}`}>Seats / Licenses</Label>
                <Input
                  id={`seats-${tool}`}
                  type="number"
                  min="1"
                  placeholder="e.g., 5"
                  {...register(`toolDetails.${tool}.seats` as const, { valueAsNumber: true })}
                />
                {errors.toolDetails?.[tool]?.seats && (
                  <p className="text-sm text-destructive">{errors.toolDetails[tool]?.seats?.message}</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
