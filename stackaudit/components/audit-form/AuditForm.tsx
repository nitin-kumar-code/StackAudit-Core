'use client';

import { useState, useEffect } from 'react';
import { useForm, FormProvider } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { auditFormSchema, AuditFormData } from '@/lib/validations/audit';
import CompanyInfoStep from './CompanyInfoStep';
import ToolSelectionStep from './ToolSelectionStep';
import ToolDetailsStep from './ToolDetailsStep';
import SummaryStep from './SummaryStep';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import router from 'next/router';
import { id } from 'zod/v4/locales';

const steps = [
  { id: 'company', title: 'Company Info' },
  { id: 'tools', title: 'Tools Used' },
  { id: 'details', title: 'Spend Details' },
  { id: 'summary', title: 'Summary' }
];

export default function AuditForm() {
  const [currentStep, setCurrentStep] = useState(0);
  const [isClient, setIsClient] = useState(false);

  const methods = useForm<AuditFormData>({
    resolver: zodResolver(auditFormSchema) as any,
    defaultValues: {
      companySize: '',
      teamSize: '',
      useCase: '',
      selectedTools: [],
      toolDetails: {},
    },
    mode: 'onChange'
  });

  useEffect(() => {
    setIsClient(true);
    const savedData = localStorage.getItem('auditFormData');
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        methods.reset(parsed);
      } catch (e) {
        console.error('Failed to parse saved form data');
      }
    }
  }, [methods]);

  useEffect(() => {
    if (isClient) {
      const subscription = methods.watch((value) => {
        localStorage.setItem('auditFormData', JSON.stringify(value));
      });
      return () => subscription.unsubscribe();
    }
  }, [methods, isClient]);

  const handleNext = async () => {
    let fieldsToValidate: any[] = [];
    
    if (currentStep === 0) {
      fieldsToValidate = ['companySize', 'teamSize', 'useCase'];
    } else if (currentStep === 1) {
      fieldsToValidate = ['selectedTools'];
    } else if (currentStep === 2) {
      fieldsToValidate = ['toolDetails'];
    }

    const isStepValid = await methods.trigger(fieldsToValidate);
    if (isStepValid) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
      window.scrollTo(0, 0);
    }
  };

  const handlePrev = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
    window.scrollTo(0, 0);
  };

  const onSubmit = (data: any) => {
    if (currentStep < steps.length - 1) {
       setCurrentStep(steps.length - 1);
    } else {
       console.log('Final Data:', data);
       router.push(`/results/${id}`);
       localStorage.removeItem('auditFormData');
       methods.reset();
       setCurrentStep(0);
    }
  };

  if (!isClient) return null;

  return (
    <Card className="w-full max-w-3xl mx-auto shadow-lg border-primary/10">
      <CardHeader>
        <div className="mb-8">
          <div className="flex justify-between items-center relative">
            <div className="absolute top-1/2 left-0 w-full h-[2px] bg-muted -z-10 -translate-y-1/2" />
            {steps.map((step, index) => (
              <div 
                key={step.id} 
                className={`flex flex-col items-center flex-1 z-10 ${
                  index === currentStep 
                    ? 'text-primary' 
                    : index < currentStep 
                      ? 'text-primary' 
                      : 'text-muted-foreground'
                }`}
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 bg-background transition-colors ${
                  index <= currentStep ? 'border-primary text-primary' : 'border-muted text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <div className="mt-2 text-xs sm:text-sm font-medium absolute top-10 w-24 text-center">
                  <span className="hidden sm:inline">{step.title}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        <CardTitle className="text-2xl mt-8">{steps[currentStep].title}</CardTitle>
        <CardDescription>
          {currentStep === 0 && 'Tell us about your organization to contextualize your spend.'}
          {currentStep === 1 && 'Select the AI tools currently in use across your team.'}
          {currentStep === 2 && 'Detail the usage and cost for each selected tool.'}
          {currentStep === 3 && 'Review your overall AI spend.'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <FormProvider {...methods}>
          <form onSubmit={methods.handleSubmit(onSubmit)} className="space-y-6">
            
            <div className="min-h-[300px] py-4">
              {currentStep === 0 && <CompanyInfoStep />}
              {currentStep === 1 && <ToolSelectionStep />}
              {currentStep === 2 && <ToolDetailsStep />}
              {currentStep === 3 && <SummaryStep />}
            </div>

            <div className="flex justify-between pt-6 border-t">
              <Button
                type="button"
                variant="outline"
                onClick={handlePrev}
                disabled={currentStep === 0}
              >
                Back
              </Button>
              
              {currentStep < steps.length - 1 ? ( <Button type="button" onClick={handleNext}> {currentStep === steps.length - 2 ? "Review" : "Next"} </Button> ) : ( <Button type="submit" className="bg-green-600 hover:bg-green-700 text-white" > Submit Audit </Button> )}
              
            </div>
          </form>
        </FormProvider>
      </CardContent>
    </Card>
  );
}
