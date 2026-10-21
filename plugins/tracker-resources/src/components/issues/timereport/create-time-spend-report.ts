// SPDX-License-Identifier: EPL-2.0

import { Analytics } from '@hcengineering/analytics'
import type { AttachedData, Ref, Space, TxOperations } from '@hcengineering/core'
import { TrackerEvents } from '@hcengineering/tracker'
import type { Issue, TimeSpendReport } from '@hcengineering/tracker'
import tracker from '../../../plugin'

interface TimeReportIssue extends Pick<Issue, '_id' | '_class'> {
  space: Ref<Space>
  identifier?: string
}

/** Create a time report through the issue collection so existing time totals and activity are updated. */
export async function createTimeSpendReport (
  client: TxOperations,
  issue: TimeReportIssue,
  data: AttachedData<TimeSpendReport>,
  id?: Ref<TimeSpendReport>
): Promise<void> {
  await client.addCollection(tracker.class.TimeSpendReport, issue.space, issue._id, issue._class, 'reports', data, id)
  Analytics.handleEvent(TrackerEvents.IssueTimeSpentAdded, { issue: issue.identifier ?? issue._id })
}
