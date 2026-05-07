'use client';

import { useFormContext } from 'react-hook-form';
import { AI_TOOLS, AuditFormData } from '@/lib/validations/audit';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

export default function ToolSelectionStep() {
  const { watch, setValue, formState: { errors } } = useFormContext<AuditFormData>();
  const selectedTools = watch('selectedTools') || [];

  const handleToggle = (tool: string) => {
    if (selectedTools.includes(tool)) {
      setValue('selectedTools', selectedTools.filter(t => t !== tool), { shouldValidate: true });
    } else {
      setValue('selectedTools', [...selectedTools, tool], { shouldValidate: true });
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="space-y-4">
        <h3 className="text-lg font-medium">Which AI tools does your team use?</h3>
        <p className="text-sm text-muted-foreground">Select all that apply.</p>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          {AI_TOOLS.map((tool) => {
            const isSelected = selectedTools.includes(tool);
            return (
              <div 
                key={tool}
                className={`flex items-center space-x-3 border rounded-lg p-4 cursor-pointer transition-colors ${
                  isSelected ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                }`}
                onClick={() => handleToggle(tool)}
              >
                <Checkbox 
                  id={`tool-${tool}`} 
                  checked={isSelected}
                  onCheckedChange={() => handleToggle(tool)}
                  onClick={(e) => e.stopPropagation()}
                />
                <Label 
                  htmlFor={`tool-${tool}`}
                  className="flex-1 cursor-pointer font-medium"
                  onClick={(e) => {
                    e.preventDefault();
                    handleToggle(tool);
                  }}
                >
                  {tool}
                </Label>
              </div>
            );
          })}
        </div>
        
        {errors.selectedTools && (
          <p className="text-sm text-destructive mt-2">{errors.selectedTools.message as string}</p>
        )}
      </div>
    </div>
  );
}
