const EXPO_GRAPHQL_URL = 'https://api.expo.dev/graphql'
const ACCOUNT_NAME = 'buggyblues'
const PROJECT_FULL_NAME = '@buggyblues/shadowob'
const BUNDLE_IDENTIFIER = 'com.shadowob.mobile'
const IOS_DISTRIBUTION_TYPE = 'APP_STORE'

async function graphql(query, variables) {
  const token = process.env.EXPO_TOKEN
  if (!token) {
    throw new Error('EXPO_TOKEN is required to reset EAS iOS credentials')
  }

  const response = await fetch(EXPO_GRAPHQL_URL, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ query, variables }),
  })

  const body = await response.json()
  if (!response.ok || body.errors?.length) {
    const message = body.errors?.map((error) => error.message).join('; ') ?? response.statusText
    throw new Error(`Expo GraphQL request failed: ${message}`)
  }
  return body.data
}

const appIdentifierData = await graphql(
  `
    query AppleAppIdentifierByBundleId($accountName: String!, $bundleIdentifier: String!) {
      account {
        byName(accountName: $accountName) {
          appleAppIdentifiers(bundleIdentifier: $bundleIdentifier) {
            id
            bundleIdentifier
          }
        }
      }
    }
  `,
  {
    accountName: ACCOUNT_NAME,
    bundleIdentifier: BUNDLE_IDENTIFIER,
  },
)

const appleAppIdentifier =
  appIdentifierData.account?.byName?.appleAppIdentifiers?.find(
    (identifier) => identifier.bundleIdentifier === BUNDLE_IDENTIFIER,
  ) ?? null

if (!appleAppIdentifier) {
  console.log(`No Apple app identifier found for ${BUNDLE_IDENTIFIER}; nothing to reset.`)
  process.exit(0)
}

const credentialsData = await graphql(
  `
    query IosAppCredentials(
      $projectFullName: String!
      $appleAppIdentifierId: String!
      $iosDistributionType: IosDistributionType
    ) {
      app {
        byFullName(fullName: $projectFullName) {
          iosAppCredentials(filter: { appleAppIdentifierId: $appleAppIdentifierId }) {
            id
            iosAppBuildCredentialsList(filter: { iosDistributionType: $iosDistributionType }) {
              id
              iosDistributionType
              provisioningProfile {
                id
                developerPortalIdentifier
                status
                updatedAt
              }
            }
          }
        }
      }
    }
  `,
  {
    projectFullName: PROJECT_FULL_NAME,
    appleAppIdentifierId: appleAppIdentifier.id,
    iosDistributionType: IOS_DISTRIBUTION_TYPE,
  },
)

const profiles =
  credentialsData.app?.byFullName?.iosAppCredentials?.flatMap((credentials) =>
    credentials.iosAppBuildCredentialsList
      .map((buildCredentials) => buildCredentials.provisioningProfile)
      .filter(Boolean),
  ) ?? []

if (profiles.length === 0) {
  console.log(
    `No EAS ${IOS_DISTRIBUTION_TYPE} provisioning profile found for ${BUNDLE_IDENTIFIER}.`,
  )
  process.exit(0)
}

await graphql(
  `
    mutation DeleteAppleProvisioningProfiles($ids: [ID!]!) {
      appleProvisioningProfile {
        deleteAppleProvisioningProfiles(ids: $ids) {
          id
        }
      }
    }
  `,
  {
    ids: profiles.map((profile) => profile.id),
  },
)

for (const profile of profiles) {
  console.log(
    `Deleted EAS provisioning profile ${profile.developerPortalIdentifier ?? profile.id} (${profile.status}, updated ${profile.updatedAt})`,
  )
}
