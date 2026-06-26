import assert from 'node:assert/strict'
import test from 'node:test'

import { buildInventorySnapshotPayload } from '../src/inventory.ts'

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

  assert.match(empty.error, /Canon G9/)
  assert.deepEqual(empty.items, [])
  assert.match(decimal.error, /Canon G9/)
  assert.deepEqual(decimal.items, [])
})

test('buildInventorySnapshotPayload rejects duplicate rule ids across sources', () => {
  const result = buildInventorySnapshotPayload([
    { source_type: 'owned', rule_id: 'rule-g9', product: 'Canon G9', quantity: '1' },
    { source_type: 'catalog', rule_id: 'rule-g9', product: 'Canon G9 Catalog', quantity: '2' },
  ])

  assert.match(result.error, /duplicate rule_id/)
  assert.deepEqual(result.items, [])
})
