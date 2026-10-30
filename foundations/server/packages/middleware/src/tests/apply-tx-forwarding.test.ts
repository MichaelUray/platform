// SPDX-License-Identifier: EPL-2.0

import core, { type Doc, type MeasureContext, MeasureMetricsContext, type Ref, type Tx, TxFactory } from '@hcengineering/core'
import type { Middleware, PipelineContext, TxMiddlewareResult } from '@hcengineering/server-core'
import { ApplyTxMiddleware } from '../applyTx'

describe('ApplyTxMiddleware forwarding order', () => {
  it('forwards every plain transaction before an ApplyIf, then its contents and trailing transactions', async () => {
    const factory = new TxFactory(core.account.System)
    const update = (id: string): Tx => factory.createTxUpdateDoc(
      core.class.Doc, core.space.Workspace, id as Ref<Doc>, {}
    )
    const first = update('first')
    const second = update('second')
    const nested = update('nested')
    const last = update('last')
    const apply = factory.createTxApplyIf(core.space.Tx, undefined, [], [], [nested], undefined)
    const received: Tx[][] = []
    const next = {
      tx: async (_ctx: MeasureContext, txes: Tx[]): Promise<TxMiddlewareResult> => {
        received.push([...txes])
        return {}
      }
    } as Middleware
    const context = {
      hierarchy: { isDerived: (value: unknown, parent: unknown) => value === parent }
    } as unknown as PipelineContext
    const ctx = new MeasureMetricsContext('test', {})
    const middleware = await ApplyTxMiddleware.create(ctx, context, next)

    await middleware.tx(ctx, [first, second, apply, last])

    expect(received).toEqual([[first, second], [nested], [last]])
  })
})
