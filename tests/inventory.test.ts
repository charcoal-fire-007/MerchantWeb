import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildInventorySnapshotPayload,
  calculateInventoryQuantityTotal,
  hasValidInventorySnapshotQuantities,
} from '../src/inventory.ts'

test('buildInventorySnapshotPayload creates backend payload from valid draft rows', () => {
  const result = buildInventorySnapshotPayload([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '0' },
    { source_type: 'catalog', rule_id: 'rule-pocket3', product: 'Pocket 3', quantity: ' 2 ' },
  ])

  assert.equal(result.error, '')
  assert.deepEqual(result.items, [
    { source_type: 'owned', rule_id: 'rule-g9', quantity: 0 },
    { source_type: 'catalog', rule_id: 'rule-pocket3', quantity: 2 },
  ])
})

test('buildInventorySnapshotPayload rejects invalid quantities before submit', () => {
  const empty = buildInventorySnapshotPayload([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '' },
  ])
  const decimal = buildInventorySnapshotPayload([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '1.5' },
  ])
  const negative = buildInventorySnapshotPayload([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '-1' },
  ])
  const unsafe = buildInventorySnapshotPayload([
    {
      source_type: 'owned',
      rule_id: 'rule-g9',
      product: 'Canon G9',
      quantity: String(Number.MAX_SAFE_INTEGER + 1),
    },
  ])

  assert.match(empty.error, /Canon G9/)
  assert.deepEqual(empty.items, [])
  assert.match(decimal.error, /Canon G9/)
  assert.deepEqual(decimal.items, [])
  assert.match(negative.error, /Canon G9/)
  assert.deepEqual(negative.items, [])
  assert.match(unsafe.error, /Canon G9/)
  assert.deepEqual(unsafe.items, [])
})

test('buildInventorySnapshotPayload rejects duplicate rule ids across sources', () => {
  const result = buildInventorySnapshotPayload([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '1' },
    { source_type: 'catalog', rule_id: 'rule-g9', product: 'Canon G9 Catalog', quantity: '2' },
  ])

  assert.match(result.error, /duplicate rule_id/)
  assert.deepEqual(result.items, [])
})

test('calculateInventoryQuantityTotal sums only valid non-negative integer draft quantities', () => {
  const total = calculateInventoryQuantityTotal([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: ' 3 ' },
    { source_type: 'owned', rule_id: 'rule-a7m4', product: 'Sony A7M4', quantity: '0' },
    { source_type: 'catalog', rule_id: 'rule-pocket3', product: 'Pocket 3', quantity: '1.5' },
    { source_type: 'catalog', rule_id: 'rule-x100', product: 'X100', quantity: '' },
    { source_type: 'catalog', rule_id: 'rule-z8', product: 'Z8', quantity: '-1' },
    {
      source_type: 'catalog',
      rule_id: 'rule-r5',
      product: 'R5',
      quantity: String(Number.MAX_SAFE_INTEGER + 1),
    },
  ])

  assert.equal(total, 3)
})

test('hasValidInventorySnapshotQuantities only enables complete valid draft quantities', () => {
  assert.equal(hasValidInventorySnapshotQuantities([]), false)
  assert.equal(hasValidInventorySnapshotQuantities([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '' },
  ]), false)
  assert.equal(hasValidInventorySnapshotQuantities([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '1.5' },
  ]), false)
  assert.equal(hasValidInventorySnapshotQuantities([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '-1' },
  ]), false)
  assert.equal(hasValidInventorySnapshotQuantities([
    {
      source_type: 'owned',
      rule_id: 'rule-g9',
      product: 'Canon G9',
      quantity: String(Number.MAX_SAFE_INTEGER + 1),
    },
  ]), false)
  assert.equal(hasValidInventorySnapshotQuantities([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '0' },
    { source_type: 'catalog', rule_id: 'rule-pocket3', product: 'Pocket 3', quantity: ' 2 ' },
  ]), true)
})
