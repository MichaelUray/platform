// SPDX-License-Identifier: EPL-2.0
//
// Copyright © 2026 Platform Collective Contributors
//
// Unit tests for the pure helpers. The trigger's control-plane interaction
// is covered by integration tests under tests/sanity when the UI lands.

import type { Ref } from '@hcengineering/core'
import type { IssueStatus } from '@hcengineering/tracker'
import type { WorkflowRule } from '@hcengineering/workflow-rules'

import { applyRuleToUpdate, isRegression } from '../logic'

const s = {
  backlog: 'status:backlog' as Ref<IssueStatus>,
  inProgress: 'status:in-progress' as Ref<IssueStatus>,
  review: 'status:review' as Ref<IssueStatus>,
  done: 'status:done' as Ref<IssueStatus>
}

describe('applyRuleToUpdate', () => {
  const map: Pick<WorkflowRule, 'forwardMap'> = {
    forwardMap: {
      [s.backlog]: s.backlog,
      [s.inProgress]: s.inProgress,
      [s.review]: s.done
    }
  }

  it('returns the mapped target when the status is in the map', () => {
    expect(applyRuleToUpdate(map, s.review)).toBe(s.done)
  })

  it('returns undefined when the source status has no mapping', () => {
    expect(applyRuleToUpdate(map, s.done)).toBeUndefined()
  })

  it('does not fall back to any default', () => {
    expect(applyRuleToUpdate({ forwardMap: {} }, s.backlog)).toBeUndefined()
  })
})

describe('isRegression', () => {
  const rank = [s.backlog, s.inProgress, s.review, s.done]

  it('allows forward moves', () => {
    expect(isRegression(s.backlog, s.review, rank, [])).toBe(false)
    expect(isRegression(s.inProgress, s.done, rank, [])).toBe(false)
  })

  it('blocks backward moves without an allow-list entry', () => {
    expect(isRegression(s.done, s.inProgress, rank, [])).toBe(true)
    expect(isRegression(s.review, s.backlog, rank, [])).toBe(true)
  })

  it('allows backward moves that match an allowedLoops entry', () => {
    const allowedLoops: WorkflowRule['allowedLoops'] = [{ from: s.review, to: s.inProgress }]
    expect(isRegression(s.review, s.inProgress, rank, allowedLoops)).toBe(false)
  })

  it('is strict about the direction of the allow-list entry', () => {
    // Allow-list entry is Review -> InProgress. Attempting Done -> Review is a
    // different pair and should still be blocked.
    const allowedLoops: WorkflowRule['allowedLoops'] = [{ from: s.review, to: s.inProgress }]
    expect(isRegression(s.done, s.review, rank, allowedLoops)).toBe(true)
  })

  it('is a same-rank no-op, not a regression', () => {
    expect(isRegression(s.review, s.review, rank, [])).toBe(false)
  })

  it('returns false (does not block) when a status is unknown', () => {
    // Rank table missing one of the statuses: we don't know enough to say
    // this is a regression, so we let it through — matches checkRegressionGuard.
    const unknown = 'status:unknown' as Ref<IssueStatus>
    expect(isRegression(unknown, s.review, rank, [])).toBe(false)
    expect(isRegression(s.review, unknown, rank, [])).toBe(false)
  })
})
