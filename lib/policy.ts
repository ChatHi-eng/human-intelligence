// Palam's cancellation & no-show policy (launch version).
//
// - Cancelling / rescheduling is free for either side until 24 hours before
//   the session starts. Inside 24 hours, a customer who cancels forfeits the
//   payment; an expert who cancels always triggers a full refund.
// - A session counts as a no-show when someone hasn't joined within
//   10 minutes of the start. Either participant can report one from the
//   booking screen until 72 hours after the start; a human reviews every
//   report. The refund-booking Edge Function enforces the 24-hour rule
//   server-side — these helpers exist so the UI tells the truth up front.

export const CANCEL_CUTOFF_HOURS = 24;
export const NO_SHOW_GRACE_MINUTES = 10;
export const NO_SHOW_REPORT_WINDOW_HOURS = 72;

/** True while the booking can still be cancelled with a full refund. */
export const isFreeCancellation = (startIso: string, now: Date = new Date()): boolean =>
  new Date(startIso).getTime() - now.getTime() > CANCEL_CUTOFF_HOURS * 3_600_000;

/** True from start+10min until start+72h — when a no-show can be reported. */
export const isWithinNoShowReportWindow = (startIso: string, now: Date = new Date()): boolean => {
  const start = new Date(startIso).getTime();
  const t = now.getTime();
  return (
    t >= start + NO_SHOW_GRACE_MINUTES * 60_000 &&
    t <= start + NO_SHOW_REPORT_WINDOW_HOURS * 3_600_000
  );
};
