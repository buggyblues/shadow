# Real-Time Notification System Technical Specification

## Overview

This document outlines the technical specification for implementing a Discord-like real-time notification system for the Shadow application. The solution leverages **Centrifugo** as the core real-time messaging infrastructure.

## Table of Contents

1. [Background](#background)
2. [Goals](#goals)
3. [Architecture Decision](#architecture-decision)
4. [Technical Architecture](#technical-architecture)
5. [Implementation Plan](#implementation-plan)
6. [Migration Strategy](#migration-strategy)
7. [Security Considerations](#security-considerations)
8. [Performance Benchmarks](#performance-benchmarks)

---

## Background

Shadow currently uses Socket.IO for real-time communication. While functional, it presents several challenges at scale:

- Manual implementation of connection management and authentication
- Complex horizontal scaling with Redis Adapter
- Self-implemented channel permission logic
- No built-in message history or presence features

## Goals

1. **Scalability**: Support 100k+ concurrent connections
2. **Reliability**: Built-in reconnection, heartbeat, and error handling
3. **Security**: JWT-based authentication with channel-level permissions
4. **Developer Experience**: Minimal boilerplate, configuration-driven
5. **Feature Parity with Discord**:
   - Real-time in-app notifications
   - Message history and unread counts
   - User presence (online/offline status)
   - Channel-based subscriptions

---

## Architecture Decision

### Selected Solution: Centrifugo

After evaluating multiple options (Novu, Gotify, Socket.IO with Redis, custom WebSocket), we selected **Centrifugo** for the following reasons:

| Criteria | Centrifugo | Novu | Gotify | Socket.IO |
|----------|-----------|------|--------|-----------|
| Self-hosted | ✅ | ✅ | ✅ | ✅ |
| WebSocket Performance | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Built-in Auth | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Channel Permissions | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| Message History | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐ |
| Horizontal Scaling | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Mobile SDK | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| Production Proven | ⭐⭐⭐⭐⭐ (VK, Badoo, Grafana) | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |

### Why Not Novu?

Novu is excellent for multi-channel notifications (email, SMS, push) but adds unnecessary complexity for our primary use case of in-app real-time notifications. Centrifugo is more focused and performant for WebSocket-based messaging.

### Why Not Continue with Socket.IO?

While Socket.IO is familiar, achieving production-grade features (clustering, auth, history) requires significant custom development and ongoing maintenance.

---

## Technical Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Web App    │  │  Mobile App  │  │  Desktop App │          │
│  │  (React)     │  │ (React Native)│  │   (Electron) │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
└─────────┼─────────────────┼─────────────────┼──────────────────┘
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │ WebSocket
┌───────────────────────────┴─────────────────────────────────────┐
│                      Centrifugo Server                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • Connection Management (WebSocket/HTTP-streaming/SSE)  │  │
│  │  • JWT Authentication                                    │  │
│  │  • Channel Subscriptions & Permissions                   │  │
│  │  • Message Routing & Broadcasting                        │  │
│  │  • Message History (Redis-backed)                        │  │
│  │  • Presence Tracking                                     │  │
│  └──────────────────────────────────────────────────────────┘  │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP API
┌───────────────────────────┴─────────────────────────────────────┐
│                      Shadow Backend (Node.js)                    │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  • JWT Token Generation                                  │  │
│  │  • Business Logic & Event Publishing                     │  │
│  │  • User & Channel Management                             │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Channel Design

```
notifications:{userId}     # Personal notifications for a user
chat:{channelId}           # Chat messages in a channel
presence:{channelId}       # Presence updates for a channel
system:broadcast           # System-wide announcements
```

### Authentication Flow

```
1. User logs in to Shadow
2. Backend generates JWT with userId (sub claim)
3. Client connects to Centrifugo with JWT
4. Centrifugo validates JWT signature
5. Connection established, user can subscribe to channels
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup (Week 1)

1. **Deploy Centrifugo**
   ```yaml
   # docker-compose.yml
   services:
     centrifugo:
       image: centrifugo/centrifugo:v6
       ports:
         - "8000:8000"
       volumes:
         - ./centrifugo/config.json:/centrifugo/config.json
       command: centrifugo -c config.json
   
     redis:
       image: redis:7-alpine
   ```

2. **Configuration**
   ```json
   {
     "client": {
       "token": {
         "hmac_secret_key": "${CENTRIFUGO_SECRET}"
       },
       "allowed_origins": ["https://shadow.app"]
     },
     "http_api": {
       "key": "${CENTRIFUGO_API_KEY}"
     },
     "engine": "redis",
     "redis_address": "redis://redis:6379",
     "namespaces": [
       {
         "name": "notifications",
         "history_size": 100,
         "history_ttl": "24h",
         "allow_subscribe_for_client": true
       },
       {
         "name": "chat",
         "history_size": 500,
         "history_ttl": "7d",
         "allow_subscribe_for_client": true,
         "allow_publish_for_subscriber": false
       },
       {
         "name": "presence",
         "allow_subscribe_for_client": true,
         "presence": true
       }
     ]
   }
   ```

### Phase 2: Backend Integration (Week 1-2)

1. **JWT Token Endpoint**
   ```typescript
   // routes/auth.ts
   router.get('/centrifugo-token', authenticate, (req, res) => {
     const token = jwt.sign(
       { sub: req.user.id, exp: Math.floor(Date.now() / 1000) + 3600 },
       process.env.CENTRIFUGO_SECRET,
       { algorithm: 'HS256' }
     );
     res.json({ token });
   });
   ```

2. **Notification Service**
   ```typescript
   // services/notification.ts
   class NotificationService {
     async sendToUser(userId: string, notification: Notification) {
       await this.centrifugo.publish(`notifications:${userId}`, notification);
     }
     
     async broadcastToChannel(channelId: string, message: Message) {
       await this.centrifugo.publish(`chat:${channelId}`, message);
     }
   }
   ```

### Phase 3: Frontend Integration (Week 2-3)

1. **Centrifuge Client Hook**
   ```typescript
   // hooks/useCentrifuge.ts
   export function useCentrifuge() {
     const [client, setClient] = useState<Centrifuge | null>(null);
     
     useEffect(() => {
       const init = async () => {
         const { token } = await api.get('/auth/centrifugo-token');
         const centrifuge = new Centrifuge(
           import.meta.env.VITE_CENTRIFUGO_URL,
           { token }
         );
         centrifuge.connect();
         setClient(centrifuge);
       };
       init();
       
       return () => client?.disconnect();
     }, []);
     
     return client;
   }
   ```

2. **Notification Hook**
   ```typescript
   // hooks/useNotifications.ts
   export function useNotifications(userId: string) {
     const centrifuge = useCentrifuge();
     const [notifications, setNotifications] = useState<Notification[]>([]);
     
     useEffect(() => {
       if (!centrifuge) return;
       
       const sub = centrifuge.newSubscription(`notifications:${userId}`);
       sub.on('publication', (ctx) => {
         setNotifications(prev => [ctx.data, ...prev]);
       });
       sub.subscribe();
       
       return () => sub.unsubscribe();
     }, [centrifuge, userId]);
     
     return notifications;
   }
   ```

### Phase 4: Mobile Integration (Week 3-4)

Use official Centrifugo mobile SDKs:
- iOS: [centrifuge-swift](https://github.com/centrifugal/centrifuge-swift)
- Android: [centrifuge-java](https://github.com/centrifugal/centrifuge-java)

---

## Migration Strategy

### Gradual Migration Approach

1. **Dual Run Period** (2 weeks)
   - Run Socket.IO and Centrifugo in parallel
   - New features use Centrifugo
   - Legacy features continue on Socket.IO

2. **Feature-by-Feature Cutover**
   - Chat messages → Centrifugo
   - Notifications → Centrifugo
   - Presence → Centrifugo

3. **Socket.IO Deprecation**
   - Remove Socket.IO dependencies
   - Clean up legacy code

### Breaking Changes

| Component | Change |
|-----------|--------|
| Client connection | `io()` → `new Centrifuge()` |
| Event emission | `socket.emit()` → HTTP API call |
| Event listening | `socket.on()` → `subscription.on('publication')` |
| Channel joining | `socket.join()` → `centrifuge.newSubscription()` |

---

## Security Considerations

1. **JWT Secret Management**
   - Rotate secrets regularly
   - Store in environment variables / secrets manager
   - Use different secrets per environment

2. **Channel Permissions**
   - Never allow client-side publishing to sensitive channels
   - Validate channel access on backend before publishing
   - Use private channels (`$`) for sensitive data

3. **API Key Protection**
   - Restrict HTTP API to internal network
   - Use TLS for all communications
   - Rotate API keys periodically

---

## Performance Benchmarks

Based on Centrifugo's published benchmarks:

| Metric | Value |
|--------|-------|
| Single node connections | 1,000,000+ |
| Message throughput | 30M messages/minute |
| Latency (p99) | < 10ms |
| Memory per connection | ~ 10KB |
| CPU usage (1M conn) | ~ 2 cores |

---

## References

- [Centrifugo Documentation](https://centrifugal.dev/)
- [Centrifuge-js Client](https://github.com/centrifugal/centrifuge-js)
- [Production Case Studies](https://centrifugal.dev/docs/getting-started/introduction)

---

## Appendix: Configuration Examples

### Production Docker Compose

```yaml
version: '3.8'

services:
  centrifugo:
    image: centrifugo/centrifugo:v6
    ports:
      - "8000:8000"
    environment:
      - CENTRIFUGO_TOKEN_HMAC_SECRET_KEY=${CENTRIFUGO_SECRET}
      - CENTRIFUGO_HTTP_API_KEY=${CENTRIFUGO_API_KEY}
      - CENTRIFUGO_ENGINE=redis
      - CENTRIFUGO_REDIS_ADDRESS=redis:6379
    volumes:
      - ./centrifugo.json:/centrifugo/config.json
    command: centrifugo -c config.json
    restart: unless-stopped
    deploy:
      replicas: 3
  
  redis:
    image: redis:7-alpine
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

### Environment Variables

```bash
# .env
CENTRIFUGO_SECRET=your-256-bit-secret-key-here
CENTRIFUGO_API_KEY=your-api-key-here
CENTRIFUGO_URL=wss://centrifugo.shadow.app/connection/websocket
```
