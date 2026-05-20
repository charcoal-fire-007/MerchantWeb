import assert from 'node:assert/strict'
import test from 'node:test'
import type { MerchantNotification } from '../src/api.ts'
import { getRecentUnreadNotifications } from '../src/notifications.ts'

function notification(
  id: string,
  assignedAt: string,
  options: Partial<MerchantNotification> = {},
): MerchantNotification {
  return {
    id,
    merchant_name: '米奇租赁官方',
    product: `商品${id}`,
    order_title: `订单${id}`,
    assigned_at: assignedAt,
    ...options,
  }
}

test('getRecentUnreadNotifications keeps only unread dispatches from the last two hours', () => {
  const now = new Date('2026-05-19T12:00:00+08:00')
  const items = [
    notification('fresh-1', '2026-05-19T11:59:00+08:00'),
    notification('fresh-2', '2026-05-19T10:00:00+08:00'),
    notification('old', '2026-05-19T09:59:59+08:00'),
    notification('server-read', '2026-05-19T11:30:00+08:00', { read_at: '2026-05-19T11:31:00+08:00' }),
    notification('local-read', '2026-05-19T11:20:00+08:00'),
    notification('invalid-date', 'not-a-date'),
  ]

  const result = getRecentUnreadNotifications(items, {
    now,
    localReadIds: new Set(['local-read']),
  })

  assert.deepEqual(result.map((item) => item.id), ['fresh-1', 'fresh-2'])
})

test('getRecentUnreadNotifications sorts newest first for dashboard preview top-up', () => {
  const now = new Date('2026-05-19T12:00:00+08:00')
  const items = [
    notification('older', '2026-05-19T10:30:00+08:00'),
    notification('newest', '2026-05-19T11:58:00+08:00'),
    notification('middle', '2026-05-19T11:00:00+08:00'),
  ]

  const result = getRecentUnreadNotifications(items, { now })

  assert.deepEqual(result.map((item) => item.id), ['newest', 'middle', 'older'])
})
