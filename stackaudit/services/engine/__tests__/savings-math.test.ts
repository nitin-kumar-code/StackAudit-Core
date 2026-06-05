import { describe, it, expect } from 'vitest';
import { calculateSavings, formatCurrency } from '../utils/savings-math';

describe('savings-math utilities', () => {
  describe('calculateSavings', () => {
    it('should correctly calculate pure cancellation savings', () => {
      // 10 seats cancelled completely (new cost = 0)
      const { monthlySavings, annualSavings } = calculateSavings(10, 20, 0);
      expect(monthlySavings).toBe(200);
      expect(annualSavings).toBe(2400);
    });

    it('should correctly calculate downgrade/arbitrage savings', () => {
      // 5 seats moving from $39 (Enterprise) to $19 (Business)
      const { monthlySavings, annualSavings } = calculateSavings(5, 39, 19);
      expect(monthlySavings).toBe(100); // 5 * (39 - 19)
      expect(annualSavings).toBe(1200);
    });

    it('should handle zero affected seats', () => {
      const { monthlySavings, annualSavings } = calculateSavings(0, 20, 10);
      expect(monthlySavings).toBe(0);
      expect(annualSavings).toBe(0);
    });

    it('should handle edge case where new cost is greater than current cost (negative savings)', () => {
      // While the engine shouldn't naturally do this, the math should handle it safely
      const { monthlySavings, annualSavings } = calculateSavings(10, 20, 30);
      expect(monthlySavings).toBe(-100);
      expect(annualSavings).toBe(-1200);
    });
  });

  describe('formatCurrency', () => {
    it('should format standard whole numbers correctly', () => {
      expect(formatCurrency(1200)).toBe('$1,200');
      expect(formatCurrency(0)).toBe('$0');
    });

    it('should format large numbers correctly', () => {
      expect(formatCurrency(1000000)).toBe('$1,000,000');
    });

    it('should format negative numbers correctly', () => {
      expect(formatCurrency(-500)).toBe('-$500');
    });
  });
});
