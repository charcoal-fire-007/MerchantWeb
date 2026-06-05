export interface LoginResponse {
  access_token: string
  token_type: string
  role: string
  subject: string
  must_change_password?: boolean
  username?: string
  merchant_id?: string
  merchant_name?: string
  merchant?: {
    merchant_id?: string
    merchant_name?: string
    username?: string
  }
}

export interface MerchantProduct {
  rule_id: string
  product: string
  keywords: string[]
  merchant_name?: string
  weight: number
  available: boolean
  reason: string | null
  resume_at?: string | null
  updated_at: string
}

export interface MerchantBulkAvailabilityResponse {
  success_count: number
  failed_count: number
  items: MerchantProduct[]
  failed_rule_ids: string[]
}

export interface MerchantAvailabilityPayload {
  reason?: string | null
  resumeAt?: string | null
}

export interface MerchantNotification {
  id: string
  merchant_name: string
  product: string
  order_title: string
  keyword_entry?: string | null
  matched_keyword?: string | null
  order_no?: string | null
  rule_id?: string | null
  assigned_at: string
  read_at?: string | null
}

export interface MerchantNotificationTrendDay {
  date: string
  dispatch_count: number
  machine_count: number
}

export interface MerchantNotificationsResponse {
  items: MerchantNotification[]
  today_count: number
  unread_count: number
  chart: MerchantNotificationTrendDay[]
}

export type MerchantFeedbackType = 'issue' | 'price_suggestion'
export type MerchantFeedbackStatus = 'submitted' | 'processing' | 'resolved'
export type MerchantIssueType = 'page' | 'dispatch' | 'product' | 'account' | 'other'
export type MerchantPriceIssueType = 'price_unreasonable' | 'wrong_model' | 'other'
export type MerchantProductApplicationType = 'existing_product' | 'new_product'
export type MerchantProductApplicationStatus = 'submitted' | 'reviewing' | 'manual_processing' | 'enabled' | 'rejected'

export interface MerchantProductApplicationOption {
  product_id: string
  rule_id?: string | null
  product: string
  keywords?: string[]
  category?: string | null
}

export interface MerchantProductApplicationRecord {
  id: string
  application_type: MerchantProductApplicationType
  status: MerchantProductApplicationStatus
  product: string
  product_id?: string | null
  rule_id?: string | null
  model_note?: string | null
  reason?: string | null
  contact?: string | null
  rejection_reason?: string | null
  created_at: string
  updated_at?: string | null
}

export interface MerchantProductApplicationOptionsResponse {
  items: MerchantProductApplicationOption[]
}

export interface MerchantProductApplicationListResponse {
  items: MerchantProductApplicationRecord[]
}

export interface MerchantProductApplicationPayload {
  application_type: MerchantProductApplicationType
  product: string
  product_id?: string | null
  rule_id?: string | null
  model_note?: string | null
  reason?: string | null
  contact?: string | null
}

export interface MerchantFeedbackRecord {
  id: string
  type: MerchantFeedbackType
  status: MerchantFeedbackStatus
  product?: string | null
  rule_id?: string | null
  issue_type?: MerchantIssueType | null
  price_issue_type?: MerchantPriceIssueType | null
  price_per_day?: number | null
  description?: string | null
  reason?: string | null
  contact?: string | null
  created_at: string
  updated_at?: string | null
}

export interface MerchantFeedbackListResponse {
  items: MerchantFeedbackRecord[]
}

export interface MerchantFeedbackPayload {
  type: MerchantFeedbackType
  product?: string | null
  rule_id?: string | null
  issue_type?: MerchantIssueType | null
  price_issue_type?: MerchantPriceIssueType | null
  price_per_day?: number | null
  description?: string | null
  reason?: string | null
  contact?: string | null
}

export interface CurrentMerchantResponse {
  subject?: string
  username?: string
  merchant_id?: string
  merchant_name?: string
  merchant?: {
    merchant_id?: string
    merchant_name?: string
    username?: string
  }
}

export class ApiError extends Error {
  status: number
  detail?: string
  body?: unknown

  constructor(message: string, status: number, detail?: string, body?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.body = body
  }
}

