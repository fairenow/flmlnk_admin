# Public Links Template System - Implementation Plan

## Executive Summary

Transform the current single-layout public links page (`/f/[slug]`) into a template system with **system-provided templates** that users can apply to their profile and specific projects.

### Key Decisions
- **URL Strategy:** `/f/[slug]/t/[templateSlug]` (nested routes)
- **Template Ownership:** System templates only (no user-created templates)
- **Template Limit:** 2 templates can be active simultaneously per user
- **Version History:** Not required
- **Custom Domains:** Future consideration

---

## System Templates

We will create 4 system templates:

| Template | Slug | Purpose | Key Features |
|----------|------|---------|--------------|
| **Default FLMLNK** | `default` | Current layout | All sections, standard hero with tabs |
| **Press Kit** | `press-kit` | Professional/industry | Compact hero, About, Films, Contact (no comments) |
| **Casting Submission** | `casting` | Audition reels | Video-bg hero, Clips prominent, Films, Contact |
| **Fan Page** | `fan-page` | Fan engagement | Cinematic layout, Comments prominent, Social sharing |

---

## Phase 1: Database Schema

### 1.1 Create `system_templates` Table

**File:** `convex/schema.ts`

```typescript
system_templates: defineTable({
  name: v.string(),                          // "Default FLMLNK", "Press Kit", etc.
  slug: v.string(),                          // "default", "press-kit", "casting", "fan-page"
  description: v.string(),                   // Template description for UI

  // Layout Configuration
  layout: v.object({
    variant: v.string(),                     // "standard", "cinematic", "minimal"
    heroStyle: v.string(),                   // "full", "compact", "video-bg"
  }),

  // Section Configuration
  sections: v.array(v.object({
    id: v.string(),                          // "hero", "about", "films", "clips", "contact", "comments"
    enabled: v.boolean(),
    order: v.number(),
  })),

  // Preview/Thumbnail
  previewImageUrl: v.optional(v.string()),

  createdAt: v.number(),
})
.index("by_slug", ["slug"])
```

### 1.2 Create `profile_templates` Table

**Purpose:** Track which templates a user has activated (max 2)

```typescript
profile_templates: defineTable({
  actorProfileId: v.id("actor_profiles"),
  templateSlug: v.string(),                  // Reference to system_templates.slug
  isDefault: v.boolean(),                    // Is this the default template for /f/[slug]?

  // User customization per template
  customization: v.optional(v.object({
    primaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
  })),

  activatedAt: v.number(),
})
.index("by_actorProfile", ["actorProfileId"])
.index("by_actorProfile_default", ["actorProfileId", "isDefault"])
.index("by_actorProfile_template", ["actorProfileId", "templateSlug"])
```

### 1.3 Create `project_templates` Table

**Purpose:** Assign specific templates to specific projects

```typescript
project_templates: defineTable({
  projectId: v.id("projects"),
  actorProfileId: v.id("actor_profiles"),
  templateSlug: v.string(),                  // Which template to use for this project

  // Project-specific overrides
  overrides: v.optional(v.object({
    headline: v.optional(v.string()),
    ctaText: v.optional(v.string()),
    ctaUrl: v.optional(v.string()),
  })),

  createdAt: v.number(),
})
.index("by_project", ["projectId"])
.index("by_actorProfile", ["actorProfileId"])
```

---

## Phase 2: Backend API

### 2.1 System Template Queries

**File:** `convex/templates.ts` (new)

```typescript
// Get all available system templates
getSystemTemplates: query({})

// Get single template by slug
getSystemTemplateBySlug: query({ slug: string })
```

### 2.2 Profile Template Management

**File:** `convex/templates.ts`

```typescript
// Get user's activated templates (max 2)
getProfileTemplates: query({ actorProfileId })

// Activate a template for profile (enforces max 2 limit)
activateTemplate: mutation({ actorProfileId, templateSlug, isDefault? })

// Deactivate a template
deactivateTemplate: mutation({ actorProfileId, templateSlug })

// Set default template
setDefaultTemplate: mutation({ actorProfileId, templateSlug })

// Update template customization (colors)
updateTemplateCustomization: mutation({ actorProfileId, templateSlug, customization })
```

### 2.3 Project Template Assignment

**File:** `convex/templates.ts`

```typescript
// Assign template to project
assignTemplateToProject: mutation({ projectId, templateSlug, overrides? })

// Remove template from project (falls back to profile default)
removeTemplateFromProject: mutation({ projectId })

// Get template for specific project
getProjectTemplate: query({ projectId })
```

### 2.4 Update Public Page Query

