import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

const ASC_API_URL = 'https://api.appstoreconnect.apple.com/v1'
const BUNDLE_IDENTIFIER = 'com.shadowob.mobile'
const APPLE_SIGN_IN_CAPABILITY = 'APPLE_ID_AUTH'

function requireEnv(name) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`${name} is required`)
  }
  return value
}

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '')
}

function createJwt() {
  const keyId = requireEnv('EXPO_ASC_KEY_ID')
  const issuerId = requireEnv('EXPO_ASC_ISSUER_ID')
  const privateKey = readFileSync(requireEnv('EXPO_ASC_API_KEY_PATH'), 'utf8')
  const now = Math.floor(Date.now() / 1000)

  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId, typ: 'JWT' }))
  const payload = base64Url(
    JSON.stringify({
      aud: 'appstoreconnect-v1',
      exp: now + 10 * 60,
      iat: now,
      iss: issuerId,
    }),
  )
  const unsignedToken = `${header}.${payload}`
  const signature = createSign('SHA256').update(unsignedToken).sign(privateKey)
  return `${unsignedToken}.${base64Url(signature)}`
}

async function appStoreConnect(path, init = {}) {
  const response = await fetch(`${ASC_API_URL}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${createJwt()}`,
      'content-type': 'application/json',
      ...init.headers,
    },
  })

  const text = await response.text()
  const body = text ? JSON.parse(text) : null
  if (!response.ok) {
    const message =
      body?.errors
        ?.map((error) => `${error.status ?? response.status}: ${error.detail ?? error.title}`)
        .join('; ') ?? response.statusText
    throw new Error(`App Store Connect API request failed for ${path}: ${message}`)
  }
  return body
}

const bundleIds = await appStoreConnect(
  `/bundleIds?filter[identifier]=${encodeURIComponent(BUNDLE_IDENTIFIER)}&fields[bundleIds]=identifier`,
)
const bundleId = bundleIds.data?.find((item) => item.attributes?.identifier === BUNDLE_IDENTIFIER)

if (!bundleId) {
  throw new Error(`Bundle ID ${BUNDLE_IDENTIFIER} was not found in App Store Connect`)
}

const capabilities = await appStoreConnect(
  `/bundleIds/${bundleId.id}/bundleIdCapabilities?fields[bundleIdCapabilities]=capabilityType`,
)
const hasAppleSignIn = capabilities.data?.some(
  (capability) => capability.attributes?.capabilityType === APPLE_SIGN_IN_CAPABILITY,
)

if (hasAppleSignIn) {
  console.log(`Bundle ID ${BUNDLE_IDENTIFIER} already has Sign in with Apple enabled.`)
  process.exit(0)
}

await appStoreConnect('/bundleIdCapabilities', {
  method: 'POST',
  body: JSON.stringify({
    data: {
      type: 'bundleIdCapabilities',
      attributes: {
        capabilityType: APPLE_SIGN_IN_CAPABILITY,
      },
      relationships: {
        bundleId: {
          data: {
            id: bundleId.id,
            type: 'bundleIds',
          },
        },
      },
    },
  }),
})

console.log(`Enabled Sign in with Apple for Bundle ID ${BUNDLE_IDENTIFIER}.`)
