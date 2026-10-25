// SPDX-License-Identifier: EPL-2.0
//
// Copyright © 2026 Platform Collective Contributors
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0

import core, { type Ref, type Tx, type TxUpdateDoc } from '@hcengineering/core'
import type { TriggerControl } from '@hcengineering/server-core'
import task from '@hcengineering/task'
import tracker, { type Issue, type IssueStatus } from '@hcengineering/tracker'
import workflowRules, { type WorkflowRule } from '@hcengineering/workflow-rules'

import { isRegression } from './logic'

export { applyRuleToUpdate, isRegression } from './logic'

/**
 * Trigger body for `OnWorkflowRuleMirror`. Fires on every `TxUpdateDoc` whose
 * `objectClass` derives from `tracker.class.Issue`. Short-circuits early when
 * the update is not a status change, which keeps this cheap on the hot path -
 * most issue updates are not status moves.
 *
 * See `docs/workflow-rules/DESIGN.md` for the end-to-end flow description.
 * The echo-prevention here does NOT need a cascade token: the "no change
 * needed" check (`counterpart.status === target`) short-circuits the second
 * trigger invocation when the mirror lands on the counterpart. A cascade
 * token would still be the clearer design if we later want log-level
 * visibility into mirror chains; for v1 the equality check is sufficient.
 *
 * @public
 */
export async function OnWorkflowRuleMirror (txes: Tx[], control: TriggerControl): Promise<Tx[]> {
  const result: Tx[] = []
  for (const actualTx of txes) {
    if (actualTx._class !== core.class.TxUpdateDoc) continue
    const updateTx = actualTx as TxUpdateDoc<Issue>
    if (!control.hierarchy.isDerived(updateTx.objectClass, tracker.class.Issue)) continue

    const newStatus = updateTx.operations.status
    if (newStatus == null) continue

    const [source] = await control.findAll(
      control.ctx,
      tracker.class.Issue,
      { _id: updateTx.objectId },
      { limit: 1 }
    )
    if (source === undefined) continue

    const rules = (await control.findAll(
      control.ctx,
      workflowRules.class.WorkflowRule,
      { space: source.space, enabled: true }
    )) as unknown as WorkflowRule[]
    if (rules.length === 0) continue

    for (const rule of rules) {
      const counterpart = await resolveCounterpart(control, source, rule)

      if (counterpart === undefined) {
        // Auto-create path: the counterpart does not exist yet, and the new
        // status is in the rule's auto-create trigger set. Phase 3b will fill
        // this in with: resolve target TaskType, allocate next sequence
        // number, build identifier, copy inheritable fields, emit
        // TxCreateDoc<Issue> with attachedTo pointing at `source`. Deferred
        // from the first PR because sequence allocation needs its own review.
        if (rule.autoCreate != null && rule.autoCreate.triggerStatuses.includes(newStatus)) {
          control.ctx.info(
            '[workflow-rules] auto-create requested but not yet implemented',
            { ruleId: rule._id, sourceIssue: source._id, status: newStatus }
          )
        }
        continue
      }

      const target = rule.forwardMap[newStatus]
      if (target == null) continue
      if (counterpart.status === target) continue // echo short-circuit

      const regressed = await checkRegressionGuard(control, counterpart, target, rule)
      if (regressed) {
        control.ctx.info(
          '[workflow-rules] mirror suppressed by regression guard',
          {
            ruleId: rule._id,
            source: source._id,
            counterpart: counterpart._id,
            from: counterpart.status,
            to: target
          }
        )
        continue
      }

      result.push(
        control.txFactory.createTxUpdateDoc(
          counterpart._class,
          counterpart.space,
          counterpart._id,
          { status: target },
          false,
          updateTx.modifiedOn
        )
      )
    }
  }
  return result
}

/**
 * Resolve the counterpart Issue for a source Issue under a rule. Returns
 * `undefined` if no counterpart exists. Separate so the unit tests can
 * exercise each `linkKind` branch directly.
 *
 * @public
 */
export async function resolveCounterpart (
  control: TriggerControl,
  source: Issue,
  rule: WorkflowRule
): Promise<Issue | undefined> {
  switch (rule.linkKind) {
    case 'subIssue': {
      const [found] = await control.findAll(
        control.ctx,
        tracker.class.Issue,
        {
          attachedTo: source._id,
          attachedToClass: tracker.class.Issue,
          space: rule.linkedProject
        },
        { limit: 1 }
      )
      return found
    }
    case 'parentIssue': {
      if (source.attachedTo == null) return undefined
      if (source.attachedToClass !== tracker.class.Issue) return undefined
      const [found] = await control.findAll(
        control.ctx,
        tracker.class.Issue,
        {
          _id: source.attachedTo as Ref<Issue>,
          space: rule.linkedProject
        },
        { limit: 1 }
      )
      return found
    }
    default: {
      // Exhaustive check; a new WorkflowRuleLinkKind should be handled here.
      const _exhaustive: never = rule.linkKind
      return undefined
    }
  }
}

/**
 * Decide whether a proposed mirror update would move the counterpart to a
 * lower-rank status without an explicit `allowedLoops` entry. Rank is the
 * index position of a status in the TaskType's `statuses` list of the target
 * project; the TaskType is the authority on ordering.
 *
 * Returns `true` to BLOCK the move (regressed without a loop allowance),
 * `false` to let it through.
 *
 * @public
 */
export async function checkRegressionGuard (
  control: TriggerControl,
  counterpart: Issue,
  target: Ref<IssueStatus>,
  rule: WorkflowRule
): Promise<boolean> {
  const [tt] = await control.findAll(
    control.ctx,
    task.class.TaskType,
    { _id: counterpart.kind },
    { limit: 1 }
  )
  if (tt === undefined) return false

  const statuses: Array<Ref<IssueStatus>> = (tt.statuses as Array<Ref<IssueStatus>>) ?? []
  return isRegression(counterpart.status, target, statuses, rule.allowedLoops)
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async () => ({
  trigger: {
    OnWorkflowRuleMirror
  }
})
