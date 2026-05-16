# External OAuth Accounts

Shadow supports Google/GitHub as external identity providers for login and for linking an
already-authenticated Shadow account.

## Endpoints

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/auth/oauth/:provider/link` | User bearer token | Returns a signed provider authorization URL for linking. Body: `{ "redirect"?: string }`. |
| `GET` | `/api/auth/oauth/accounts` | User bearer token | Lists linked external accounts. |
| `DELETE` | `/api/auth/oauth/accounts/:accountId` | User bearer token | Unlinks one external account owned by the current user. |

`provider` is `google` or `github`. The callback uses a signed state payload for link mode and
rejects expired or tampered state.

## Device Sessions

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/auth/sessions` | User bearer token | Lists current and historical login sessions/devices. |
| `DELETE` | `/api/auth/sessions/:sessionId` | User bearer token | Revokes a session and emits `auth:session-revoked` to that device. |

Refresh tokens are bound to a session and rotated on refresh. Revoked sessions cannot refresh and
their access tokens are rejected by authenticated routes once the server observes the session state.
