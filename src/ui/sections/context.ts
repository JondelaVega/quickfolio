import type { AppState } from '../../app/state';
import type { Summary } from '../../domain/valuation';
import type { Format } from '../format';

/** Everything a dashboard section renders from; sections read nothing else. */
export interface RenderContext {
   state: AppState;
   /** What is shown: the whole portfolio, or the focused stock alone. */
   s: Summary;
   /** The whole portfolio, whatever is focused. */
   full: Summary;
   focused?: string;
   fmt: Format;
}
