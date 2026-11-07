import { describe, expect, it } from 'vitest';
import { NOW } from '../test/fixtures';
import { upsertSnapshot } from './snapshots';
import { summarize } from './valuation';

describe('upsertSnapshot', () => {
   const day = (date: string, totalUsd: number) => ({ date, totalUsd, investedUsd: totalUsd, cashUsd: 0, costUsd: 0 });

   it('keeps one snapshot per date, the latest refresh winning', () => {
      const s = summarize({ trades: [], cash: { USD: 500 } }, {}, { USD: 1 }, 'USD', NOW);
      const out = upsertSnapshot([day('2026-11-04', 100), day('2026-11-05', 200)], '2026-11-05', s, s);

      expect(out.map((x) => [x.date, x.totalUsd])).toEqual([
         ['2026-11-04', 100],
         ['2026-11-05', 500],
      ]);
   });
});
