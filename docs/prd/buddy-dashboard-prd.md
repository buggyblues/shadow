# Buddy Dashboard PRD

> **Feature**: Buddy Activity Dashboard (GitHub-style)  
> **Status**: Draft  
> **Author**: 小炸  
> **Date**: 2025-03-27

---

## 1. Overview

### 1.1 Problem Statement
Buddy owners currently lack visibility into their Buddy's activity and performance metrics. There's no centralized view to track:
- Daily/weekly/monthly activity levels
- Message volume and engagement
- Online time statistics
- Rental income and usage

### 1.2 Solution
Build a **GitHub-style Dashboard** embedded in each Buddy's profile page, providing:
- Activity heatmap (contribution graph)
- Key metrics cards
- Usage statistics charts
- Recent activity feed

### 1.3 Success Criteria
- [ ] Dashboard displays accurate activity data for the last 365 days
- [ ] Heatmap shows daily activity intensity (messages sent)
- [ ] Stats cards show total messages, online time, rentals, earnings
- [ ] Mobile-responsive design
- [ ] Data updates in real-time (or near real-time via polling)

---

## 2. User Stories

### 2.1 As a Buddy Owner
- I want to see my Buddy's activity over time so I can understand usage patterns
- I want to see total online time to track reliability
- I want to see message statistics to gauge engagement
- I want to see rental income to track monetization

### 2.2 As a Buddy Renter
- I want to see the Buddy's recent activity before renting
- I want to see uptime statistics to assess reliability

### 2.3 As a Platform Admin
- I want aggregate statistics on Buddy usage across the platform

---

## 3. Functional Requirements

### 3.1 Dashboard Components

#### 3.1.1 Activity Heatmap
- **Visual**: GitHub-style contribution graph
- **Time Range**: Last 365 days, grouped by week
- **Color Scale**: 
  - Level 0: No activity (transparent)
  - Level 1: 1-10 messages (light green)
  - Level 2: 11-50 messages (medium green)
  - Level 3: 51-100 messages (dark green)
  - Level 4: 100+ messages (intense green)
- **Interaction**: Hover shows exact message count and date

#### 3.1.2 Stats Cards (Top Row)
| Metric | Description | Icon |
|--------|-------------|------|
| Total Messages | Lifetime message count | MessageSquare |
| Online Time | Total online duration | Clock |
| Active Days | Days with activity in last 30 days | Calendar |
| Current Streak | Consecutive active days | Flame |

#### 3.1.3 Usage Charts
- **Weekly Activity**: Bar chart of messages per day (last 7 days)
- **Hourly Distribution**: Heatmap of activity by hour of day
- **Monthly Trend**: Line chart of messages per month (last 12 months)

#### 3.1.4 Recent Activity Feed
- Last 10 significant events:
  - Message sent (with preview)
  - Status change (online/offline)
  - Rental started/ended
  - Policy update

#### 3.1.5 Rental Statistics (if applicable)
- Total rentals
- Total rental income
- Average rental duration
- Current tenant (if active)

### 3.2 Data Requirements

#### 3.2.1 New Tables

```sql
-- Agent activity tracking (daily aggregates)
CREATE TABLE agent_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  message_count INTEGER DEFAULT 0,
  online_seconds INTEGER DEFAULT 0,
  UNIQUE(agent_id, date)
);

-- Agent hourly activity distribution
CREATE TABLE agent_hourly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  message_count INTEGER DEFAULT 0,
  activity_count INTEGER DEFAULT 0,
  UNIQUE(agent_id, hour_of_day)
);

-- Agent activity events (for feed)
CREATE TABLE agent_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL, -- 'message', 'status_change', 'rental_start', 'rental_end', 'policy_update'
  event_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### 3.2.2 API Endpoints

```typescript
// GET /api/agents/:id/dashboard
interface AgentDashboardResponse {
  // Activity heatmap data (last 365 days)
  activityHeatmap: Array<{
    date: string; // ISO date
    messageCount: number;
    level: 0 | 1 | 2 | 3 | 4;
  }>;

  // Summary stats
  stats: {
    totalMessages: number;
    totalOnlineSeconds: number;
    activeDays30d: number;
    currentStreak: number;
    longestStreak: number;
  };

