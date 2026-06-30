import type { InventorySourceType, MerchantInventorySnapshotItemPayload } from './api'

export interface InventorySnapshotDraftRow {
  source_type: InventorySourceType
  rule_id: string
  product: string
  quantity: string
}

export interface InventorySnapshotPayloadResult {
  items: MerchantInventorySnapshotItemPayload[]
  error: string
}

export function buildInventorySnapshotPayload(
  rows: InventorySnapshotDraftRow[]
): InventorySnapshotPayloadResult {
  const items: MerchantInventorySnapshotItemPayload[] = []
  const seenRuleIds = new Set<string>()

  for (const row of rows) {
    const ruleId = row.rule_id.trim()
    if (seenRuleIds.has(ruleId)) {
      return { items: [], error: `duplicate rule_id: ${ruleId}` }
    }
    seenRuleIds.add(ruleId)

    const rawQuantity = row.quantity.trim()
    if (!/^\d+$/.test(rawQuantity)) {
      return { items: [], error: `${row.product}：请填写库存数量` }
    }

    const quantity = Number(rawQuantity)
    if (!Number.isSafeInteger(quantity) || quantity < 0) {
      return { items: [], error: `${row.product}：库存数量需为非负整数` }
    }

    items.push({
      source_type: row.source_type,
      rule_id: ruleId,
      quantity,
    })
  }

  return { items, error: '' }
}

export function calculateInventoryQuantityTotal(rows: InventorySnapshotDraftRow[]) {
  return rows.reduce((total, row) => {
    const rawQuantity = row.quantity.trim()
    if (!/^\d+$/.test(rawQuantity)) return total

    const quantity = Number(rawQuantity)
    if (!Number.isSafeInteger(quantity) || quantity < 0) return total

    return total + quantity
  }, 0)
}

export function hasValidInventorySnapshotQuantities(rows: InventorySnapshotDraftRow[]) {
  return rows.length > 0 && rows.every((row) => {
    const rawQuantity = row.quantity.trim()
    if (!/^\d+$/.test(rawQuantity)) return false

    const quantity = Number(rawQuantity)
    return Number.isSafeInteger(quantity) && quantity >= 0
  })
}