interface ApiErrorContext {
  isAuthenticatedRequest?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function tryParseJson(text: string) {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function extractErrorDetail(body: unknown): string | undefined {
  if (typeof body === 'string' && body.trim()) {
    return body.trim()
  }

  if (!isRecord(body)) {
    return undefined
  }

  for (const key of ['detail', 'message', 'error', 'title']) {
    const value = body[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }

  return undefined
}

function mapApiErrorMessage(status: number, detail: string | undefined, context: ApiErrorContext) {
  if (status === 401 && context.isAuthenticatedRequest) {
    return '登录已过期，请重新登录'
  }
  if (detail) {
    return detail
  }
  if (status === 403) {
    return '当前账号没有权限执行此操作'
  }
  if (status >= 500) {
    return '服务暂时不可用，请稍后重试'
  }
  return `请求失败 (${status})`
}

function normalizeAvailabilityPayload(payload: MerchantAvailabilityPayload | string | null | undefined): MerchantAvailabilityPayload {
  if (typeof payload === 'string') {
    return { reason: payload }
  }
  return payload || {}
}

async function readResponseBody(response: Response) {
  if (response.status === 204) {
    return null
  }

  const text = await response.text()
  if (!text) {
    return null
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return tryParseJson(text) ?? text
  }

  return tryParseJson(text) ?? text
}

async function parseSuccessBody<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T
  }

  const text = await response.text()
  if (!text) {
    return undefined as T
  }

  const contentType = response.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return JSON.parse(text) as T
  }

  return text as T
}

export async function parseApiError(response: Response, context: ApiErrorContext = {}) {
  const body = await readResponseBody(response)
  const detail = extractErrorDetail(body)
  return new ApiError(
    mapApiErrorMessage(response.status, detail, context),
    response.status,
    detail,
    body,
  )
}

export class ApiClient {
  private token = ''
  private unauthorizedHandler: ((error: ApiError) => void) | null = null

  setToken(token: string) {
    this.token = token
  }

  setUnauthorizedHandler(handler: ((error: ApiError) => void) | null) {
    this.unauthorizedHandler = handler
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  }

  async changePassword(newUsername: string, newPassword: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ new_username: newUsername, new_password: newPassword })
    })
  }

  async listProducts(appCode = 'order_dispatch'): Promise<MerchantProduct[]> {
    return this.request<MerchantProduct[]>(`/api/merchant/products?app_code=${encodeURIComponent(appCode)}`)
  }

  async listNotifications(limit = 20): Promise<MerchantNotificationsResponse> {
    return this.request<MerchantNotificationsResponse>(`/api/merchant/notifications?limit=${encodeURIComponent(limit)}`)
  }

  async listFeedback(): Promise<MerchantFeedbackListResponse> {
    return this.request<MerchantFeedbackListResponse>('/api/merchant/feedback')
  }

  async submitFeedback(payload: MerchantFeedbackPayload): Promise<MerchantFeedbackRecord> {
    return this.request<MerchantFeedbackRecord>('/api/merchant/feedback', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  async listProductApplicationOptions(): Promise<MerchantProductApplicationOptionsResponse> {
    return this.request<MerchantProductApplicationOptionsResponse>('/api/merchant/product-applications/options')
  }

  async listProductApplications(): Promise<MerchantProductApplicationListResponse> {
    return this.request<MerchantProductApplicationListResponse>('/api/merchant/product-applications')
  }

  async submitProductApplication(
    payload: MerchantProductApplicationPayload
  ): Promise<MerchantProductApplicationRecord> {
    return this.request<MerchantProductApplicationRecord>('/api/merchant/product-applications', {
      method: 'POST',
      body: JSON.stringify(payload)
    })
  }

  async getCurrentMerchant(): Promise<CurrentMerchantResponse> {
    return this.request<CurrentMerchantResponse>('/api/auth/me')
  }

  async updateAvailability(
    ruleId: string,
    available: boolean,
    payload: MerchantAvailabilityPayload | string = {}
  ): Promise<MerchantProduct> {
    const availabilityPayload = normalizeAvailabilityPayload(payload)
    return this.request<MerchantProduct>(`/api/merchant/products/${encodeURIComponent(ruleId)}/availability`, {
      method: 'POST',
      body: JSON.stringify({
        available,
        reason: availabilityPayload.reason || null,
        resume_at: availabilityPayload.resumeAt || null,
      })
    })
  }

  async bulkUpdateAvailability(
    ruleIds: string[],
    available: boolean,
    payload: MerchantAvailabilityPayload | string = {}
  ): Promise<MerchantBulkAvailabilityResponse> {
    const availabilityPayload = normalizeAvailabilityPayload(payload)
    return this.request<MerchantBulkAvailabilityResponse>('/api/merchant/products/availability/bulk', {
      method: 'POST',
      body: JSON.stringify({
        rule_ids: ruleIds,
        available,
        reason: availabilityPayload.reason || null,
        resume_at: availabilityPayload.resumeAt || null,
      })
    })
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers)
    headers.set('Content-Type', 'application/json')
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`)
    }

    const response = await fetch(path, { ...init, headers })
    if (!response.ok) {
      const isAuthenticatedRequest = Boolean(this.token) && path !== '/api/auth/login'
      const error = await parseApiError(response, { isAuthenticatedRequest })
      if (error.status === 401 && isAuthenticatedRequest) {
        this.unauthorizedHandler?.(error)
      }
      throw error
    }

    return parseSuccessBody<T>(response)
  }
}

export const api = new ApiClient()
