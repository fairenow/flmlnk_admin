# GTM Analytics - Future Phases

This document outlines the roadmap for bringing analytics data from GTM/GA4 into the FLMLNK platform and creating user-facing dashboards.

---

## Phase 2: Bringing Analytics Data Into the Platform

### Overview

Import GA4 analytics data into Convex to enable platform-level insights and user-facing dashboards.

### Implementation Options

#### Option A: Google Analytics Data API (Recommended)

Use the GA4 Data API to pull aggregated metrics into Convex.

**Pros:**
- Official Google API
- Real-time and historical data access
- No additional services required

**Cons:**
- API quota limits (10,000 requests/day free)
- Requires service account setup

**Required Setup:**
1. Create Google Cloud Project
2. Enable Analytics Data API
3. Create service account with Viewer role
4. Add service account email to GA4 property
5. Store credentials securely in Convex

**Data to Import:**
```typescript
interface DailyAnalytics {
  date: string;
  slug: string;
  pageViews: number;
  uniqueVisitors: number;
  avgSessionDuration: number;
  clipPlays: number;
  clipShares: number;
  emailCaptures: number;
  inquiries: number;
}
```

#### Option B: BigQuery Export

Export GA4 data to BigQuery, then sync to Convex.

**Pros:**
- Full raw event data
- SQL-based analysis
- Historical backfill possible

**Cons:**
- More complex setup
- BigQuery costs
- Delayed data (not real-time)

#### Option C: Server-Side GTM + Convex

Send events directly to Convex in addition to GA4.

**Pros:**
- Real-time data
- Full control over data structure
- No API quotas

**Cons:**
- Requires Server-Side GTM container
- Additional hosting costs
- Duplicate data pipeline

### Recommended Architecture

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Browser   │────▶│   GTM/GA4   │────▶│  BigQuery   │
│   (Events)  │     │             │     │  (Optional) │
└─────────────┘     └─────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  GA4 Data   │
                    │     API     │
                    └─────────────┘
                           │
                           ▼
                    ┌─────────────┐     ┌─────────────┐
                    │   Convex    │────▶│  Dashboard  │
                    │  (Storage)  │     │    (UI)     │
                    └─────────────┘     └─────────────┘
```

### Convex Schema Extension

```typescript
// convex/schema.ts additions

// Analytics snapshots (daily aggregates)
analyticsSnapshots: defineTable({
  actorProfileId: v.id("actor_profiles"),
  slug: v.string(),
  date: v.string(), // YYYY-MM-DD

  // Traffic metrics
  pageViews: v.number(),
  uniqueVisitors: v.number(),
  avgSessionDuration: v.number(),
  bounceRate: v.number(),

  // Engagement metrics
  clipPlays: v.number(),
  clipShares: v.number(),
  totalWatchTime: v.number(),
  commentCount: v.number(),

  // Conversion metrics
  emailCaptures: v.number(),
  inquiries: v.number(),
  socialClicks: v.number(),
  watchCtaClicks: v.number(),

  // Source breakdown
  trafficSources: v.object({
    direct: v.number(),
    organic: v.number(),
    social: v.number(),
    referral: v.number(),
    email: v.number(),
  }),
})
  .index("by_profile", ["actorProfileId"])
  .index("by_slug", ["slug"])
  .index("by_date", ["date"]),
```

### Import Job Implementation

```typescript
// convex/analytics.ts

import { internalAction } from "./_generated/server";
import { BetaAnalyticsDataClient } from "@google-analytics/data";