  // Weekly activity (last 7 days)
  weeklyActivity: Array<{
    date: string;
    messageCount: number;
  }>;

  // Hourly distribution
  hourlyDistribution: Array<{
    hour: number; // 0-23
    messageCount: number;
  }>;

  // Monthly trend (last 12 months)
  monthlyTrend: Array<{
    month: string; // YYYY-MM
    messageCount: number;
  }>;

  // Recent events
  recentEvents: Array<{
    id: string;
    type: string;
    data: Record<string, unknown>;
    createdAt: string;
  }>;

  // Rental stats (if owner)
  rentalStats?: {
    totalRentals: number;
    totalIncome: number;
    averageDuration: number;
    currentTenant?: {
      id: string;
      username: string;
      displayName: string;
    };
  };
}
```

### 3.3 Backend Services

#### 3.3.1 AgentDashboardService
```typescript
class AgentDashboardService {
  // Get full dashboard data
  async getDashboard(agentId: string, userId: string): Promise<AgentDashboardResponse>;

  // Record message activity
  async recordMessage(agentId: string): Promise<void>;

  // Record online time
  async recordOnlineTime(agentId: string, seconds: number): Promise<void>;

  // Add activity event
  async addEvent(agentId: string, type: string, data: Record<string, unknown>): Promise<void>;

  // Calculate streaks
  async calculateStreaks(agentId: string): Promise<{ current: number; longest: number }>;
}
```

#### 3.3.2 Data Aggregation
- Daily cron job to aggregate message counts from `messages` table
- Real-time updates via WebSocket for live dashboard
- Background job to clean up old event data (keep 90 days)

---

## 4. Non-Functional Requirements

### 4.1 Performance
- Dashboard API response time < 500ms
- Heatmap data cached for 5 minutes
- Lazy load charts and activity feed

### 4.2 Scalability
- Support 10,000+ Buddies with activity tracking
- Efficient aggregation queries with proper indexing

### 4.3 Security
- Only owner and renters can view full dashboard
- Public view shows limited stats (online time, total messages)

---

## 5. UI/UX Design

### 5.1 Layout
```
┌─────────────────────────────────────────────────────────────┐
│  Buddy Profile Header                                       │
├─────────────────────────────────────────────────────────────┤
│  [Stats Cards Row]                                          │
│  [Messages] [Online Time] [Active Days] [Streak]           │
├─────────────────────────────────────────────────────────────┤
│  Activity Heatmap (365 days)                               │
│  ░░▓▓░░▓░░▓▓▓░░░▓▓░░▓░░░▓▓▓░░▓░░▓▓░░▓░░▓▓▓░░░            │
├─────────────────────────────────────────────────────────────┤
│  [Weekly Activity Chart]      [Hourly Distribution]        │
├─────────────────────────────────────────────────────────────┤
│  Monthly Trend                                              │
│  ━╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╱╲╲╱╲╱╲╱╲╱╲╱╲        │
├─────────────────────────────────────────────────────────────┤
│  Recent Activity                    [Rental Stats]         │
│  ├─ Message: "Hello world"          Total: 12 rentals      │
│  ├─ Status: Online                  Income: 3,500 虾币     │
│  └─ Rental started by @user         Avg: 2.3 days          │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 Color Scheme
- Follow existing Shadow design system
- Heatmap colors: green scale (`bg-green-100` to `bg-green-900`)
- Card backgrounds: `bg-bg-secondary`
- Border: `border-border-subtle`

### 5.3 Responsive Breakpoints
- Desktop: Full layout with side-by-side charts
- Tablet: Stacked layout, 2-column stats grid
- Mobile: Single column, compact heatmap

---

## 6. Technical Implementation

### 6.1 Backend Tasks

#### Task 1: Database Schema
- [ ] Create `agent_daily_stats` table
- [ ] Create `agent_hourly_stats` table
- [ ] Create `agent_activity_events` table
- [ ] Add indexes for efficient querying

#### Task 2: DAO Layer
- [ ] Create `agent-dashboard.dao.ts`
- [ ] Implement CRUD operations for stats tables
- [ ] Add aggregation queries for heatmap data

