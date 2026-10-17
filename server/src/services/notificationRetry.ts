export const getNotificationRetryDelayMs = (attemptCount: number) => {
  const safeAttempt = Number.isFinite(attemptCount) ? Math.max(1, Math.floor(attemptCount)) : 1;
  return Math.min(24 * 60 * 60 * 1000, 30_000 * (2 ** Math.min(safeAttempt - 1, 12)));
};