// Scheduled daily import
export const importDailyAnalytics = internalAction({
  handler: async (ctx) => {
    const client = new BetaAnalyticsDataClient({
      credentials: JSON.parse(process.env.GA4_SERVICE_ACCOUNT_KEY!),
    });

    const [response] = await client.runReport({
      property: `properties/${process.env.GA4_PROPERTY_ID}`,
      dateRanges: [{ startDate: "yesterday", endDate: "yesterday" }],
      dimensions: [{ name: "customEvent:actor_slug" }],
      metrics: [
        { name: "screenPageViews" },
        { name: "activeUsers" },
        { name: "averageSessionDuration" },
        { name: "eventCount" },
      ],
    });

    // Process and store in Convex
    for (const row of response.rows || []) {
      const slug = row.dimensionValues?.[0]?.value;
      if (!slug) continue;

      // Upsert analytics snapshot
      await ctx.runMutation(internal.analytics.upsertSnapshot, {
        slug,
        date: "yesterday",
        pageViews: parseInt(row.metricValues?.[0]?.value || "0"),
        uniqueVisitors: parseInt(row.metricValues?.[1]?.value || "0"),
        // ... other metrics
      });
    }
  },
});
```

---

## Phase 3: User-Facing Analytics Dashboard

### Overview

Create an analytics dashboard in the filmmaker dashboard showing key metrics.

### Dashboard Location

`/dashboard/actor/analytics` - New tab in the existing dashboard

### Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  📊 Analytics                           [30 days ▾]         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐      │
│  │    1,234     │  │     567      │  │      89      │      │
│  │  Page Views  │  │   Visitors   │  │  Clip Plays  │      │
│  │   +12% ▲     │  │    +8% ▲     │  │   +23% ▲     │      │
│  └──────────────┘  └──────────────┘  └──────────────┘      │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Traffic Over Time                        │  │
│  │      ▁▂▃▄▅▆▇█▇▆▅▄▃▂▁                                 │  │
│  │      [ Line Chart - Page Views / Visitors ]          │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
│  ┌────────────────────────┐  ┌────────────────────────┐    │
│  │  Top Performing Clips  │  │   Traffic Sources      │    │
│  │  1. Clip Title - 45    │  │  ████████ Social  45%  │    │
│  │  2. Clip Title - 32    │  │  █████    Direct  28%  │    │
│  │  3. Clip Title - 18    │  │  ███      Organic 18%  │    │
│  └────────────────────────┘  └────────────────────────┘    │
│                                                             │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   Recent Activity                     │  │
│  │  • Someone viewed your page (2 min ago)              │  │
│  │  • Someone played "Demo Reel" clip (15 min ago)      │  │
│  │  • Email captured: j***@gmail.com (1 hour ago)       │  │
│  └──────────────────────────────────────────────────────┘  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Metrics to Display

**Overview Cards:**
- Total page views (with trend)
- Unique visitors (with trend)
- Total clip plays (with trend)
- Email capture rate (with trend)

**Charts:**
- Traffic over time (line chart)
- Top clips by plays (bar chart)
- Traffic sources breakdown (pie chart)
- Engagement by day of week (heatmap)

**Activity Feed:**
- Recent page views
- Recent clip plays
- Recent email captures
- Recent inquiries

### Component Structure

```
src/app/dashboard/actor/analytics/
├── page.tsx                    # Main analytics page
├── components/
│   ├── OverviewCards.tsx       # Top metric cards
│   ├── TrafficChart.tsx        # Line chart for traffic
│   ├── ClipPerformance.tsx     # Top clips table
│   ├── TrafficSources.tsx      # Pie chart
│   ├── ActivityFeed.tsx        # Recent events list
│   └── DateRangePicker.tsx     # Date range selector
└── hooks/
    └── useAnalytics.ts         # Data fetching hook
```

### API Endpoints (Already Implemented)

```typescript
// convex/analytics.ts

// Get activity feed for dashboard
api.analytics.getActivityFeed({ actorProfileId, limit: 20 })

// Get overview metrics
api.analytics.getOverview({ actorProfileId, daysBack: 30 })

