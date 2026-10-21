<!-- SPDX-License-Identifier: EPL-2.0 -->
<script lang="ts">
  import { getCurrentEmployee } from '@hcengineering/contact'
  import { generateId, getCurrentAccount } from '@hcengineering/core'
  import type { Ref } from '@hcengineering/core'
  import { setPlatformStatus, unknownError } from '@hcengineering/platform'
  import { getClient, getCurrentWorkspaceUuid } from '@hcengineering/presentation'
  import type { Issue, TimeSpendReport } from '@hcengineering/tracker'
  import { Button, Label } from '@hcengineering/ui'
  import { onMount } from 'svelte'
  import { writable } from 'svelte/store'
  import tracker from '../../../plugin'
  import { createTimeSpendReport } from './create-time-spend-report'
  import {
    discardIssueTimer,
    formatElapsedTime,
    getElapsedTime,
    readIssueTimer,
    startIssueTimer,
    stopIssueTimer,
    withIssueTimerLock
  } from './issue-timer'
  import type { RunningIssueTimer } from './issue-timer'

  export let issue: Issue

  const client = getClient()
  const employee = getCurrentEmployee()
  const key = `tracker:issue-timer:${getCurrentWorkspaceUuid()}:${getCurrentAccount().uuid}`
  const timer = writable<RunningIssueTimer | undefined>(undefined)
  let now = Date.now()
  let busy = false
  let unavailable = false

  function refresh(): void {
    try {
      timer.set(readIssueTimer(localStorage, key))
      now = Date.now()
      unavailable = false
    } catch (err) {
      if (!unavailable) void setPlatformStatus(unknownError(err))
      unavailable = true
    }
  }

  onMount(() => {
    refresh()
    const interval = setInterval(refresh, 1000)
    window.addEventListener('storage', refresh)
    return () => {
      clearInterval(interval)
      window.removeEventListener('storage', refresh)
    }
  })

  async function updateTimer(discard = false): Promise<void> {
    if (busy || unavailable) return
    busy = true
    // Capture the issue before waiting for the timer lock.
    const currentIssue = issue
    const displayedTimer = $timer
    try {
      await withIssueTimerLock(key, async () => {
        const running = readIssueTimer(localStorage, key)
        if (displayedTimer === undefined) {
          if (discard) return
          startIssueTimer(localStorage, key, {
            issueId: currentIssue._id,
            identifier: currentIssue.identifier,
            reportId: generateId(),
            startedAt: Date.now()
          })
        } else if (running?.reportId !== displayedTimer.reportId) {
          return
        } else if (discard) {
          discardIssueTimer(localStorage, key, displayedTimer.reportId)
        } else {
          await stopIssueTimer(localStorage, key, running.issueId, async (stopped, hours) => {
            const id = stopped.reportId as Ref<TimeSpendReport>
            // Retry safely if the server saved the report but its response was lost.
            if ((await client.findOne(tracker.class.TimeSpendReport, { _id: id })) === undefined) {
              const timedIssue = await client.findOne(tracker.class.Issue, { _id: stopped.issueId as Ref<Issue> })
              if (timedIssue === undefined) throw new Error(`Issue ${stopped.identifier} is unavailable`)
              await createTimeSpendReport(
                client,
                timedIssue,
                { employee, date: stopped.startedAt, value: hours, description: '' },
                id
              )
            }
          })
        }
      })
    } catch (err) {
      void setPlatformStatus(unknownError(err))
    } finally {
      busy = false
      refresh()
    }
  }

  $: label =
    $timer === undefined
      ? tracker.string.StartTimer
      : $timer.stoppedAt === undefined
        ? tracker.string.StopTimer
        : tracker.string.SaveTimer
</script>

{#if employee != null}
  <div class="flex-row-center gap-2">
    {#if $timer !== undefined}
      {#if $timer.issueId !== issue._id}
        <span class="nowrap">
          <Label label={tracker.string.TimerRunningOnIssue} params={{ issue: $timer.identifier }} />
        </span>
      {/if}
      <span class="nowrap">{formatElapsedTime(getElapsedTime($timer.startedAt, $timer.stoppedAt ?? now))}</span>
    {/if}
    <Button kind={'ghost'} size={'medium'} {label} disabled={busy || unavailable} on:click={() => updateTimer()} />
    {#if $timer !== undefined}
      <Button
        kind={'ghost'}
        size={'medium'}
        label={tracker.string.DiscardTimer}
        disabled={busy || unavailable}
        on:click={() => updateTimer(true)}
      />
    {/if}
  </div>
{/if}