**File:** `convex/filmmakers.ts`

Update `getPublicBySlug` to accept optional `templateSlug`:

```typescript
getPublicBySlug: query({
  slug: string,
  templateSlug?: string  // NEW
})

// Resolution order:
// 1. If templateSlug provided → use that template
// 2. Else → use profile's default template
// 3. Fallback → "default" system template
```

New query for project-specific pages:

```typescript
getPublicByProject: query({
  slug: string,
  projectSlug: string
})
// Returns profile data + project data + project's assigned template
```

---

## Phase 3: Seed System Templates

### 3.1 Template Definitions

**File:** `convex/seedTemplates.ts` (new)

```typescript
const SYSTEM_TEMPLATES = [
  {
    name: "Default FLMLNK",
    slug: "default",
    description: "The classic FLMLNK layout with all sections",
    layout: {
      variant: "standard",
      heroStyle: "full",
    },
    sections: [
      { id: "hero", enabled: true, order: 0 },
      { id: "about", enabled: true, order: 1 },
      { id: "films", enabled: true, order: 2 },
      { id: "clips", enabled: true, order: 3 },
      { id: "comments", enabled: true, order: 4 },
      { id: "contact", enabled: true, order: 5 },
    ],
  },
  {
    name: "Press Kit",
    slug: "press-kit",
    description: "Professional layout for industry contacts",
    layout: {
      variant: "minimal",
      heroStyle: "compact",
    },
    sections: [
      { id: "hero", enabled: true, order: 0 },
      { id: "about", enabled: true, order: 1 },
      { id: "films", enabled: true, order: 2 },
      { id: "clips", enabled: true, order: 3 },
      { id: "contact", enabled: true, order: 4 },
      { id: "comments", enabled: false, order: 5 },
    ],
  },
  {
    name: "Casting Submission",
    slug: "casting",
    description: "Showcase your reels for auditions",
    layout: {
      variant: "standard",
      heroStyle: "video-bg",
    },
    sections: [
      { id: "hero", enabled: true, order: 0 },
      { id: "clips", enabled: true, order: 1 },
      { id: "films", enabled: true, order: 2 },
      { id: "about", enabled: true, order: 3 },
      { id: "contact", enabled: true, order: 4 },
      { id: "comments", enabled: false, order: 5 },
    ],
  },
  {
    name: "Fan Page",
    slug: "fan-page",
    description: "Cinematic experience for your fans",
    layout: {
      variant: "cinematic",
      heroStyle: "full",
    },
    sections: [
      { id: "hero", enabled: true, order: 0 },
      { id: "about", enabled: true, order: 1 },
      { id: "films", enabled: true, order: 2 },
      { id: "clips", enabled: true, order: 3 },
      { id: "comments", enabled: true, order: 4 },
      { id: "contact", enabled: true, order: 5 },
    ],
  },
];
```

### 3.2 Seed Function

```typescript
// Run once to populate system_templates table
seedSystemTemplates: mutation({})

// Migration: Give all existing profiles the "default" template
migrateExistingProfiles: mutation({})
```

---

## Phase 4: URL Routing

### 4.1 Route Structure

```
/f/[slug]                      → Profile's default template
/f/[slug]/t/[templateSlug]     → Specific template (e.g., /f/robertq/t/press-kit)
/f/[slug]/p/[projectSlug]      → Project-specific page with assigned template
```

### 4.2 New Route Files

**File:** `src/app/f/[slug]/t/[templateSlug]/page.tsx` (new)

```typescript
// Renders public page with specific template
// Uses getPublicBySlug({ slug, templateSlug })
```

**File:** `src/app/f/[slug]/p/[projectSlug]/page.tsx` (new)

```typescript
// Renders project-focused page
// Uses getPublicByProject({ slug, projectSlug })
// Hero shows project details, clips filtered to project
```

### 4.3 Shared Page Component

**File:** `src/components/actorPage/PublicPageContainer.tsx` (new)

Extract common logic from current `page.tsx`:
- Accepts `template` config as prop
- Renders sections based on template configuration
- Handles section ordering dynamically

---

## Phase 5: Template Selection UI

### 5.1 Template Selector Page

**File:** `src/app/dashboard/actor/templates/page.tsx` (new)

Features:
- Display all 4 system templates as cards with previews
- Show which templates are currently activated (max 2)
- Toggle to activate/deactivate templates
- Set default template toggle
- Color customization per activated template

### 5.2 Project Template Assignment

**File:** Update `src/components/projects/` (existing project editor)