// Get top performing clips
api.analytics.getTopClips({ actorProfileId, limit: 5 })
```

---

## Phase 4: Advanced Attribution & Cohort Analysis

### Overview

Enable filmmakers to understand where their traffic comes from and how different audiences engage.

### Features

#### 4.1 UTM Parameter Tracking

Track campaign sources for filmmaker's marketing efforts.

**Implementation:**
- Capture UTM params on page load
- Store in session and attach to events
- Report breakdown by campaign

**Dashboard View:**
```
Campaign Performance
──────────────────────────────────────────
Campaign        | Visitors | Conversions
──────────────────────────────────────────
instagram_bio   |   234    |     12
film_festival_qr|   156    |      8
email_newsletter|    89    |     15
──────────────────────────────────────────
```

#### 4.2 Referrer Analysis

Show which websites/platforms send traffic.

**Top Referrers:**
- Instagram
- IMDb
- Film festival websites
- Google organic
- Direct

#### 4.3 Geographic Insights

Show where visitors are located.

**Map View:**
- Heat map of visitor locations
- Top cities/countries list
- Regional engagement comparison

#### 4.4 Device & Browser Breakdown

Understand how audiences access the page.

**Breakdown:**
- Mobile vs Desktop vs Tablet
- iOS vs Android
- Browser distribution

#### 4.5 Cohort Analysis

Track engagement patterns over time.

**Cohorts:**
- New vs Returning visitors
- Engaged viewers (>2 clips watched)
- High-intent (email captured)

### Schema Additions

```typescript
// Additional analytics dimensions
analyticsSnapshots: defineTable({
  // ... existing fields ...

  // Geographic breakdown
  topCountries: v.array(v.object({
    country: v.string(),
    visitors: v.number(),
  })),

  topCities: v.array(v.object({
    city: v.string(),
    visitors: v.number(),
  })),

  // Device breakdown
  deviceBreakdown: v.object({
    mobile: v.number(),
    desktop: v.number(),
    tablet: v.number(),
  }),

  // Campaign tracking
  topCampaigns: v.array(v.object({
    campaign: v.string(),
    source: v.string(),
    medium: v.string(),
    visitors: v.number(),
    conversions: v.number(),
  })),

  // Referrer tracking
  topReferrers: v.array(v.object({
    referrer: v.string(),
    visitors: v.number(),
  })),
}),
```

---

## Phase 5: Comparative Analytics & Benchmarking

### Overview

Allow filmmakers to understand how their page performs relative to others.

### Features

#### 5.1 Platform Averages

Show how metrics compare to platform-wide averages.

**Example:**
```
Your page vs Platform Average
─────────────────────────────────────────
Metric              | Yours | Average
─────────────────────────────────────────
Avg. session time   | 2:34  |  1:45  ▲
Clips watched/visit | 2.3   |  1.8   ▲
Email capture rate  | 4.2%  |  3.1%  ▲
Bounce rate         | 45%   |  52%   ▲
─────────────────────────────────────────
```

#### 5.2 Percentile Ranking

Show where the filmmaker ranks among all profiles.

**Example:**
- Page views: Top 25%
- Engagement: Top 10%
- Conversions: Top 15%

#### 5.3 Trending Pages

Platform-wide view of which pages are gaining traction.

---

## Implementation Timeline

| Phase | Description | Dependencies |
|-------|-------------|--------------|
| Phase 2 | GA4 Data Import | GA4 API setup, Convex schema |
| Phase 3 | User Dashboard | Phase 2 complete |
| Phase 4 | Advanced Analytics | Phase 3 complete |
| Phase 5 | Benchmarking | Phase 3 complete, sufficient user data |

---

## Security & Privacy Considerations

### Data Access

- Filmmakers can only view analytics for their own profiles
- Platform admins can view aggregate data
- No PII exposed in analytics (email addresses masked)

### Data Retention

- Event-level data: 30 days
- Daily snapshots: 2 years
- Aggregate trends: Indefinite

### GDPR/Privacy

- Analytics data is anonymized
- Respect user Do Not Track preferences
- Cookie consent for non-essential tracking

---

## Resources

- [GA4 Data API Documentation](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Convex Scheduled Functions](https://docs.convex.dev/scheduling/scheduled-functions)
- [GTM Server-Side Tagging](https://developers.google.com/tag-platform/tag-manager/server-side)
