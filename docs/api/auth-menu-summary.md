# Auth Menu Summary

`GET /api/auth/menu-summary`

Returns the current user's lightweight menu counters for authenticated app chrome. Use this when opening the profile/avatar menu instead of issuing separate wallet, notification, Buddy, and Cloud deployment count requests.

## Authentication

Requires a user bearer token.

## Response

```json
{
  "wallet": {
    "balance": 249872,
    "frozenAmount": 0
  },
  "notifications": {
    "unreadCount": 3
  },
  "buddy": {
    "count": 5
  },
  "cloud": {
    "deployedCount": 2
  }
}
```

`buddy.count` counts Buddy agents owned by the current user.

`cloud.deployedCount` counts the current user's Cloud deployments whose status is `deployed`.
