// SPDX-License-Identifier: EPL-2.0
import type { Ref, Class, Doc } from '@hcengineering/core'
import type { Viewlet, ViewletDescriptor } from '@hcengineering/view'

export interface MobileStepResult {
  name: string
  outcome: 'ui' | 'url-recovery' | 'not-tested'
  cleanup: 'ok' | 'failed'
}

/** Resolve concrete model viewlets, excluding secondary Issue variants. */
export function resolveIssueViewlets (
  viewlets: Array<Pick<Viewlet, '_id' | 'attachTo' | 'descriptor' | 'variant'>>,
  issueClass: Ref<Class<Doc>>,
  listDescriptor: Ref<ViewletDescriptor>,
  boardDescriptor: Ref<ViewletDescriptor>
): { list: Ref<Viewlet>, board: Ref<Viewlet> } {
  const resolve = (descriptor: Ref<ViewletDescriptor>): Ref<Viewlet> => {
    const matches = viewlets.filter(
      (viewlet) => viewlet.attachTo === issueClass && viewlet.descriptor === descriptor && viewlet.variant === undefined
    )
    if (matches.length !== 1) throw new Error('Expected exactly one primary Issue viewlet per descriptor')
    return matches[0]._id
  }
  return { list: resolve(listDescriptor), board: resolve(boardDescriptor) }
}

/** Recovery is useful diagnostic evidence, but cannot pass touch acceptance. */
export function isUiSuccess (steps: MobileStepResult[]): boolean {
  return steps.length > 0 && steps.every((step) => step.outcome === 'ui' && step.cleanup === 'ok')
}
