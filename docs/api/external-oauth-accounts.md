# External OAuth Accounts

Shadow supports Google/GitHub as external identity providers for browser login and account linking.
iOS clients also support native Sign in with Apple for App Store distribution.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/google/id-token` | None | Verifies a Google ID token and returns a Shadow auth session. Body: `{ "credential": string }`. |
| `POST` | `/api/auth/oauth/apple/mobile` | None | Verifies an iOS Sign in with Apple identity token and returns a Shadow auth session. Body: `{ "identityToken": string, "email"?: string, "fullName"?: object }`. |
| `POST` | `/api/auth/oauth/:provider/link` | User bearer token | Returns a signed provider authorization URL for linking. Body: `{ "redirect"?: string }`. |
| `GET` | `/api/auth/oauth/accounts` | User bearer token | Lists linked external accounts. |
| `DELETE` | `/api/auth/oauth/accounts/:accountId` | User bearer token | Unlinks one external account owned by the current user. |

The link `provider` is `google` or `github`. The callback uses a signed state payload for link mode
and rejects expired or tampered state. Mobile OAuth callbacks may use a custom scheme such as
`shadow://oauth-callback` or Expo development links ending in `/oauth-callback`; Shadow returns
tokens as query parameters for those callbacks.

Apple identity tokens are verified against Apple's public keys with issuer
`https://appleid.apple.com`. Configure accepted audiences with `APPLE_CLIENT_IDS` or
`APPLE_BUNDLE_ID`; the iOS bundle id `com.shadowob.mobile` is accepted by default.

## Device Sessions

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/auth/sessions` | User bearer token | Lists current and historical login sessions/devices. |
| `DELETE` | `/api/auth/sessions/:sessionId` | User bearer token | Revokes a session and emits `auth:session-revoked` to that device. |

Refresh tokens are bound to a session and rotated on refresh. Revoked sessions cannot refresh and
their access tokens are rejected by authenticated routes once the server observes the session state.
