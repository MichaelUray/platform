//
// Copyright © 2026 Hardcore Engineering Inc.
//
// Licensed under the Eclipse Public License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License. You may
// obtain a copy of the License at https://www.eclipse.org/legal/epl-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//
// See the License for the specific language governing permissions and
// limitations under the License.
//
// SPDX-License-Identifier: EPL-2.0
//

import activity, { type DocUpdateMessage } from '@hcengineering/activity'
import core, { type AccountUuid, type Doc, type Ref, type Tx, type TxUpdateDoc, TxFactory } from '@hcengineering/core'
import notification, {
  type DocNotifyContext,
  type InboxNotification,
  type NotificationProvider,
  type NotificationType,
  type NotificationTypeSetting
} from '@hcengineering/notification'
import type { TriggerControl } from '@hcengineering/server-core'
import type { ReceiverInfo, SenderInfo } from '@hcengineering/server-notification'
import { getCommonNotificationTxes, getNotificationTxes } from '../index'
import * as utils from '../utils'
import { isShouldNotifyTx, NotificationProviderControl } from '../utils'

// Use a non-tracker document, field, type and provider: coverage is generic.
const RECIPIENT = 'recipient' as AccountUuid
const SOCIAL_ID = 'recipient-social'
const COVERAGE_KEY = 'notification:provider-coverage'
const provider = { _id: 'test:provider:Delivery', defaultEnabled: true } as NotificationProvider
const inbox = { _id: notification.providers.InboxNotificationProvider, defaultEnabled: true } as NotificationProvider
const changeType = {
  _id: 'test:type:Change', defaultEnabled: true, field: 'title',
  txClasses: [core.class.TxUpdateDoc], objectClass: core.class.Doc
} as unknown as NotificationType
const summaryType = { _id: 'test:type:Summary', defaultEnabled: true } as NotificationType
const summary = { _id: 'summary-tx' } as Tx

function makeControl (marked = true): TriggerControl {
  return {
    txes: [summary],
    contextCache: new Map(marked ? [[COVERAGE_KEY, new Map([['tx1', [{
      summary: summary._id, recipient: RECIPIENT, provider: provider._id, type: summaryType._id, field: 'title'
    }]]])]] : []),
    modelDb: {
      findObject: jest.fn().mockReturnValue(summaryType),
      findAllSync: jest.fn((clazz: unknown) => {
        if (clazz === notification.class.NotificationProvider) return [provider, inbox]
        if (clazz === notification.class.NotificationType) return [changeType]
        return []
      })
    },
    hierarchy: {
      getBaseClass: (clazz: unknown) => clazz,
      isDerived: (clazz: unknown, parent: unknown) => clazz === parent,
      hasMixin: () => false
    }
  } as unknown as TriggerControl
}

function makeUpdate (): TxUpdateDoc<Doc> {
  return {
    _id: 'tx1', _class: core.class.TxUpdateDoc, space: core.space.Tx,
    objectSpace: 'project1', objectId: 'document1', objectClass: core.class.Doc,
    modifiedBy: 'author', modifiedOn: 1, operations: { title: 'changed' }
  } as unknown as TxUpdateDoc<Doc>
}

async function notify (control: TriggerControl, settings: NotificationTypeSetting[] = [], tx = makeUpdate ()) {
  return await isShouldNotifyTx(
    control, tx, {} as Doc,
    { account: RECIPIENT, socialIds: [SOCIAL_ID], employee: 'employee' } as unknown as ReceiverInfo,
    false, false, new NotificationProviderControl([], settings)
  )
}

