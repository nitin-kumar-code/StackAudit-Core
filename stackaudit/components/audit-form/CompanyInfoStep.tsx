'use client';

import { useFormContext } from 'react-hook-form';
import { AuditFormData } from '@/lib/validations/audit';
import { Label } from '@/components/ui/label';

export default function CompanyInfoStep() {
  const { register, formState: { errors } } = useFormContext<AuditFormData>();

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-2">
        <Label htmlFor="companySize">Company Size</Label>
        <select
          id="companySize"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register('companySize')}
        >
          <option value="">Select company size...</option>
          <option value="1-10">1-10 employees</option>
          <option value="11-50">11-50 employees</option>
          <option value="51-200">51-200 employees</option>
          <option value="201-500">201-500 employees</option>
          <option value="500+">500+ employees</option>
        </select>
        {errors.companySize && (
          <p className="text-sm text-destructive">{errors.companySize.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="teamSize">AI Users (Team Size)</Label>
        <select
          id="teamSize"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register('teamSize')}
        >
          <option value="">Select team size...</option>
          <option value="1-5">1-5 users</option>
          <option value="6-20">6-20 users</option>
          <option value="21-50">21-50 users</option>
          <option value="50+">50+ users</option>
        </select>
        {errors.teamSize && (
          <p className="text-sm text-destructive">{errors.teamSize.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="useCase">Primary AI Use Case</Label>
        <select
          id="useCase"
          className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          {...register('useCase')}
        >
          <option value="">Select use case...</option>
          <option value="Engineering">Engineering / Development</option>
          <option value="Marketing">Marketing / Content creation</option>
          <option value="Sales">Sales / Outreach</option>
          <option value="Support">Customer Support</option>
          <option value="General">General Productivity</option>
          <option value="Other">Other</option>
        </select>
        {errors.useCase && (
          <p className="text-sm text-destructive">{errors.useCase.message}</p>
        )}
      </div>
    </div>
  );
}
