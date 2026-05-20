export type TokenClaims = Record<string, unknown>

export interface MerchantIdentity {
  displayName: string
  subject: string
}

export interface MerchantSession {
  merchantId?: string
  merchantName: string
  username: string
}

function isRecord(value: unknown): value is TokenClaims {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeBase64Url(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = (4 - (normalized.length % 4)) % 4
  return normalized.padEnd(normalized.length + padding, '=')
}

function decodeBase64UrlUtf8(value: string) {
  const binary = atob(normalizeBase64Url(value))
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function pickStringClaim(claims: TokenClaims, keys: string[]) {
  for (const key of keys) {
    const value = claims[key]
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return ''
}

function pickStringFromSources(sources: Array<TokenClaims | null>, keys: string[]) {
  for (const source of sources) {
    if (!source) {
      continue
    }
    const value = pickStringClaim(source, keys)
    if (value) {
      return value
    }
  }
  return ''
}

export function decodeTokenClaims(token: string): TokenClaims | null {
  const payload = token.split('.')[1]
  if (!payload) {
    return null
  }

  try {
    const parsed = JSON.parse(decodeBase64UrlUtf8(payload))
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

export function getMerchantIdentity(claims: TokenClaims | null): MerchantIdentity | null {
  if (!claims) {
    return null
  }

  const subject = pickStringClaim(claims, ['sub', 'subject', 'username', 'account'])
  const displayName = pickStringClaim(claims, [
    'merchant_name',
    'merchantName',
    'display_name',
    'displayName',
    'name',
    'sub',
    'subject',
  ])

  if (!displayName && !subject) {
    return null
  }

  return {
    displayName: displayName || subject,
    subject: subject || displayName,
  }
}

export function extractMerchantSession(payload: unknown): MerchantSession | null {
  if (!isRecord(payload)) {
    return null
  }

  const merchant = isRecord(payload.merchant) ? payload.merchant : null
  const merchantId = pickStringFromSources([merchant, payload], ['merchant_id', 'merchantId', 'id'])
  const merchantName = pickStringFromSources([merchant, payload], [
    'merchant_name',
    'merchantName',
    'display_name',
    'displayName',
    'name',
  ])
  const username = pickStringFromSources([payload, merchant], [
    'username',
    'subject',
    'sub',
    'account',
  ])

  if (!merchantName && !username) {
    return null
  }

  return {
    merchantId: merchantId || undefined,
    merchantName,
    username: username || merchantName,
  }
}

export function getMerchantIdentityFromSession(
  session: MerchantSession | null,
  claims: TokenClaims | null,
  preferredMerchantName = '',
): MerchantIdentity | null {
  const identityFromClaims = getMerchantIdentity(claims)
  const displayName =
    preferredMerchantName ||
    session?.merchantName ||
    identityFromClaims?.displayName ||
    session?.username ||
    ''
  const subject = session?.username || identityFromClaims?.subject || session?.merchantName || displayName

  if (!displayName && !subject) {
    return null
  }

  return {
    displayName: displayName || subject,
    subject: subject || displayName,
  }
}