describe('notification provider coverage', () => {
  it('suppresses only the covered provider and keeps inbox delivery', async () => {
    const control = makeControl()
    const result = await notify(control)
    expect(control.modelDb.findObject).toHaveBeenCalledTimes(1)
    expect(result.has(provider._id)).toBe(false)
    expect(result.get(inbox._id)).toEqual([changeType])
  })

  it.each(['activity', 'common'])('passes explicit coverage through the %s notification producer', async (kind) => {
    const control = makeControl()
    const tx = makeUpdate()
    const object = { _id: tx.objectId, _class: tx.objectClass, space: tx.objectSpace } as Doc
    const receiver = {
      account: RECIPIENT, socialIds: [SOCIAL_ID], employee: 'employee', space: 'person-space'
    } as unknown as ReceiverInfo
    const sender = { socialId: tx.modifiedBy } as SenderInfo
    const context = { _id: 'context', objectId: object._id, user: RECIPIENT } as DocNotifyContext
    control.txFactory = new TxFactory(core.account.System)
    control.findAll = jest.fn().mockResolvedValue([context])
    const content = jest.spyOn(utils, 'getNotificationContent').mockResolvedValue({
      title: notification.string.CommonNotificationTitle, body: notification.string.CommonNotificationBody, intlParams: {}
    })
    try {
      const result = kind === 'activity'
        ? await getNotificationTxes(
          control.ctx, control, object, tx, receiver, sender,
          { isOwn: false, isSpace: false, shouldUpdateTimestamp: false }, [context],
          [{ _id: 'message', _class: activity.class.DocUpdateMessage, attachedTo: object._id } as DocUpdateMessage],
          new NotificationProviderControl([], [])
        )
        : await getCommonNotificationTxes(
          control.ctx, control, object, {}, receiver, sender, object._id, object._class, object.space, 1,
          await notify(control), notification.class.CommonInboxNotification, tx
        )
      const notificationTx = result[0] as unknown as { objectId: Ref<InboxNotification> }
      expect(control.contextCache.get('notification:provider-suppressions').get(notificationTx.objectId))
        .toEqual([provider._id])
      expect(control.contextCache.get('AvailableNotificationProviders').get(notificationTx.objectId))
        .toEqual([inbox._id])
      expect(JSON.stringify(result)).not.toContain('notification:provider-suppressions')
    } finally {
      content.mockRestore()
    }
  })

  it.each([false, true])('uses explicit summary input regardless of its position (reversed=%s)', async (reversed) => {
    const control = makeControl()
    control.txes = [summary, makeUpdate()]
    if (reversed) control.txes.reverse()
    expect((await notify(control)).has(provider._id)).toBe(false)
  })

  it('keeps delivery when the recipient disabled the covering summary type', async () => {
    const result = await notify(makeControl(), [{
      attachedTo: provider._id, type: summaryType._id, enabled: false, createdBy: SOCIAL_ID
    } as NotificationTypeSetting])
    expect(result.get(provider._id)).toEqual([changeType])
  })

  it('does not look up a summary or check its settings on the unmarked hot path', async () => {
    const control = makeControl(false)
    for (let i = 0; i < 100; i++) await notify(control)
    expect(control.modelDb.findObject).not.toHaveBeenCalled()
    const queries = jest.mocked(control.modelDb.findAllSync).mock.calls
    expect(queries.filter(([clazz]) => clazz === notification.class.NotificationType)).toHaveLength(100)
    // One ordinary isAllowed per provider and invocation; no extra summary isAllowed.
    expect(queries.filter(([clazz]) => clazz === notification.class.NotificationProviderDefaults)).toHaveLength(200)
  })

  it.each(['recipient', 'field', 'summary'])('ignores a marker for another %s', async (key) => {
    const control = makeControl()
    const markers = control.contextCache.get(COVERAGE_KEY)
    markers.get('tx1')[0][key] = 'unrelated'
    const result = await notify(control)
    expect(result.get(provider._id)).toEqual([changeType])
    expect(control.modelDb.findObject).not.toHaveBeenCalled()
  })

  it('keeps delivery when the covering summary type is missing', async () => {
    const control = makeControl()
    jest.mocked(control.modelDb.findObject).mockReturnValue(undefined)
    expect((await notify(control)).get(provider._id)).toEqual([changeType])
  })

  it('ignores forged transaction meta', async () => {
    const tx = makeUpdate()
    tx.meta = { [COVERAGE_KEY]: JSON.stringify([{ recipient: RECIPIENT }]) }
    expect((await notify(makeControl(false), [], tx)).get(provider._id)).toEqual([changeType])
  })
})
