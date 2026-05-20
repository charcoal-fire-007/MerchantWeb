import assert from 'node:assert/strict'
import test from 'node:test'

import {
  decodeTokenClaims,
  extractMerchantSession,
  getMerchantIdentity,
  getMerchantIdentityFromSession,
} from '../src/auth.ts'

test('decodeTokenClaims reads JWT payload segment and supports base64url unicode fields', () => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(JSON.stringify({
    sub: 'merchant_user',
    merchant_name: '星享生活',
    merchant_id: 'merchant-1',
  }), 'utf8').toString('base64url')
  const token = `${header}.${payload}.signature`

  const claims = decodeTokenClaims(token)

  assert.deepEqual(claims, {
    sub: 'merchant_user',
    merchant_name: '星享生活',
    merchant_id: 'merchant-1',
  })
})

test('getMerchantIdentity prefers merchant name and falls back to subject-like fields', () => {
  assert.deepEqual(
    getMerchantIdentity({
      merchant_name: '团团享租奥丰店',
      sub: 'merchant_account',
    }),
    {
      displayName: '团团享租奥丰店',
      subject: 'merchant_account',
    }
  )

  assert.deepEqual(
    getMerchantIdentity({
      subject: 'merchant_account_only',
    }),
    {
      displayName: 'merchant_account_only',
      subject: 'merchant_account_only',
    }
  )
})

test('extractMerchantSession reads merchant identity from login payload', () => {
  assert.deepEqual(
    extractMerchantSession({
      subject: 'xxsh_admin',
      merchant: {
        merchant_id: 'merchant-1',
        merchant_name: '星享生活',
      },
    }),
    {
      merchantId: 'merchant-1',
      merchantName: '星享生活',
      username: 'xxsh_admin',
    }
  )
})

test('extractMerchantSession does not promote username into merchant name when profile is missing', () => {
  assert.deepEqual(
    extractMerchantSession({
      subject: 'tuantuanxiang_4',
      merchant_id: 'merchant-2',
    }),
    {
      merchantId: 'merchant-2',
      merchantName: '',
      username: 'tuantuanxiang_4',
    }
  )
})

test('getMerchantIdentityFromSession prefers explicit merchant profile over token claims', () => {
  assert.deepEqual(
    getMerchantIdentityFromSession(
      {
        merchantId: 'merchant-1',
        merchantName: '星享生活',
        username: 'xxsh_admin',
      },
      {
        sub: 'opaque-token-subject',
      }
    ),
    {
      displayName: '星享生活',
      subject: 'xxsh_admin',
    }
  )
})

test('getMerchantIdentityFromSession prefers merchant name resolved from products over username fallback', () => {
  assert.deepEqual(
    getMerchantIdentityFromSession(
      {
        merchantId: 'merchant-2',
        merchantName: '',
        username: 'tuantuanxiang_4',
      },
      {
        sub: 'opaque-token-subject',
      },
      '深圳活力租赁'
    ),
    {
      displayName: '深圳活力租赁',
      subject: 'tuantuanxiang_4',
    }
  )
})