#### Task 3: Service Layer
- [ ] Create `agent-dashboard.service.ts`
- [ ] Implement `getDashboard()` method
- [ ] Implement `recordMessage()` method
- [ ] Implement `recordOnlineTime()` method
- [ ] Implement streak calculation logic

#### Task 4: API Handler
- [ ] Add `GET /api/agents/:id/dashboard` endpoint
- [ ] Add permission checks (owner/renter only)
- [ ] Add caching middleware

#### Task 5: Message Tracking Integration
- [ ] Hook into message sending flow
- [ ] Update daily stats on each message
- [ ] Add activity event for messages

### 6.2 Frontend Tasks

#### Task 1: Dashboard Page Component
- [ ] Create `buddy-dashboard.tsx` page
- [ ] Add route `/app/buddy/:agentId/dashboard`
- [ ] Integrate with existing Buddy profile page

#### Task 2: Stats Cards Component
- [ ] Create `DashboardStatsCards` component
- [ ] Display 4 key metrics with icons
- [ ] Add loading states

#### Task 3: Activity Heatmap Component
- [ ] Create `ActivityHeatmap` component
- [ ] Generate 365-day grid layout
- [ ] Implement color level logic
- [ ] Add hover tooltips

#### Task 4: Charts Components
- [ ] Create `WeeklyActivityChart` (bar chart)
- [ ] Create `HourlyDistributionChart` (heatmap)
- [ ] Create `MonthlyTrendChart` (line chart)
- [ ] Use lightweight chart library (e.g., Recharts or custom SVG)

#### Task 5: Activity Feed Component
- [ ] Create `RecentActivityFeed` component
- [ ] Display last 10 events
- [ ] Format event types with icons

#### Task 6: Rental Stats Component
- [ ] Create `RentalStatsPanel` component
- [ ] Show income and rental metrics
- [ ] Display current tenant info

### 6.3 Testing Tasks

#### Backend Tests
- [ ] Unit tests for AgentDashboardService
- [ ] Integration tests for dashboard API
- [ ] Performance tests for heatmap queries

#### Frontend Tests
- [ ] Unit tests for dashboard components
- [ ] E2E tests for dashboard navigation
- [ ] Visual regression tests for heatmap

---

## 7. Open Questions

1. **Data Retention**: How long should we keep daily stats? (Proposal: 2 years)
2. **Real-time Updates**: Should we use WebSocket or polling? (Proposal: polling every 30s)
3. **Caching Strategy**: Redis or in-memory? (Proposal: Redis with 5min TTL)
4. **Chart Library**: Custom SVG or existing library? (Proposal: lightweight custom SVG)

---

## 8. Appendix

### 8.1 Related Files
- `apps/server/src/dao/agent.dao.ts`
- `apps/server/src/services/agent.service.ts`
- `apps/server/src/handlers/agent.handler.ts`
- `apps/web/src/pages/user-profile.tsx`
- `apps/web/src/pages/buddy-management.tsx`

### 8.2 Migration Script Template
```sql
-- Run this migration to create dashboard tables
BEGIN;

CREATE TABLE IF NOT EXISTS agent_daily_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  message_count INTEGER DEFAULT 0 NOT NULL,
  online_seconds INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(agent_id, date)
);

CREATE INDEX idx_agent_daily_stats_agent_id ON agent_daily_stats(agent_id);
CREATE INDEX idx_agent_daily_stats_date ON agent_daily_stats(date);
CREATE INDEX idx_agent_daily_stats_agent_date ON agent_daily_stats(agent_id, date);

CREATE TABLE IF NOT EXISTS agent_hourly_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  hour_of_day INTEGER NOT NULL CHECK (hour_of_day BETWEEN 0 AND 23),
  message_count INTEGER DEFAULT 0 NOT NULL,
  activity_count INTEGER DEFAULT 0 NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  UNIQUE(agent_id, hour_of_day)
);

CREATE INDEX idx_agent_hourly_stats_agent_id ON agent_hourly_stats(agent_id);

CREATE TABLE IF NOT EXISTS agent_activity_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}' NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE INDEX idx_agent_activity_events_agent_id ON agent_activity_events(agent_id);
CREATE INDEX idx_agent_activity_events_created_at ON agent_activity_events(created_at DESC);

COMMIT;
```

---

*End of PRD*