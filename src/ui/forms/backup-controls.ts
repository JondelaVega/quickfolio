import { backupStatus, exportData, markExported, readBackup, restoreBackup } from '../../app/backup';
import { message } from '../../domain/errors';
import type { AppStore } from '../../app/state';
import { today } from '../../domain/time';
import { $, esc } from '../dom';
import type { RenderContext } from '../sections/context';

export interface BackupControls {
   /** Shows when the trades and cash were last exported, and whether they changed since. */
   render(ctx: RenderContext): void;
}

/** The export button and the import file picker; `restored` runs after an import replaced the data. */
export function mountBackupControls(store: AppStore, restored: () => void): BackupControls {
   $('#export').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(exportData(store.get(), new Date()), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');

      a.href = URL.createObjectURL(blob);
      a.download = `quickfolio-${today()}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      markExported(store, today());
   });

   /** Replaces the portfolio with the file's, once confirmed; a file that can't be read changes nothing. */
   async function importFile(file: File): Promise<void> {
      try {
         const backup = readBackup(await file.text());
         const history = backup.snapshots.length;
         const what = `${backup.portfolio.trades.length} trade(s)` + (history ? ` and ${history} day(s) of history` : '');

         if (!confirm(`Replace current trades and cash with ${what} from ${file.name}?`)) {
            return;
         }

         restoreBackup(store, backup, today());
         restored();
      } catch (e) {
         alert(`Import failed: ${message(e)}`);
      }
   }

   $<HTMLInputElement>('#import').addEventListener('change', (event) => {
      const input = event.target as HTMLInputElement;
      const file = input.files?.[0];

      input.value = '';

      if (file) {
         void importFile(file);
      }
   });

   const status = $('#backup-status');

   return {
      render({ state }) {
         const { last, changed } = backupStatus(state, today());

         status.hidden = !last && !changed;
         status.innerHTML = !last
            ? 'Not exported yet.'
            : `Last exported on ${esc(last)}.${changed ? ' Changes since then are only in this browser.' : ''}`;
      },
   };
}