Add to project edit form:
- Dropdown: "Template for this project"
- Options: "Use default", + user's activated templates
- Override fields for project-specific headline/CTA

---

## Phase 6: Template Rendering

### 6.1 Template Renderer Component

**File:** `src/components/actorPage/TemplateRenderer.tsx` (new)

```typescript
interface TemplateRendererProps {
  template: SystemTemplate;
  profile: ActorProfile;
  projects: Project[];
  clips: Clip[];
  customization?: { primaryColor?, accentColor? };
}

// Renders sections in template-defined order
// Respects section enabled/disabled flags
// Applies layout variant styling
```

### 6.2 Update Section Components

Add template-aware props to existing components:

**Files to update:**
- `src/components/actorPage/Hero.tsx` - Add `heroStyle` prop
- `src/components/actorPage/CinematicHero/` - Use for `variant: "cinematic"`
- `src/components/actorPage/AboutSection.tsx` - No changes needed
- `src/components/actorPage/FilmographySlider.tsx` - No changes needed
- `src/components/actorPage/YouTubeReelsPlayer/` - No changes needed
- `src/components/actorPage/ContactSection.tsx` - No changes needed
- `src/components/actorPage/CommentsSection.tsx` - No changes needed

### 6.3 Layout Variants

| Variant | Hero | Styling |
|---------|------|---------|
| `standard` | `Hero` component | Current default styling |
| `cinematic` | `CinematicHero` | Netflix-style dark theme |
| `minimal` | `Hero` with compact | Clean, professional look |

| Hero Style | Behavior |
|------------|----------|
| `full` | Current full-height hero |
| `compact` | Reduced height, no video background |
| `video-bg` | Featured clip plays in hero background |

---

## Phase 7: Migration

### 7.1 Migration Steps

1. **Add schema tables** - `system_templates`, `profile_templates`, `project_templates`
2. **Run seed** - Populate `system_templates` with 4 templates
3. **Migrate profiles** - Create `profile_templates` entry with `default` for all existing profiles
4. **Deploy routes** - Add new `/t/` and `/p/` routes
5. **Update UI** - Add template selector to dashboard

### 7.2 Backward Compatibility

- `/f/[slug]` continues to work (uses profile's default template)
- Existing `theme` field on `actor_profiles` is respected
- Template customization colors override profile theme when set

---

## Implementation Order

### Step 1: Schema & Seed
1. Add new tables to `convex/schema.ts`
2. Create `convex/templates.ts` with queries/mutations
3. Create `convex/seedTemplates.ts` and run seed

### Step 2: Backend Integration
4. Update `convex/filmmakers.ts` - add template resolution
5. Create `getPublicByProject` query

### Step 3: Routing
6. Create `src/app/f/[slug]/t/[templateSlug]/page.tsx`
7. Create `src/app/f/[slug]/p/[projectSlug]/page.tsx`
8. Extract `PublicPageContainer.tsx`

### Step 4: Template Rendering
9. Create `TemplateRenderer.tsx`
10. Update `Hero.tsx` for hero styles
11. Test all 4 templates render correctly

### Step 5: Dashboard UI
12. Create template selector page
13. Add project template assignment to project editor
14. Add template limit enforcement (max 2)

---

## File Structure Summary

```
convex/
├── schema.ts                    # + system_templates, profile_templates, project_templates
├── templates.ts                 # NEW - Template CRUD & queries
├── seedTemplates.ts             # NEW - System template definitions & seed
└── filmmakers.ts                # Updated - Template resolution

src/app/
├── dashboard/actor/
│   └── templates/
│       └── page.tsx             # NEW - Template selector
└── f/[slug]/
    ├── page.tsx                 # Updated - Use PublicPageContainer
    ├── t/[templateSlug]/
    │   └── page.tsx             # NEW - Template-specific route
    └── p/[projectSlug]/
        └── page.tsx             # NEW - Project-specific route

src/components/
└── actorPage/
    ├── PublicPageContainer.tsx  # NEW - Shared page logic
    ├── TemplateRenderer.tsx     # NEW - Section renderer
    └── Hero.tsx                 # Updated - heroStyle prop
```

---

## Success Criteria

- [ ] 4 system templates seeded and available
- [ ] Users can activate up to 2 templates
- [ ] Users can set a default template
- [ ] `/f/[slug]` uses default template
- [ ] `/f/[slug]/t/press-kit` renders Press Kit template
- [ ] `/f/[slug]/p/my-film` renders project with assigned template
- [ ] Template selector UI in dashboard
- [ ] Project template assignment in project editor
- [ ] Existing profiles migrated with "default" template
