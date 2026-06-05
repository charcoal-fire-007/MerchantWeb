import assert from 'node:assert/strict'
import test from 'node:test'

import { ApiClient, ApiError, parseApiError } from '../src/api.ts'

test('parseApiError extracts fastapi detail and maps authenticated 401 to relogin message', async () => {
  const response = new Response(JSON.stringify({ detail: 'Signature has expired' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  })

  const error = await parseApiError(response, { isAuthenticatedRequest: true })

  assert.ok(error instanceof ApiError)
  assert.equal(error.status, 401)
  assert.equal(error.detail, 'Signature has expired')
  assert.equal(error.message, '登录已过期，请重新登录')
})

test('parseApiError keeps login failure detail for unauthenticated 401 responses', async () => {
  const response = new Response(JSON.stringify({ detail: '用户名或密码错误' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  })

  const error = await parseApiError(response, { isAuthenticatedRequest: false })

  assert.equal(error.status, 401)
  assert.equal(error.detail, '用户名或密码错误')
  assert.equal(error.message, '用户名或密码错误')
})

test('parseApiError extracts generic message fields and keeps 403 actionable', async () => {
  const response = new Response(JSON.stringify({ message: 'Merchant permission required' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json' }
  })

  const error = await parseApiError(response)

  assert.equal(error.status, 403)
  assert.equal(error.detail, 'Merchant permission required')
  assert.equal(error.message, 'Merchant permission required')
})

test('ApiClient invokes unauthorized handler when a request returns 401', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let unauthorizedCalls = 0
  let handledStatus = 0

  globalThis.fetch = async () => new Response(JSON.stringify({ detail: 'Token expired' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' }
  })

  client.setToken('expired-token')
  client.setUnauthorizedHandler((error) => {
    unauthorizedCalls += 1
    handledStatus = error.status
  })

  await assert.rejects(
    () => client.listProducts(),
    (error: unknown) => {
      assert.ok(error instanceof ApiError)
      assert.equal(error.status, 401)
      assert.equal(error.message, '登录已过期，请重新登录')
      return true
    }
  )

  assert.equal(unauthorizedCalls, 1)
  assert.equal(handledStatus, 401)
  globalThis.fetch = originalFetch
})

test('ApiClient requests merchant notifications endpoint', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''

  globalThis.fetch = async (input) => {
    requestedPath = String(input)
    return new Response(JSON.stringify({ items: [], today_count: 0, unread_count: 0, chart: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.listNotifications()

  assert.equal(requestedPath, '/api/merchant/notifications?limit=20')
  assert.deepEqual(result, { items: [], today_count: 0, unread_count: 0, chart: [] })
  globalThis.fetch = originalFetch
})

test('ApiClient changes forced merchant password with authenticated token', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  let requestedMethod = ''
  let requestedBody = ''
  let authorizationHeader = ''

  globalThis.fetch = async (input, init) => {
    requestedPath = String(input)
    requestedMethod = init?.method || ''
    requestedBody = String(init?.body || '')
    authorizationHeader = new Headers(init?.headers).get('Authorization') || ''
    return new Response(JSON.stringify({
      access_token: 'clean-token',
      token_type: 'bearer',
      role: 'merchant',
      subject: 'tuantuanxiang_6',
      merchant_id: 'merchant-6',
      must_change_password: false,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  client.setToken('reset-token')
  const result = await client.changePassword('formal-merchant-account', 'new-password-123')

  assert.equal(requestedPath, '/api/auth/change-password')
  assert.equal(requestedMethod, 'POST')
  assert.deepEqual(JSON.parse(requestedBody), {
    new_username: 'formal-merchant-account',
    new_password: 'new-password-123'
  })
  assert.equal(authorizationHeader, 'Bearer reset-token')
  assert.equal(result.must_change_password, false)
  assert.equal(result.access_token, 'clean-token')
  globalThis.fetch = originalFetch
})

test('ApiClient sends merchant bulk availability update once with selected rule ids', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  let requestedBody = ''

  globalThis.fetch = async (input, init) => {
    requestedPath = String(input)
    requestedBody = String(init?.body || '')
    return new Response(JSON.stringify({
      success_count: 2,
      failed_count: 1,
      items: [],
      failed_rule_ids: ['rule-3'],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.bulkUpdateAvailability(['rule-1', 'rule-2', 'rule-3'], false, '库存盘点')

  assert.equal(requestedPath, '/api/merchant/products/availability/bulk')
  assert.deepEqual(JSON.parse(requestedBody), {
    rule_ids: ['rule-1', 'rule-2', 'rule-3'],
    available: false,
    resume_at: null,
    reason: '库存盘点',
  })
  assert.equal(result.success_count, 2)
  assert.equal(result.failed_count, 1)
  assert.deepEqual(result.failed_rule_ids, ['rule-3'])
  globalThis.fetch = originalFetch
})

test('ApiClient sends scheduled resume time for bulk product pause', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  let requestedBody = ''

  globalThis.fetch = async (input, init) => {
    requestedPath = String(input)
    requestedBody = String(init?.body || '')
    return new Response(JSON.stringify({
      success_count: 3,
      failed_count: 0,
      items: [],
      failed_rule_ids: [],
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.bulkUpdateAvailability(
    ['rule-1', 'rule-2', 'rule-3'],
    false,
    { resumeAt: '2026-06-07T09:00:00.000Z' }
  )

  assert.equal(requestedPath, '/api/merchant/products/availability/bulk')
  assert.deepEqual(JSON.parse(requestedBody), {
    rule_ids: ['rule-1', 'rule-2', 'rule-3'],
    available: false,
    reason: null,
    resume_at: '2026-06-07T09:00:00.000Z',
  })
  assert.equal(result.success_count, 3)
  globalThis.fetch = originalFetch
})

test('ApiClient sends scheduled resume time for single product pause', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  let requestedBody = ''

  globalThis.fetch = async (input, init) => {
    requestedPath = String(input)
    requestedBody = String(init?.body || '')
    return new Response(JSON.stringify({
      rule_id: 'rule-g9',
      product: 'Canon G9',
      keywords: [],
      weight: 1,
      available: false,
      reason: null,
      resume_at: '2026-06-07T09:00:00.000Z',
      updated_at: '2026-06-05T03:30:00.000Z',
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.updateAvailability('rule-g9', false, {
    resumeAt: '2026-06-07T09:00:00.000Z'
  })

  assert.equal(requestedPath, '/api/merchant/products/rule-g9/availability')
  assert.deepEqual(JSON.parse(requestedBody), {
    available: false,
    reason: null,
    resume_at: '2026-06-07T09:00:00.000Z',
  })
  assert.equal(result.resume_at, '2026-06-07T09:00:00.000Z')
  globalThis.fetch = originalFetch
})

test('ApiClient requests merchant feedback records endpoint', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''

  globalThis.fetch = async (input) => {
    requestedPath = String(input)
    return new Response(JSON.stringify({ items: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.listFeedback()

  assert.equal(requestedPath, '/api/merchant/feedback')
  assert.deepEqual(result, { items: [] })
  globalThis.fetch = originalFetch
})

test('ApiClient requests merchant product application options endpoint', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''

  globalThis.fetch = async (input) => {
    requestedPath = String(input)
    return new Response(JSON.stringify({
      items: [{
        product_id: 'rule-pocket3',
        rule_id: 'rule-pocket3',
        product: '大疆Pocket3',
        keywords: ['Pocket3', 'Pocket 3'],
        category: '相机',
      }]
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.listProductApplicationOptions()

  assert.equal(requestedPath, '/api/merchant/product-applications/options')
  assert.equal(result.items[0].product, '大疆Pocket3')
  globalThis.fetch = originalFetch
})

test('ApiClient submits merchant existing product application', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  let requestedMethod = ''
  let requestedBody = ''

  globalThis.fetch = async (input, init) => {
    requestedPath = String(input)
    requestedMethod = init?.method || ''
    requestedBody = String(init?.body || '')
    return new Response(JSON.stringify({
      id: 'application-1',
      application_type: 'existing_product',
      status: 'submitted',
      product_id: 'rule-pocket3',
      product: '大疆Pocket3',
      reason: '我有该设备，可接单',
      created_at: '2026-05-25T10:00:00+08:00'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.submitProductApplication({
    application_type: 'existing_product',
    product_id: 'rule-pocket3',
    product: '大疆Pocket3',
    reason: '我有该设备，可接单',
    contact: 'merchant-account',
  })

  assert.equal(requestedPath, '/api/merchant/product-applications')
  assert.equal(requestedMethod, 'POST')
  assert.deepEqual(JSON.parse(requestedBody), {
    application_type: 'existing_product',
    product_id: 'rule-pocket3',
    product: '大疆Pocket3',
    reason: '我有该设备，可接单',
    contact: 'merchant-account',
  })
  assert.equal(result.status, 'submitted')
  globalThis.fetch = originalFetch
})

test('ApiClient submits merchant price suggestion feedback with yuan-per-day price', async () => {
  const client = new ApiClient()
  const originalFetch = globalThis.fetch
  let requestedPath = ''
  let requestedMethod = ''
  let requestedBody = ''

  globalThis.fetch = async (input, init) => {
    requestedPath = String(input)
    requestedMethod = init?.method || ''
    requestedBody = String(init?.body || '')
    return new Response(JSON.stringify({
      id: 'feedback-1',
      type: 'price_suggestion',
      status: 'submitted',
      product: '大疆Pocket3',
      rule_id: 'rule-pocket3',
      price_per_day: 80,
      created_at: '2026-05-22T10:00:00+08:00'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const result = await client.submitFeedback({
    type: 'price_suggestion',
    product: '大疆Pocket3',
    rule_id: 'rule-pocket3',
    price_issue_type: 'price_unreasonable',
    price_per_day: 80,
    reason: '同城同行价格在 60-70 元/天',
    contact: 'merchant-account',
  })

  assert.equal(requestedPath, '/api/merchant/feedback')
  assert.equal(requestedMethod, 'POST')
  assert.deepEqual(JSON.parse(requestedBody), {
    type: 'price_suggestion',
    product: '大疆Pocket3',
    rule_id: 'rule-pocket3',
    price_issue_type: 'price_unreasonable',
    price_per_day: 80,
    reason: '同城同行价格在 60-70 元/天',
    contact: 'merchant-account',
  })
  assert.equal(result.status, 'submitted')
  globalThis.fetch = originalFetch
})
