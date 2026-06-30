import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PREVIEW_INVENTORY_OPTIONS,
  PREVIEW_LATEST_INVENTORY,
  PREVIEW_MERCHANT_SESSION,
  createPreviewFeedbackRecord,
  createPreviewProductApplicationRecord,
  isLocalPreviewMode,
} from '../src/preview.ts'

test('local preview mode only works in dev with preview query flag', () => {
  assert.equal(isLocalPreviewMode(true, '?preview=1'), true)
  assert.equal(isLocalPreviewMode(true, '?foo=bar&preview=1'), true)
  assert.equal(isLocalPreviewMode(true, '?preview=0'), false)
  assert.equal(isLocalPreviewMode(false, '?preview=1'), false)
})

test('local preview data lets merchants inspect inventory page without backend', () => {
  assert.equal(PREVIEW_MERCHANT_SESSION.merchantName, '小胡租赁')
  assert.ok(PREVIEW_INVENTORY_OPTIONS.owned.length > 0)
  assert.ok(PREVIEW_INVENTORY_OPTIONS.catalog.length > 0)
  assert.ok(PREVIEW_LATEST_INVENTORY.items.some((item) => item.source_type === 'owned'))
  assert.ok(PREVIEW_LATEST_INVENTORY.items.some((item) => item.source_type === 'catalog'))

  const latestQuantities = new Map(
    PREVIEW_LATEST_INVENTORY.items.map((item) => [item.rule_id, item.quantity]),
  )
  for (const option of [...PREVIEW_INVENTORY_OPTIONS.owned, ...PREVIEW_INVENTORY_OPTIONS.catalog]) {
    if (typeof option.latest_quantity === 'number') {
      assert.equal(latestQuantities.get(option.rule_id), option.latest_quantity)
    }
  }
})

test('local preview creates client-side submission records', () => {
  const application = createPreviewProductApplicationRecord(
    {
      application_type: 'new_product',
      product: '尼康 Z8',
      reason: '可接单',
      contact: 'preview_merchant',
    },
    new Date('2026-06-30T08:00:00.000+08:00'),
  )

  assert.equal(application.application_type, 'new_product')
  assert.equal(application.status, 'submitted')
  assert.equal(application.product, '尼康 Z8')
  assert.equal(application.reason, '可接单')
  assert.equal(application.created_at, '2026-06-30T00:00:00.000Z')

  const feedback = createPreviewFeedbackRecord(
    {
      type: 'price_suggestion',
      product: '佳能 G9',
      rule_id: 'preview-canon-g9',
      price_issue_type: 'price_unreasonable',
      price_per_day: 80,
      reason: '建议调整',
      contact: 'preview_merchant',
    },
    new Date('2026-06-30T08:05:00.000+08:00'),
  )

  assert.equal(feedback.type, 'price_suggestion')
  assert.equal(feedback.status, 'submitted')
  assert.equal(feedback.product, '佳能 G9')
  assert.equal(feedback.price_per_day, 80)
  assert.equal(feedback.created_at, '2026-06-30T00:05:00.000Z')
})
