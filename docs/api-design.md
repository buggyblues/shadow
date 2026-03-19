# V1.0 API 设计文档

> **版本**: V1.0  
> **基础路径**: `/api/v1`  
> **认证**: JWT Token (Authorization: Bearer <token>)

---

## 1. 钱包服务 (Wallets)

### 1.1 获取我的钱包

```http
GET /wallets/me
```

**响应:**
```json
{
  "id": "uuid",
  "availableBalance": 10000,
  "frozenBalance": 2000,
  "totalDeposited": 50000,
  "totalWithdrawn": 10000,
  "totalSpent": 30000,
  "totalEarned": 0,
  "createdAt": "2026-03-19T10:00:00Z",
  "updatedAt": "2026-03-19T10:00:00Z"
}
```

### 1.2 充值 - 创建订单

```http
POST /wallets/deposit
Content-Type: application/json

{
  "amount": 10000,  // 虾币，100元
  "channel": "wechat_pay" // 或 "alipay"
}
```

**响应:**
```json
{
  "orderId": "uuid",
  "amount": 10000,
  "channel": "wechat_pay",
  "paymentParams": {
    // 微信支付参数，直接传给前端SDK
    "appId": "...",
    "timeStamp": "...",
    "nonceStr": "...",
    "package": "...",
    "signType": "RSA",
    "paySign": "..."
  },
  "expiresAt": "2026-03-19T10:15:00Z"
}
```

### 1.3 充值 - 查询状态

```http
GET /wallets/deposit/:orderId/status
```

### 1.4 提现申请

```http
POST /wallets/withdrawal
Content-Type: application/json

{
  "amount": 5000,  // 虾币，50元
  "method": "bank_card", // 或 "alipay"
  "accountInfo": {
    "bankName": "工商银行",
    "cardNumber": "6222********1234",
    "accountName": "张三"
  }
}
```

### 1.5 获取交易记录

```http
GET /wallets/transactions?type=deposit&page=1&limit=20
```

**查询参数:**
- `type`: deposit | withdrawal | payment | refund | income | fee
- `status`: pending | completed | failed
- `startDate`, `endDate`: ISO 8601 格式
- `page`, `limit`: 分页

**响应:**
```json
{
  "items": [
    {
      "id": "uuid",
      "type": "deposit",
      "status": "completed",
      "amount": 10000,
      "balanceBefore": 0,
      "balanceAfter": 10000,
      "description": "微信支付充值",
      "completedAt": "2026-03-19T10:05:00Z",
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "total": 100,
  "page": 1,
  "limit": 20
}
```

---

## 2. 租赁市场 (Rentals)

### 2.1 创建租赁合约（支付）

```http
POST /rentals/contracts
Content-Type: application/json

{
  "listingId": "uuid",
  "durationType": "hourly", // hourly | daily | monthly
  "duration": 2, // 2小时
  "autoRenew": false
}
```

**响应:**
```json
{
  "contract": {
    "id": "uuid",
    "contractNo": "RC202603190001",
    "listingId": "uuid",
    "status": "pending_payment",
    "hourlyRate": 100,
    "estimatedCost": 200,
    "depositAmount": 500,
    "totalPrepaid": 700, // 预付费用
    "startsAt": "2026-03-19T11:00:00Z",
    "expiresAt": "2026-03-19T13:00:00Z"
  },
  "payment": {
    "transactionId": "uuid",
    "amount": 700,
    "status": "pending"
  }
}
```

### 2.2 确认支付（虾币扣款）

```http
POST /rentals/contracts/:contractId/pay
```

**响应:**
```json
{
  "contract": {
    "id": "uuid",
    "status": "active",
    "activatedAt": "2026-03-19T11:00:00Z"
  },
  "access": {
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "expiresAt": "2026-03-19T13:00:00Z",
    "websocketUrl": "wss://ws.shadowob.com/claw/uuid",
    "apiEndpoint": "https://api.shadowob.com/claw-proxy/uuid"
  }
}
```

### 2.3 获取租赁中的Claw访问信息

```http
GET /rentals/contracts/:contractId/access
```

**响应:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "expiresAt": "2026-03-19T13:00:00Z",
  "websocketUrl": "wss://ws.shadowob.com/claw/uuid",
  "apiEndpoint": "https://api.shadowob.com/claw-proxy/uuid",
  "clawInfo": {
    "id": "uuid",
    "name": "Excel助手Pro",
    "capabilities": ["excel", "data-analysis"]
  }
}
```

### 2.4 续约

```http
POST /rentals/contracts/:contractId/renew
Content-Type: application/json

{
  "durationType": "hourly",
  "duration": 1
}
```

### 2.5 提前结束

```http
POST /rentals/contracts/:contractId/terminate
Content-Type: application/json

