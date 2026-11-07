import { buildExport, exportMark, fingerprint } from '../backup/export';
import { parsePortfolio, parseSnapshots } from '../backup/schema';
import { isIsoDate } from '../domain/codes';
import type { Snapshot } from '../domain/snapshots';
import { DAY, tradeTime } from '../domain/time';
import type { Portfolio } from '../domain/types';
import { summarize } from '../domain/valuation';
import type { AppState, AppStore } from './state';
import { eurUsdNow } from './view';

/** The export file's content. Snapshots are included because, unlike prices, they cannot be re-fetched. */
export function exportData({ portfolio, market, snapshots }: AppState, exportedAt: Date) {
   return buildExport(
      portfolio,
      snapshots,
      summarize(portfolio, market.quotes, market.fx, 'USD'),
      summarize(portfolio, market.quotes, market.fx, 'EUR'),
      { refreshedAt: market.refreshedAt, fxDate: market.fxDate, eurUsd: eurUsdNow(market.fx) },
      exportedAt,
   );
}

export interface Backup {
   portfolio: Portfolio;
   /** Empty when the file has none. */
   snapshots: Snapshot[];
   /** The day the file was exported, `YYYY-MM-DD`, when it says. */
   exportedOn?: string;
}

/** Reads an export file of any version; throws with a readable message when it isn't one. */
export function readBackup(text: string): Backup {
   const data: unknown = JSON.parse(text);
   const exportedAt = (data as { exportedAt?: unknown }).exportedAt;
   const exportedOn = typeof exportedAt === 'string' ? exportedAt.slice(0, 10) : undefined;

   return {
      portfolio: parsePortfolio(data),
      snapshots: parseSnapshots((data as { snapshots?: unknown }).snapshots),
      exportedOn: isIsoDate(exportedOn) ? exportedOn : undefined,
   };
}

/**
 * Replaces trades and cash, and the history too when the backup has one.
 * The file holds exactly what is now loaded, so it counts as the latest export.
 */
export function restoreBackup(store: AppStore, backup: Backup, today: string): void {
   store.update((s) => ({
      ...s,
      portfolio: backup.portfolio,
      snapshots: backup.snapshots.length ? backup.snapshots : s.snapshots,
      lastExport: exportMark(backup.portfolio, backup.exportedOn ?? today),
   }));
}

/** Records that the current trades and cash were exported on `today`. */
export const markExported = (store: AppStore, today: string): void =>
   store.update((s) => ({ ...s, lastExport: exportMark(s.portfolio, today) }));

/** Changes that are in no export are worth a warning once the latest export is this old. */
const REMIND_AFTER_DAYS = 14;

export interface BackupStatus {
   /** The latest export's date, `YYYY-MM-DD`. */
   last?: string;
   /** Trades or cash differ from the latest export, or were never exported. */
   changed: boolean;
   /** The changes deserve a warning: nothing was ever exported, or not for a while, and the warning wasn't dismissed. */
   remind: boolean;
}

/** Whether the trades and cash in this browser are also in an export file. */
export function backupStatus({ portfolio, lastExport, backupReminderDismissed }: AppState, today: string): BackupStatus {
   const empty = portfolio.trades.length === 0 && Object.keys(portfolio.cash).length === 0;
   const changed = !empty && lastExport?.fingerprint !== fingerprint(portfolio);
   const age = lastExport ? (tradeTime(today) - tradeTime(lastExport.date)) / DAY : Infinity;

   return { last: lastExport?.date, changed, remind: changed && age >= REMIND_AFTER_DAYS && !backupReminderDismissed };
}

/** Hides the backup reminder for good; the Backup panel still says what isn't exported. */
export const dismissBackupReminder = (store: AppStore): void => store.update((s) => ({ ...s, backupReminderDismissed: true }));
