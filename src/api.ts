export interface LoginResponse {
  access_token: string
  token_type: string
  role: string
  subject: string
  merchant_id: string
  merchant_name?: string
}

export interface MerchantProduct {
  rule_id: string
  product: string
  keywords: string[]
  weight: number
  available: boolean
  reason: string | null
  updated_at: string
}

export class ApiClient {
  private token = ''

  setToken(token: string) {
    this.token = token
  }

  async login(username: string, password: string): Promise<LoginResponse> {
    return this.request<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    })
  }

  async listProducts(appCode = 'order_dispatch'): Promise<MerchantProduct[]> {
    return this.request<MerchantProduct[]>(`/api/merchant/products?app_code=${encodeURIComponent(appCode)}`)
  }

  async updateAvailability(ruleId: string, available: boolean, reason?: string): Promise<MerchantProduct> {
    return this.request<MerchantProduct>(`/api/merchant/products/${encodeURIComponent(ruleId)}/availability`, {
      method: 'POST',
      body: JSON.stringify({ available, reason: reason || null })
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
      const text = await response.text()
      throw new Error(text || `Request failed: ${response.status}`)
    }
    return response.json() as Promise<T>
  }
}

export const api = new ApiClient()
