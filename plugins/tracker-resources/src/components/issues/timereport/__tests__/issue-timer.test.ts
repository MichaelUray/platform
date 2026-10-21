// SPDX-License-Identifier: EPL-2.0

import {
  discardIssueTimer,
  formatElapsedTime,
  getElapsedTime,
  getReportHours,
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

  it('can discard after a failed save without retrying the report', async () => {
    startIssueTimer(storage, key, timer)
    const save = jest.fn().mockRejectedValue(new Error('Issue is unavailable'))
    await expect(stopIssueTimer(storage, key, timer.issueId, save, 3601000)).rejects.toThrow('Issue is unavailable')
    discardIssueTimer(storage, key, timer.reportId)
    expect(readIssueTimer(storage, key)).toBeUndefined()
    expect(save).toHaveBeenCalledTimes(1)
    expect(startIssueTimer(storage, key, { ...timer, reportId: 'next-report' })).toBe(true)
  })

  it.each(['invalid json', '{}', '{"startedAt":-1}', 'null'])('ignores invalid saved data: %s', (value) => {
    values.set(key, value)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('saves the elapsed duration once and clears the timer after success', async () => {
    startIssueTimer(storage, key, timer)
    const save = jest.fn().mockResolvedValue(undefined)
    await stopIssueTimer(storage, key, 'issue', save, 3601000)
    expect(save).toHaveBeenCalledWith({ ...timer, stoppedAt: 3601000 }, 1)
    expect(readIssueTimer(storage, key)).toBeUndefined()
    await stopIssueTimer(storage, key, 'issue', save, 7201000)
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('retains the stopped duration and report ID when saving fails so retry does not add time', async () => {
    startIssueTimer(storage, key, timer)
    const save = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
    await expect(stopIssueTimer(storage, key, 'issue', save, 3601000)).rejects.toThrow('Offline')
    expect(readIssueTimer(storage, key)).toEqual({ ...timer, stoppedAt: 3601000 })
    await stopIssueTimer(storage, key, 'issue', save, 7201000)
    expect(save).toHaveBeenLastCalledWith({ ...timer, stoppedAt: 3601000 }, 1)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('ignores a mismatched issue ID', async () => {
    startIssueTimer(storage, key, timer)
    const save = jest.fn()
    await stopIssueTimer(storage, key, 'another', save, 3601000)
    expect(save).not.toHaveBeenCalled()
    expect(readIssueTimer(storage, key)).toEqual(timer)
  })

  it('stops by the stored issue ID even when the stored identifier is stale', async () => {
    const movedTimer = { ...timer, identifier: 'OLD-1' }
    startIssueTimer(storage, key, movedTimer)
    const save = jest.fn().mockResolvedValue(undefined)
    await stopIssueTimer(storage, key, movedTimer.issueId, save, 3601000)
    expect(save).toHaveBeenCalledWith({ ...movedTimer, stoppedAt: 3601000 }, 1)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('does not create a zero-duration report', async () => {
    startIssueTimer(storage, key, timer)
    const save = jest.fn()
    await stopIssueTimer(storage, key, 'issue', save, timer.startedAt)
    expect(save).not.toHaveBeenCalled()
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('serializes overlapping stops so only one report is saved', async () => {
    startIssueTimer(storage, key, timer)
    let finishSave: () => void = () => {}
    const save = jest.fn(async () => {
      await new Promise<void>((resolve) => {
        finishSave = resolve
      })
    })
    const first = withIssueTimerLock(key, async () => {
      await stopIssueTimer(storage, key, 'issue', save, 3601000)
    })
    const second = withIssueTimerLock(key, async () => {
      await stopIssueTimer(storage, key, 'issue', save, 7201000)
    })
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    finishSave()
    await Promise.all([first, second])
    expect(save).toHaveBeenCalledTimes(1)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })

  it('releases the lock after a failed save', async () => {
    startIssueTimer(storage, key, timer)
    const save = jest.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(undefined)
    await expect(
      withIssueTimerLock(key, async () => {
        await stopIssueTimer(storage, key, 'issue', save, 3601000)
      })
    ).rejects.toThrow('Offline')
    await withIssueTimerLock(key, async () => {
      await stopIssueTimer(storage, key, 'issue', save, 7201000)
    })
    expect(save).toHaveBeenLastCalledWith({ ...timer, stoppedAt: 3601000 }, 1)
    expect(readIssueTimer(storage, key)).toBeUndefined()
  })
})
