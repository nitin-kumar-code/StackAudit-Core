'use client';

import { useFormContext } from 'react-hook-form';
import { AuditFormData } from '@/lib/validations/audit';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SummaryStep() {
  const { watch } = useFormContext<AuditFormData>();
  const data = watch();
  
  const totalSpend = data.selectedTools?.reduce((acc, tool) => {
    const spend = data.toolDetails?.[tool]?.monthlySpend || 0;
    return acc + spend;
  }, 0) || 0;

  const totalSeats = data.selectedTools?.reduce((acc, tool) => {
    const seats = data.toolDetails?.[tool]?.seats || 0;
    return acc + seats;
  }, 0) || 0;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Monthly Spend</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-primary">${totalSpend.toFixed(2)}</div>
            <p className="text-xs text-muted-foreground mt-1">Across {data.selectedTools?.length || 0} tools</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Seats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{totalSeats}</div>
            <p className="text-xs text-muted-foreground mt-1">Active licenses</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Organization Details</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-muted-foreground">Company Size:</span>
            <p className="font-medium">{data.companySize || 'Not specified'}</p>
          </div>
          <div>
            <span className="text-muted-foreground">AI Users:</span>
            <p className="font-medium">{data.teamSize || 'Not specified'}</p>
          </div>
          <div className="col-span-2">
            <span className="text-muted-foreground">Primary Use Case:</span>
            <p className="font-medium">{data.useCase || 'Not specified'}</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <h4 className="font-semibold px-1">Tool Breakdown</h4>
        {data.selectedTools?.length === 0 && (
          <p className="text-sm text-muted-foreground px-1">No tools selected.</p>
        )}
        {data.selectedTools?.map(tool => {
          const details = data.toolDetails?.[tool];
          return (
            <Card key={tool}>
              <CardContent className="p-4 flex justify-between items-center">
                <div>
                  <h5 className="font-medium">{tool}</h5>
                  <p className="text-xs text-muted-foreground">{details?.plan || 'No plan selected'}</p>
                </div>
                <div className="text-right">
                  <div className="font-bold">${details?.monthlySpend || 0}/mo</div>
                  <div className="text-xs text-muted-foreground">{details?.seats || 0} seats</div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
