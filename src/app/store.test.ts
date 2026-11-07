import { describe, expect, it } from 'vitest';
import { createStore } from './store';

describe('createStore', () => {
   it('notifies subscribers with the new and previous state, in subscription order', () => {
      const store = createStore({ n: 1 });
      const seen: string[] = [];

      store.subscribe((s, prev) => seen.push(`a ${prev.n}→${s.n}`));
      const off = store.subscribe((s) => seen.push(`b ${s.n}`));

      store.update((s) => ({ n: s.n + 1 }));
      off();
      store.update((s) => ({ n: s.n + 1 }));
      expect(seen).toEqual(['a 1→2', 'b 2', 'a 2→3']);
      expect(store.get().n).toBe(3);
   });

   it('stays silent when an update returns the same state', () => {
      const store = createStore({ n: 1 });
      let calls = 0;

      store.subscribe(() => calls++);
      store.update((s) => s);
      expect(calls).toBe(0);
   });

   it('keeps notifying when a subscriber throws, then rethrows its error', () => {
      const store = createStore({ n: 1 });
      const seen: number[] = [];

      store.subscribe(() => {
         throw new Error('storage full');
      });
      store.subscribe((s) => seen.push(s.n));
      expect(() => store.update(() => ({ n: 2 }))).toThrow('storage full');
      expect(seen).toEqual([2]);
      expect(store.get().n).toBe(2);
   });
});
