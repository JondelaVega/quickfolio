import { describe, expect, it } from 'vitest';
import { createFormat, formatMoney, MASK } from './format';

describe('createFormat', () => {
   const fx = { USD: 1, EUR: 0.8 };

   it('shows amounts and their other-currency equivalent normally', () => {
      const f = createFormat({ hideAmounts: false, fx, reporting: 'USD' });

      expect(f.money(1234.5, 'USD')).toBe('$1,234.50');
      expect(f.signedMoney(10, 'EUR', 0)).toBe('+€10');
      expect(f.qty(12.5)).toBe('12.5');
      expect(f.approx(100, 'USD')).toBe('≈ €80.00');
      expect(f.moneyAndPct('+$1', '+2%')).toBe('+$1 · +2%');
   });

   it('masks everything that reveals the portfolio’s size while amounts are hidden', () => {
      const f = createFormat({ hideAmounts: true, fx, reporting: 'USD' });

      expect(f.money(1234.5, 'USD')).toBe(MASK);
      expect(f.signedMoney(10, 'EUR')).toBe(`+${MASK}`);
      expect(f.qty(12.5)).toBe(MASK);
      expect(f.approx(100, 'USD')).toBe('');
      expect(f.moneyAndPct('+$1', '+2%')).toBe('+2%');
   });

   it('keeps per-share prices, which say nothing about size', () => {
      expect(createFormat({ hideAmounts: true, fx, reporting: 'USD' }).perShare(173.3, 'USD')).toBe('$173.30');
   });
});

describe('formatMoney', () => {
   it('never passes markup through for a code the browser rejects', () => {
      expect(formatMoney(1.5, '<b>x')).toBe('1.50 bx');
   });
});
