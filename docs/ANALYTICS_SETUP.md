# Analytics Setup Guide

Complete guide for setting up GTM, GA4, and the analytics dashboard.

---

## Overview

| Component | Purpose | Status |
|-----------|---------|--------|
| **GTM Container** | Manages tracking scripts | Need container ID |
| **GA4 Property** | Stores analytics data | Need to create |
| **GA4 Data API** | Pull data into Convex | Need service account |
| **Convex Analytics** | Server-side tracking | ✅ Implemented |
| **Dashboard UI** | Display metrics | To be built |

---

## Step 1: Google Tag Manager Setup

### 1.1 Create GTM Container (if not done)

1. Go to [tagmanager.google.com](https://tagmanager.google.com/)
2. Create Account → Create Container
3. Select "Web" as target platform
4. Copy your Container ID (format: `GTM-XXXXXXX`)

### 1.2 Set Environment Variable

**For Next.js (client-side tracking):**
```bash
# In .env.local (or Vercel Environment Variables)
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

> **Note:** This must be `NEXT_PUBLIC_` prefixed to work client-side.

---

## Step 2: Google Analytics 4 Setup

### 2.1 Create GA4 Property

1. Go to [analytics.google.com](https://analytics.google.com/)
2. Admin → Create Property
3. Enter property name: "FLMLNK Production"
4. Create a Web Data Stream
5. Copy your **Measurement ID** (format: `G-XXXXXXXXXX`)

### 2.2 Connect GTM to GA4

In GTM, create a **GA4 Configuration Tag**:

1. Tags → New → Google Analytics: GA4 Configuration
2. Enter your Measurement ID: `G-XXXXXXXXXX`
3. Trigger: All Pages
4. Save and Publish

### 2.3 Create Event Tags in GTM

For each event category, create a GA4 Event Tag. Example for signup:

**Tag: GA4 - Signup Success**
- Tag Type: Google Analytics: GA4 Event
- Configuration Tag: (your GA4 config tag)
- Event Name: `signup_success`
- Event Parameters:
  - `auth_method`: `{{DLV - auth_method}}`
  - `user_id`: `{{DLV - user_id}}`
- Trigger: Custom Event = `signup_success`

See `docs/GTM_TRACKING_GUIDE.md` for all events to configure.

---

## Step 3: GA4 Data API Setup (Pull Data Back)

### 3.1 Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Create new project: "FLMLNK Analytics"
3. Enable the **Google Analytics Data API**

### 3.2 Create Service Account

1. IAM & Admin → Service Accounts → Create
2. Name: "flmlnk-analytics-reader"
3. Grant role: (skip for now)
4. Create key → JSON → Download

### 3.3 Add Service Account to GA4

1. In GA4: Admin → Property Access Management
2. Add user: `flmlnk-analytics-reader@your-project.iam.gserviceaccount.com`
3. Role: **Viewer**

### 3.4 Set Convex Environment Variables

```bash
# Set the GA4 Property ID (numeric, found in Admin → Property Settings)
npx convex env set GA4_PROPERTY_ID 123456789

# Set the service account credentials (the entire JSON file content)
npx convex env set GA4_SERVICE_ACCOUNT_KEY '{"type":"service_account","project_id":"...","private_key":"..."}'
```

---

## Step 4: Environment Variables Summary

### Next.js (Client-Side)

| Variable | Purpose | Where to Set |
|----------|---------|--------------|
| `NEXT_PUBLIC_GTM_ID` | GTM Container ID | Vercel + .env.local |

### Convex (Server-Side)

| Variable | Purpose | How to Set |
|----------|---------|------------|
| `GA4_PROPERTY_ID` | GA4 numeric property ID | `npx convex env set GA4_PROPERTY_ID 123456789` |
| `GA4_SERVICE_ACCOUNT_KEY` | Service account JSON | `npx convex env set GA4_SERVICE_ACCOUNT_KEY '{...}'` |

---

## Step 5: Verify Setup

### Test GTM

1. In GTM, click "Preview"
2. Enter your site URL
3. Trigger events and verify they appear in Tag Assistant

### Test GA4

1. In GA4, go to Reports → Realtime
2. Visit your site
3. Verify events appear in real-time view

### Test Convex Analytics

```bash
# Check if events are being logged
npx convex dashboard
# Navigate to analytics_events table
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLMLNK Analytics Flow                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────┐                                                   │
│   │   Browser    │                                                   │
│   │   Events     │                                                   │
│   └──────┬───────┘                                                   │
│          │                                                           │
│          ▼                                                           │
│   ┌──────────────┐      ┌──────────────┐      ┌──────────────┐      │
│   │     GTM      │─────▶│     GA4      │─────▶│   BigQuery   │      │
│   │  Container   │      │   Property   │      │  (optional)  │      │
│   └──────────────┘      └──────┬───────┘      └──────────────┘      │
│          │                     │                                     │
│          │                     │ GA4 Data API                        │
│          │                     │ (daily cron)                        │
│          ▼                     ▼                                     │
│   ┌──────────────────────────────────────────┐                      │
│   │              Convex Database              │                      │
│   │                                           │                      │
│   │  ┌─────────────────┐ ┌─────────────────┐ │                      │
│   │  │ analytics_events│ │analytics_snapshots│                      │
│   │  │ (real-time)     │ │ (daily aggregates)│                      │
│   │  └─────────────────┘ └─────────────────┘ │                      │
│   │                                           │                      │
│   └──────────────────────────────────────────┘                      │
│                     │                                                │
│                     ▼                                                │
│   ┌──────────────────────────────────────────┐                      │
│   │          Dashboard UI                     │                      │
│   │  /dashboard/actor/analytics               │                      │
│   │                                           │                      │
│   │  • Overview metrics                       │                      │
│   │  • Traffic charts                         │                      │
│   │  • Top clips                              │                      │
│   │  • Activity feed                          │                      │
│   └──────────────────────────────────────────┘                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## What's Already Implemented

### Server-Side Analytics (Convex)

```typescript
// Events being logged automatically:
- user_signup (when new user created)
- inquiry_submitted (when booking inquiry sent)
- comment_submitted (when comment posted)
- email_captured (when fan email collected)

// Available queries:
api.analytics.getActivityFeed({ actorProfileId, limit })
api.analytics.getOverview({ actorProfileId, daysBack })
api.analytics.getTopClips({ actorProfileId, limit })
```

### Client-Side Tracking (GTM)

```typescript
// Implemented in src/lib/gtm.ts:
pushGTMEvent("page_view", { page_name: "..." })
pushGTMEvent("tab_change", { tab_name: "..." })
pushGTMEvent("clip_share", { clip_title: "..." })
// ... and more
```

---

## Next Steps

1. ✅ Set `NEXT_PUBLIC_GTM_ID` in Vercel
2. ⬜ Create GA4 property and connect to GTM
3. ⬜ Set up GA4 Data API credentials
4. ⬜ Implement daily import job (Phase 2)
5. ⬜ Build dashboard UI (Phase 3)
