/** Holds one immutable state value and tells subscribers about every replacement. */
export interface Store<S> {
   get(): S;
   /**
    * Replaces the state with `change(current)` and notifies subscribers
    * synchronously, in subscription order. A subscriber that throws doesn't
    * stop the others; the first error is rethrown once all have run.
    */
   update(change: (state: S) => S): void;
   /** Calls `listener` after every update with the new and the previous state; returns an unsubscribe. */
   subscribe(listener: (state: S, previous: S) => void): () => void;
}

export function createStore<S>(initial: S): Store<S> {
   let state = initial;
   const listeners = new Set<(state: S, previous: S) => void>();

   return {
      get: () => state,
      update(change) {
         const previous = state;

         state = change(state);

         if (state === previous) {
            return;
         }

         const next = state;
         const errors: unknown[] = [];

         for (const l of [...listeners]) {
            try {
               l(next, previous);
            } catch (e) {
               errors.push(e);
            }
         }

         if (errors.length) {
            throw errors[0];
         }
      },
      subscribe(listener) {
         listeners.add(listener);

         return () => listeners.delete(listener);
      },
   };
}
