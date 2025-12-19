# GTM Tracking Guide for FLMLNK

This document provides comprehensive instructions for configuring Google Tag Manager to track all events implemented in the FLMLNK platform.

---

## Environment Setup

### Required Environment Variable

```bash
NEXT_PUBLIC_GTM_ID=GTM-XXXXXXX
```

Get your container ID from [Google Tag Manager](https://tagmanager.google.com/).

---

## GTM Dashboard Configuration

### 1. Data Layer Variables

Create these Data Layer Variables in GTM to capture event data:

| Variable Name | Data Layer Variable Name | Type |
|---------------|-------------------------|------|
| Event Category | event_category | Data Layer Variable |
| Auth Method | auth_method | Data Layer Variable |
| Error Message | error_message | Data Layer Variable |
| Step Number | step_number | Data Layer Variable |
| Step Name | step_name | Data Layer Variable |
| Page Name | page_name | Data Layer Variable |
| CTA Label | cta_label | Data Layer Variable |
| CTA Location | cta_location | Data Layer Variable |
| Clip Title | clip_title | Data Layer Variable |
| Clip ID | clip_id | Data Layer Variable |
| Form Location | form_location | Data Layer Variable |
| Platform | platform | Data Layer Variable |
| IMDB ID | imdb_id | Data Layer Variable |
| Clip Count | clip_count | Data Layer Variable |
| Actor Slug | actor_slug | Data Layer Variable |
| User ID | user_id | Data Layer Variable |
| Timestamp | timestamp | Data Layer Variable |

### 2. Triggers

Create these triggers for each event category:

#### Authentication Triggers
| Trigger Name | Type | Condition |
|--------------|------|-----------|
| Signup Initiated | Custom Event | event equals signup_initiated |
| Signup Success | Custom Event | event equals signup_success |
| Signup Error | Custom Event | event equals signup_error |
| Signin Success | Custom Event | event equals signin_success |
| Signout | Custom Event | event equals signout |
| Forgot Password Clicked | Custom Event | event equals forgot_password_clicked |

#### Onboarding Triggers
| Trigger Name | Type | Condition |
|--------------|------|-----------|
| Onboarding Step Viewed | Custom Event | event equals onboarding_step_viewed |
| Onboarding Step Completed | Custom Event | event equals onboarding_step_completed |
| Onboarding Completed | Custom Event | event equals onboarding_completed |
| IMDB Connected | Custom Event | event equals imdb_connected |
| Trailer Uploaded | Custom Event | event equals trailer_uploaded |
| Clip Added | Custom Event | event equals clip_added |
| Social Linked | Custom Event | event equals social_linked |
| Streaming Platform Added | Custom Event | event equals streaming_platform_added |

#### Navigation Triggers
| Trigger Name | Type | Condition |
|--------------|------|-----------|
| Page View | Custom Event | event equals page_view |
| CTA Clicked | Custom Event | event equals cta_clicked |
| Tab Changed | Custom Event | event equals tab_changed |
| External Link Clicked | Custom Event | event equals external_link_clicked |

#### Video Triggers
| Trigger Name | Type | Condition |
|--------------|------|-----------|
| Clip Played | Custom Event | event equals clip_played |
| Clip Shared | Custom Event | event equals clip_shared |
| Player Modal Opened | Custom Event | event equals player_modal_opened |
| Player Modal Closed | Custom Event | event equals player_modal_closed |

#### Engagement Triggers
| Trigger Name | Type | Condition |
|--------------|------|-----------|
| Comment Submitted | Custom Event | event equals comment_submitted |
| Comment Liked | Custom Event | event equals comment_liked |
| Social Link Clicked | Custom Event | event equals social_link_clicked |
| Watch CTA Clicked | Custom Event | event equals watch_cta_clicked |
| Contribution Clicked | Custom Event | event equals contribution_clicked |

#### Form Triggers
| Trigger Name | Type | Condition |
|--------------|------|-----------|
| Email Capture Submitted | Custom Event | event equals email_capture_submitted |
| Email Capture Success | Custom Event | event equals email_capture_success |
| Email Capture Error | Custom Event | event equals email_capture_error |
| Booking Inquiry Submitted | Custom Event | event equals booking_inquiry_submitted |

---

## Complete Event Reference

### Authentication Events

| Event Name | Category | Parameters | Description |
|------------|----------|------------|-------------|
| signup_initiated | authentication | auth_method | User starts signup process |
| signup_success | authentication | auth_method, user_id | User completes signup |
| signup_error | authentication | auth_method, error_message | Signup fails |
| signin_success | authentication | auth_method, user_id | User signs in |
| signout | authentication | - | User signs out |
| forgot_password_clicked | authentication | - | User clicks forgot password |

### Onboarding Events

| Event Name | Category | Parameters | Description |
|------------|----------|------------|-------------|
| onboarding_step_viewed | onboarding | step_number, step_name | User views onboarding step |
| onboarding_step_completed | onboarding | step_number, step_name | User completes onboarding step |
| onboarding_completed | onboarding | - | User finishes entire onboarding |
| imdb_connected | onboarding | imdb_id | User connects IMDB profile |
| trailer_uploaded | onboarding | - | User uploads a trailer |
| clip_added | onboarding | clip_count | User adds clips |
| social_linked | onboarding | platform | User links social account |
| streaming_platform_added | onboarding | platform | User adds streaming link |

### Navigation Events

| Event Name | Category | Parameters | Description |
|------------|----------|------------|-------------|
| page_view | navigation | page_name | Page load |
| cta_clicked | navigation | cta_label, cta_location, destination | CTA button clicked |
| tab_changed | navigation | tab_name, previous_tab | Tab switch |
| external_link_clicked | navigation | url, link_type | External link click |

### Video Events

| Event Name | Category | Parameters | Description |
|------------|----------|------------|-------------|
| clip_played | video | clip_title, clip_id | Clip starts playing |
| clip_shared | video | clip_title, clip_id, share_method | Clip is shared |
| player_modal_opened | video | clip_title | Video modal opens |
| player_modal_closed | video | clip_title | Video modal closes |

### Engagement Events

| Event Name | Category | Parameters | Description |
|------------|----------|------------|-------------|
| comment_submitted | engagement | - | Comment posted |
| comment_liked | engagement | - | Comment liked |
| social_link_clicked | engagement | platform, url | Social link clicked |
| watch_cta_clicked | engagement | platform, url | Watch link clicked |
| contribution_clicked | engagement | clip_title, clip_id | Contribution button clicked |

### Form/Conversion Events

| Event Name | Category | Parameters | Description |
|------------|----------|------------|-------------|
| email_capture_submitted | form | form_location | Email form submitted |
| email_capture_success | form | form_location | Email captured successfully |
| email_capture_error | form | form_location, error_message | Email capture failed |
| booking_inquiry_submitted | form | - | Booking inquiry sent |

---

## GA4 Event Setup

### Recommended Conversions

Mark these events as conversions in GA4:

1. **signup_success** - User acquisition
2. **onboarding_completed** - Activation
3. **email_capture_success** - Lead generation
4. **booking_inquiry_submitted** - High-value lead
5. **clip_shared** - Viral engagement

### Funnel Configuration

Create these funnels in GA4:

#### Signup Funnel
1. page_view (page_name = "homepage")
2. signup_initiated
3. signup_success
4. onboarding_step_viewed (step_number = 1)

#### Onboarding Funnel
1. onboarding_step_viewed (step_number = 1)
2. onboarding_step_viewed (step_number = 2)
3. onboarding_step_viewed (step_number = 3)
4. onboarding_step_viewed (step_number = 4)
5. onboarding_step_viewed (step_number = 5)
6. onboarding_step_viewed (step_number = 6)
7. onboarding_step_viewed (step_number = 7)
8. onboarding_completed

---

## Convex Server-Side Analytics

In addition to GTM/GA4, events are logged to Convex for:
- Real-time activity feeds
- Platform-owned analytics
- Ad blocker bypass

### Server-Side Events Logged

| Event Type | Mutation | Description |
|------------|----------|-------------|
| user_signup | users.ensureFromAuth | New user created |
| inquiry_submitted | inquiries.submitBookingInquiry | Booking inquiry received |
| comment_submitted | comments.submit | Comment posted |
| email_captured | filmmakers.submitFanEmail | Fan email collected |

### Convex Analytics Queries

```typescript
// Get activity feed for dashboard
api.analytics.getActivityFeed({ actorProfileId, limit: 20 })

// Get overview metrics
api.analytics.getOverview({ actorProfileId, daysBack: 30 })

// Get top performing clips
api.analytics.getTopClips({ actorProfileId, limit: 5 })
```

---

## Testing

### GTM Preview Mode

1. Open GTM and click "Preview"
2. Enter your site URL
3. Interact with the site to trigger events
4. Verify events appear in the Tag Assistant

### Console Debugging

Add this to your browser console to see all GTM events:

```javascript
window.dataLayer = window.dataLayer || [];
const originalPush = window.dataLayer.push;
window.dataLayer.push = function() {
  console.log('GTM Event:', arguments[0]);
  return originalPush.apply(this, arguments);
};
```

---

## See Also

- [GTM_FUTURE_PHASES.md](./GTM_FUTURE_PHASES.md) - Roadmap for analytics dashboard
