export function calculateSavings(
  affectedSeats: number,
  currentMonthlyCostPerSeat: number,
  newMonthlyCostPerSeat: number = 0
): { monthlySavings: number; annualSavings: number } {
  const currentTotalMonthly = affectedSeats * currentMonthlyCostPerSeat;
  const newTotalMonthly = affectedSeats * newMonthlyCostPerSeat;
  
  const monthlySavings = currentTotalMonthly - newTotalMonthly;
  const annualSavings = monthlySavings * 12;

  return {
    monthlySavings,
    annualSavings
  };
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
