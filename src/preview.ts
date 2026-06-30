import type {
  LoginResponse,
  MerchantFeedbackPayload,
  MerchantFeedbackRecord,
  MerchantInventoryLatestResponse,
  MerchantInventoryOptionsResponse,
  MerchantNotification,
  MerchantNotificationsResponse,
  MerchantProduct,
  MerchantProductApplicationPayload,
  MerchantProductApplicationRecord,
} from './api'
import type { MerchantSession } from './auth'

export const PREVIEW_TOKEN = 'local-preview-token'
let previewSubmissionSequence = 0

export const PREVIEW_MERCHANT_SESSION: MerchantSession = {
  merchantId: 'preview-merchant',
  merchantName: '小胡租赁',
  username: 'preview_merchant',
}

export const PREVIEW_LOGIN_RESPONSE: LoginResponse = {
  access_token: PREVIEW_TOKEN,
  token_type: 'bearer',
  role: 'merchant',
  subject: PREVIEW_MERCHANT_SESSION.username,
  merchant_id: PREVIEW_MERCHANT_SESSION.merchantId,
  merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
}

export const PREVIEW_PRODUCTS: MerchantProduct[] = [
  {
    rule_id: 'preview-canon-g9',
    product: '佳能 G9',
    keywords: [],
    merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
    weight: 1,
    available: true,
    reason: null,
    resume_at: null,
    updated_at: '2026-06-26T08:10:00.000+08:00',
  },
  {
    rule_id: 'preview-sony-a7m4',
    product: '索尼 A7M4',
    keywords: [],
    merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
    weight: 1,
    available: false,
    reason: null,
    resume_at: null,
    updated_at: '2026-06-26T07:40:00.000+08:00',
  },
  {
    rule_id: 'preview-dji-pocket3',
    product: '大疆 Pocket 3',
    keywords: [],
    merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
    weight: 1,
    available: true,
    reason: null,
    resume_at: null,
    updated_at: '2026-06-26T07:20:00.000+08:00',
  },
]

export const PREVIEW_NOTIFICATIONS: MerchantNotification[] = [
  {
    id: 'preview-dispatch-1',
    merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
    product: '佳能 G9',
    order_title: '本地预览订单',
    order_no: 'PREVIEW-001',
    rule_id: 'preview-canon-g9',
    assigned_at: '2026-06-26T08:06:00.000+08:00',
    read_at: null,
  },
]

export const PREVIEW_NOTIFICATIONS_RESPONSE: MerchantNotificationsResponse = {
  items: PREVIEW_NOTIFICATIONS,
  today_count: PREVIEW_NOTIFICATIONS.length,
  unread_count: PREVIEW_NOTIFICATIONS.length,
  chart: [
    { date: '2026-06-24', dispatch_count: 2, machine_count: 2 },
    { date: '2026-06-25', dispatch_count: 4, machine_count: 3 },
    { date: '2026-06-26', dispatch_count: 1, machine_count: 1 },
  ],
}

export const PREVIEW_INVENTORY_OPTIONS: MerchantInventoryOptionsResponse = {
  owned: [
    {
      source_type: 'owned',
      rule_id: 'preview-canon-g9',
      product: '佳能 G9',
      keywords: [],
      category: null,
      available: true,
      has_active_application: false,
      latest_quantity: 3,
    },
    {
      source_type: 'owned',
      rule_id: 'preview-sony-a7m4',
      product: '索尼 A7M4',
      keywords: [],
      category: null,
      available: false,
      has_active_application: false,
      latest_quantity: 1,
    },
  ],
  catalog: [
    {
      source_type: 'catalog',
      rule_id: 'preview-fuji-x100vi',
      product: '富士 X100VI',
      keywords: ['X100VI'],
      category: '相机',
      available: null,
      has_active_application: false,
      latest_quantity: null,
    },
    {
      source_type: 'catalog',
      rule_id: 'preview-insta360-x4',
      product: '影石 Insta360 X4',
      keywords: ['Insta360', 'X4'],
      category: '运动相机',
      available: null,
      has_active_application: true,
      latest_quantity: 2,
    },
  ],
}

export const PREVIEW_LATEST_INVENTORY: MerchantInventoryLatestResponse = {
  app_code: 'order_dispatch',
  items: [
    {
      merchant_id: PREVIEW_MERCHANT_SESSION.merchantId || 'preview-merchant',
      merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
      rule_id: 'preview-canon-g9',
      product: '佳能 G9',
      source_type: 'owned',
      quantity: 3,
      product_application_id: null,
      submitted_at: '2026-06-26T08:00:00.000+08:00',
    },
    {
      merchant_id: PREVIEW_MERCHANT_SESSION.merchantId || 'preview-merchant',
      merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
      rule_id: 'preview-sony-a7m4',
      product: PREVIEW_INVENTORY_OPTIONS.owned[1]?.product || 'Sony A7M4',
      source_type: 'owned',
      quantity: 1,
      product_application_id: null,
      submitted_at: '2026-06-26T08:01:00.000+08:00',
    },
    {
      merchant_id: PREVIEW_MERCHANT_SESSION.merchantId || 'preview-merchant',
      merchant_name: PREVIEW_MERCHANT_SESSION.merchantName,
      rule_id: 'preview-insta360-x4',
      product: '影石 Insta360 X4',
      source_type: 'catalog',
      quantity: 2,
      product_application_id: 'preview-application',
      submitted_at: '2026-06-26T08:02:00.000+08:00',
    },
  ],
}

export function isLocalPreviewMode(isDev: boolean, search: string) {
  return isDev && new URLSearchParams(search).get('preview') === '1'
}

function nextPreviewSubmissionId(prefix: string) {
  previewSubmissionSequence += 1
  return `${prefix}-${previewSubmissionSequence}`
}

export function createPreviewProductApplicationRecord(
  payload: MerchantProductApplicationPayload,
  now = new Date(),
): MerchantProductApplicationRecord {
  const timestamp = now.toISOString()
  return {
    id: nextPreviewSubmissionId('preview-product-application'),
    application_type: payload.application_type,
    status: 'submitted',
    product: payload.product,
    product_id: payload.product_id ?? null,
    rule_id: payload.rule_id ?? null,
    model_note: payload.model_note ?? null,
    reason: payload.reason ?? null,
    contact: payload.contact ?? null,
    rejection_reason: null,
    created_at: timestamp,
    updated_at: timestamp,
  }
}

export function createPreviewFeedbackRecord(
  payload: MerchantFeedbackPayload,
  now = new Date(),
): MerchantFeedbackRecord {
  const timestamp = now.toISOString()
  return {
    id: nextPreviewSubmissionId('preview-feedback'),
    type: payload.type,
    status: 'submitted',
    product: payload.product ?? null,
    rule_id: payload.rule_id ?? null,
    issue_type: payload.issue_type ?? null,
    price_issue_type: payload.price_issue_type ?? null,
    price_per_day: payload.price_per_day ?? null,
    description: payload.description ?? null,
    reason: payload.reason ?? null,
    contact: payload.contact ?? null,
    created_at: timestamp,
    updated_at: timestamp,
  }
}
