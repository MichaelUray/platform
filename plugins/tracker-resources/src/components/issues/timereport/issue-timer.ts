// SPDX-License-Identifier: EPL-2.0

export interface RunningIssueTimer {
  issueId: string
  identifier: string
  reportId: string
  startedAt: number
  stoppedAt?: number
}

interface TimerStorage {
  getItem: (key: string) => string | null
  setItem: (key: string, value: string) => void
  removeItem: (key: string) => void
}

/** Calculate elapsed milliseconds from timestamps, including time spent outside the issue view. */
export function getElapsedTime (startedAt: number, now: number): number {
  return Number.isFinite(startedAt) && Number.isFinite(now) ? Math.max(0, now - startedAt) : 0
}

/** Round to the nearest minute, with a one-minute minimum, in the report's three-decimal hour format. */
export function getReportHours (elapsed: number): number {
  if (!Number.isFinite(elapsed) || elapsed <= 0) return 0
  return Math.round((Math.max(1, Math.round(elapsed / 60000)) / 60) * 1000) / 1000
}

/** Format a duration as hours, minutes and seconds without wrapping at midnight. */
export function formatElapsedTime (elapsed: number): string {
  const seconds = Math.floor(getElapsedTime(0, elapsed) / 1000)
  return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
    .map((value) => String(value).padStart(2, '0'))
    .join(':')
}

/** Restore a timer, ignoring malformed or obsolete browser data. Storage access errors propagate to the UI. */
export function readIssueTimer (storage: TimerStorage, key: string): RunningIssueTimer | undefined {
  const value = storage.getItem(key)
  if (value === null) return
  let data: unknown
  try {
    data = JSON.parse(value)
  } catch {
    return
  }
  if (typeof data !== 'object' || data === null) return
  const timer = data as Partial<RunningIssueTimer>
  if (
    typeof timer.issueId !== 'string' ||
    typeof timer.identifier !== 'string' ||
    typeof timer.reportId !== 'string' ||
    typeof timer.startedAt !== 'number' ||
    !Number.isFinite(timer.startedAt) ||
    timer.startedAt < 0 ||
    (timer.stoppedAt !== undefined &&
      (typeof timer.stoppedAt !== 'number' || !Number.isFinite(timer.stoppedAt) || timer.stoppedAt < timer.startedAt))
  ) {
    return
  }
  return timer as RunningIssueTimer
}

/** Start only when the user has no running or unsaved timer. Call under the user's timer lock. */
export function startIssueTimer (storage: TimerStorage, key: string, timer: RunningIssueTimer): boolean {
  if (readIssueTimer(storage, key) !== undefined) return false
  storage.setItem(key, JSON.stringify(timer))
  return true
}

/** Discard only the displayed timer, without saving a report. Call under the user's timer lock. */
export function discardIssueTimer (storage: TimerStorage, key: string, reportId: string): void {
  if (readIssueTimer(storage, key)?.reportId === reportId) storage.removeItem(key)
}

/** Freeze the duration before saving and retain it on failure. Call under the user's timer lock. */
export async function stopIssueTimer (
  storage: TimerStorage,
  key: string,
  issueId: string,
  save: (timer: RunningIssueTimer, hours: number) => Promise<void>,
  now: number = Date.now()
): Promise<void> {
  const timer = readIssueTimer(storage, key)
  if (timer === undefined || timer.issueId !== issueId) return
  timer.stoppedAt ??= Math.max(timer.startedAt, now)
  storage.setItem(key, JSON.stringify(timer))
  const hours = getReportHours(getElapsedTime(timer.startedAt, timer.stoppedAt))
  if (hours > 0) await save(timer, hours)
  storage.removeItem(key)
}

let pending: Promise<unknown> = Promise.resolve()

/** Serialize timer changes across browser tabs, or within this window if Web Locks are unavailable. */
export async function withIssueTimerLock (key: string, action: () => Promise<void>): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.locks !== undefined) {
    await navigator.locks.request(key, action)
  } else {
    const next = pending.then(action)
    pending = next.catch(() => {})
    await next
  }
}