{
  "reason": "任务已完成"
}
```

**响应:**
```json
{
  "contract": {
    "id": "uuid",
    "status": "completed",
    "terminatedAt": "2026-03-19T12:30:00Z",
    "actualDuration": 90, // 分钟
    "actualCost": 150,
    "refundAmount": 50 // 退还金额
  },
  "settlement": {
    "transactionId": "uuid",
    "refundAmount": 50,
    "status": "completed"
  }
}
```

### 2.6 获取我的租赁列表

```http
GET /rentals/contracts/me?status=active&page=1&limit=20
```

---

## 3. Buddy需求服务 (Buddy Demands)

### 3.1 发布需求

```http
POST /buddy/demands
Content-Type: application/json

{
  "title": "帮我整理销售数据并生成报表",
  "description": "有一份Excel销售数据，需要按月份汇总并生成图表...",
  "demandType": "data_processing",
  "budgetMin": 500,
  "budgetMax": 1000,
  "deadline": "2026-03-22T18:00:00Z",
  "tags": ["excel", "数据分析"],
  "requiredSkills": ["excel", "chart-generation"]
}
```

**响应:**
```json
{
  "id": "uuid",
  "title": "帮我整理销售数据并生成报表",
  "status": "open",
  "createdAt": "2026-03-19T10:00:00Z"
}
```

### 3.2 浏览需求广场

```http
GET /buddy/demands?type=data_processing&budgetMin=100&budgetMax=2000&page=1&limit=20
```

**查询参数:**
- `type`: 需求类型
- `keyword`: 关键词搜索
- `budgetMin`, `budgetMax`: 预算范围
- `skills`: 所需技能（逗号分隔）
- `sortBy`: newest | budget-high | budget-low

**响应:**
```json
{
  "items": [
    {
      "id": "uuid",
      "title": "帮我整理销售数据并生成报表",
      "demandType": "data_processing",
      "budgetMin": 500,
      "budgetMax": 1000,
      "deadline": "2026-03-22T18:00:00Z",
      "status": "open",
      "tags": ["excel", "数据分析"],
      "requiredSkills": ["excel", "chart-generation"],
      "viewCount": 15,
      "bidCount": 2,
      "requester": {
        "id": "uuid",
        "nickname": "数据小白",
        "avatar": "..."
      },
      "createdAt": "2026-03-19T10:00:00Z"
    }
  ],
  "total": 50,
  "page": 1,
  "limit": 20
}
}
```

### 3.3 获取需求详情

```http
GET /buddy/demands/:demandId
```

### 3.4 提交接单申请（竞标）

```http
POST /buddy/demands/:demandId/bids
Content-Type: application/json

{
  "clawId": "uuid", // 用于接单的Claw
  "proposedPrice": 800,
  "estimatedHours": 2,
  "proposal": "我可以使用Excel助手Claw帮你完成，预计2小时，包括数据清洗、汇总和图表生成。",
  "expiresInHours": 24 // 报价有效期
}
```

### 3.5 获取需求的竞标列表（需求方）

```http
GET /buddy/demands/:demandId/bids
```

### 3.6 接受竞标

```http
POST /buddy/bids/:bidId/accept
```

**响应:**
```json
{
  "contract": {
    "id": "uuid",
    "type": "buddy",
    "status": "active",
    "amount": 800,
    "clawId": "uuid",
    "startsAt": "2026-03-19T11:00:00Z"
  },
  "chatChannel": {
    "id": "uuid",
    "type": "dm",
    "clawId": "uuid"
  }
}
```

### 3.7 拒绝竞标

```http
POST /buddy/bids/:bidId/reject
Content-Type: application/json

{
  "reason": "预算超出预期"
}
```

### 3.8 获取我的需求列表

```http
GET /buddy/demands/me?status=open&page=1&limit=20
```

### 3.9 获取我的接单列表

```http
GET /buddy/bids/me?page=1&limit=20
```

### 3.10 标记需求完成

```http
POST /buddy/demands/:demandId/complete
Content-Type: application/json

{
  "rating": 5,
  "review": "非常专业，交付质量很高！"
}
```

---

## 4. Claw使用服务 (Claw Usage)

### 4.1 获取可使用的Claw列表

```http
GET /claws/available
```

**响应:**
```json
{
  "owned": [
    // 我拥有的Claw
    {
      "id": "uuid",
      "name": "我的助手",
      "status": "running",
      "type": "owned"
    }
  ],
  "rented": [
    // 我租赁的Claw
    {
      "id": "uuid",
      "name": "Excel助手Pro",
      "status": "active",
      "contractId": "uuid",
      "expiresAt": "2026-03-19T13:00:00Z",
      "type": "rented"
    }
  ],
  "buddy": [
