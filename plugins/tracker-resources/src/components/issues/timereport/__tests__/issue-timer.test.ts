// SPDX-License-Identifier: EPL-2.0

import {
  discardIssueTimer,
  formatElapsedTime,
  getElapsedTime,
  getReportHours,
  getStoppedTimerHours,
  readIssueTimer,
  startIssueTimer,
  stopIssueTimer,
  withIssueTimerLock
} from '../issue-timer'
import type { RunningIssueTimer } from '../issue-timer'

describe('issue timer duration', () => {
  it('uses timestamps so elapsed time survives reloads and suspended tabs', () => {
    expect(getElapsedTime(1000, 3662000)).toBe(3661000)
    expect(getElapsedTime(2000, 1000)).toBe(0)
    expect(getElapsedTime(NaN, 1000)).toBe(0)
  })

  it.each([
    [0, 0],
    [-1000, 0],
    [NaN, 0],
    [Infinity, 0],
    [1, 0.017],
    [60000, 0.017],
    [89999, 0.017],
    [90000, 0.033],
    [3600000, 1],
    [5400000, 1.5]
  ])('rounds %s milliseconds to %s report hours', (elapsed, hours) => {
    expect(getReportHours(elapsed)).toBe(hours)
  })

  it('formats elapsed seconds without wrapping after a day', () => {
    expect(formatElapsedTime(0)).toBe('00:00:00')
    expect(formatElapsedTime(3661999)).toBe('01:01:01')
    expect(formatElapsedTime(90000000)).toBe('25:00:00')
  })
})

describe('persisted issue timer', () => {
  const key = 'workspace:user'
  const timer: RunningIssueTimer = {
    issueId: 'issue',
    identifier: 'TEST-1',
    reportId: 'report',
    startedAt: 1000
  }
  let values: Map<string, string>
  let storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

  beforeEach(() => {
    values = new Map()
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key)
    }
  })

  it('restores the running timer and prevents replacing it with another issue', () => {
    expect(startIssueTimer(storage, key, timer)).toBe(true)
    expect(readIssueTimer(storage, key)).toEqual(timer)
    expect(startIssueTimer(storage, key, { ...timer, issueId: 'another' })).toBe(false)
    expect(readIssueTimer(storage, key)).toEqual(timer)
    expect(startIssueTimer(storage, 'workspace:other-user', { ...timer, issueId: 'another' })).toBe(true)
  })

  it('discards a timer for an unavailable issue and allows starting another timer', () => {
    startIssueTimer(storage, key, timer)
    discardIssueTimer(storage, key, timer.reportId)
    expect(readIssueTimer(storage, key)).toBeUndefined()
    expect(startIssueTimer(storage, key, { ...timer, issueId: 'another', reportId: 'next-report' })).toBe(true)
  })

  it('does not discard a replacement timer from a stale control', () => {
    const replacement = { ...timer, reportId: 'next-report' }
    startIssueTimer(storage, key, replacement)
    discardIssueTimer(storage, key, timer.reportId)
    expect(readIssueTimer(storage, key)).toEqual(replacement)
  })

  it('can discard a stopped timer whose report was not saved', () => {
    startIssueTimer(storage, key, timer)
    stopIssueTimer(storage, key, timer.reportId, 3601000)
    discardIssueTimer(storage, key, timer.reportId)
    expect(readIssueTimer(storage, key)).toBeUndefined()
    expect(startIssueTimer(storage, key, { ...timer, reportId: 'next-report' })).toBe(true)
  })

  it('refuses to start while a stopped timer still awaits its report', () => {
    startIssueTimer(storage, key, timer)
    stopIssueTimer(storage, key, timer.reportId, 3601000)
    expect(startIssueTimer(storage, key, { ...timer, issueId: 'another', reportId: 'next-report' })).toBe(false)
  })

  it.each(['invalid json', '{}', '{"startedAt":-1}', 'null'])('ignores invalid saved data: %s', (value) => {
    values.set(key, value)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('freezes the elapsed duration when stopped and keeps the timer until the report is saved', () => {
    startIssueTimer(storage, key, timer)
    const stopped = stopIssueTimer(storage, key, timer.reportId, 3601000)
    expect(stopped).toEqual({ ...timer, stoppedAt: 3601000 })
    expect(readIssueTimer(storage, key)).toEqual({ ...timer, stoppedAt: 3601000 })
    expect(getStoppedTimerHours(stopped as RunningIssueTimer)).toBe(1)
    discardIssueTimer(storage, key, timer.reportId)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('keeps the first stop time when stopping again, e.g. after the report popup was cancelled', () => {
    startIssueTimer(storage, key, timer)
    stopIssueTimer(storage, key, timer.reportId, 3601000)
    expect(stopIssueTimer(storage, key, timer.reportId, 7201000)).toEqual({ ...timer, stoppedAt: 3601000 })
  })

  it('reports long durations unchanged so the user can correct them in the report popup', () => {
    startIssueTimer(storage, key, timer)
    const stopped = stopIssueTimer(storage, key, timer.reportId, timer.startedAt + 13 * 3600000)
    expect(getStoppedTimerHours(stopped as RunningIssueTimer)).toBe(13)
  })

  it('ignores a stop for a timer that another tab saved or replaced', () => {
    expect(stopIssueTimer(storage, key, timer.reportId, 3601000)).toBeUndefined()
    const replacement = { ...timer, reportId: 'next-report' }
    startIssueTimer(storage, key, replacement)
    expect(stopIssueTimer(storage, key, timer.reportId, 3601000)).toBeUndefined()
    expect(readIssueTimer(storage, key)).toEqual(replacement)
  })

  it('stops by the stored report ID even when the stored identifier is stale', () => {
    const movedTimer = { ...timer, identifier: 'OLD-1' }
    startIssueTimer(storage, key, movedTimer)
    expect(stopIssueTimer(storage, key, movedTimer.reportId, 3601000)).toEqual({ ...movedTimer, stoppedAt: 3601000 })
  })

  it('reports zero hours for a zero-duration timer', () => {
    startIssueTimer(storage, key, timer)
    const stopped = stopIssueTimer(storage, key, timer.reportId, timer.startedAt)
    expect(getStoppedTimerHours(stopped as RunningIssueTimer)).toBe(0)
  })

  it('serializes overlapping changes so only one stop wins', async () => {
    startIssueTimer(storage, key, timer)
    let finish: () => void = () => {}
    const results: Array<RunningIssueTimer | undefined> = []
    const first = withIssueTimerLock(key, async () => {
      results.push(stopIssueTimer(storage, key, timer.reportId, 3601000))
      await new Promise<void>((resolve) => {
        finish = resolve
      })
      discardIssueTimer(storage, key, timer.reportId)
    })
    const second = withIssueTimerLock(key, async () => {
      results.push(stopIssueTimer(storage, key, timer.reportId, 7201000))
    })
    await Promise.resolve()
    expect(results).toHaveLength(1)
    finish()
    await Promise.all([first, second])
    expect(results).toEqual([{ ...timer, stoppedAt: 3601000 }, undefined])
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('releases the lock after a failed action', async () => {
    await expect(
      withIssueTimerLock(key, async () => {
        throw new Error('Offline')
      })
    ).rejects.toThrow('Offline')
    startIssueTimer(storage, key, timer)
    await withIssueTimerLock(key, async () => {
      discardIssueTimer(storage, key, timer.reportId)
    })
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })
})
