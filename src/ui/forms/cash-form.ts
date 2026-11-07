import type { AppStore } from '../../app/state';
import { setCash } from '../../app/trades';
import { CASH_CURRENCY } from '../../domain/types';
import { $, field } from '../dom';
import type { RenderContext } from '../sections/context';

export interface CashForm {
   /** Shows the current balance as the input's placeholder. */
   render(ctx: RenderContext): void;
}

/** The cash balance form; `refresh` runs when the balance's currency has no FX rate yet. */
export function mountCashForm(store: AppStore, refresh: () => void): CashForm {
   const form = $<HTMLFormElement>('#cash-form');
   const amount = field(form, 'amount');

   form.addEventListener('submit', (event) => {
      event.preventDefault();
      setCash(store, Number(amount.value));
      form.reset();

      if (!store.get().market.fx[CASH_CURRENCY]) {
         refresh();
      }
   });

   return {
      render({ state, fmt }) {
         const balance = state.portfolio.cash[CASH_CURRENCY];

         amount.placeholder = balance === undefined ? 'No balance set' : `Current: ${fmt.money(balance, CASH_CURRENCY)}`;
      },
   };
}
