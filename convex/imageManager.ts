import { v } from "convex/values";
import {
  mutation,
  query,
  action,
  internalMutation,
  type MutationCtx,
  type QueryCtx,
  type ActionCtx,
} from "./_generated/server";
import { Doc, Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";

// Helper: resolve the current user + profile from a slug and auth
async function getOwnedProfileBySlug(
  ctx: QueryCtx | MutationCtx,
  slug: string
) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  const user = await ctx.db
    .query("users")
    .withIndex("by_authId", (q) => q.eq("authId", identity.tokenIdentifier))
    .unique();

  if (!user) return null;

  const profile = await ctx.db
    .query("actor_profiles")
    .withIndex("by_slug", (q) => q.eq("slug", slug))
    .unique();

  if (!profile) return null;
  if (profile.userId !== user._id) return null;

  return { user, profile } as const;
}

// ============================================================================
// PROJECT FUNCTIONS
// ============================================================================

// Get all projects for a profile
export const getProjects = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    const projects = await ctx.db
      .query("image_manager_projects")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .collect();

    // Fetch first asset thumbnail for each project
    const projectsWithThumbnails = await Promise.all(
      projects.map(async (project) => {
        // Get the first asset for this project (oldest first, as a representative image)
        const firstAsset = await ctx.db
          .query("image_manager_assets")
          .withIndex("by_project", (q) => q.eq("projectId", project._id))
          .first();

        return {
          ...project,
          firstAssetUrl: firstAsset?.url ?? null,
        };
      })
    );

    return projectsWithThumbnails.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },
});

// Get a single project with its folder structure
export const getProject = query({
  args: { slug: v.string(), projectId: v.id("image_manager_projects") },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return null;

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) return null;

    // Get all folders for this project
    const folders = await ctx.db
      .query("image_manager_folders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    // Get asset counts per folder
    const assets = await ctx.db
      .query("image_manager_assets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    const folderAssetCounts = new Map<string, number>();
    let rootAssetCount = 0;
    for (const asset of assets) {
      if (asset.folderId) {
        const count = folderAssetCounts.get(asset.folderId) ?? 0;
        folderAssetCounts.set(asset.folderId, count + 1);
      } else {
        rootAssetCount++;
      }
    }

    return {
      ...project,
      folders: folders.map((f) => ({
        ...f,
        assetCount: folderAssetCounts.get(f._id) ?? 0,
      })),
      rootAssetCount,
      totalAssets: assets.length,
    };
  },
});

// Create a new project
export const createProject = mutation({
  args: {
    slug: v.string(),
    name: v.string(),
    description: v.optional(v.string()),
    projectType: v.optional(v.string()),
    releaseYear: v.optional(v.number()),
    genre: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    // Get next sort order
    const existingProjects = await ctx.db
      .query("image_manager_projects")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .collect();

    const maxSortOrder = Math.max(
      0,
      ...existingProjects.map((p) => p.sortOrder ?? 0)
    );

    const projectId = await ctx.db.insert("image_manager_projects", {
      actorProfileId: owned.profile._id,
      name: args.name,
      description: args.description,
      projectType: args.projectType ?? "film",
      status: "active",
      releaseYear: args.releaseYear,
      genre: args.genre,
      sortOrder: maxSortOrder + 1,
      createdAt: Date.now(),
    });

    // Create default folders for the project
    const defaultFolders = [
      { name: "Social Media", folderType: "social_media", icon: "share-2" },
      { name: "Paid Ads", folderType: "paid_ads", icon: "megaphone" },
      { name: "Thumbnails", folderType: "thumbnails", icon: "image" },
      { name: "Press Kit", folderType: "press_kit", icon: "newspaper" },
      { name: "Behind the Scenes", folderType: "bts", icon: "camera" },
    ];

    for (let i = 0; i < defaultFolders.length; i++) {
      await ctx.db.insert("image_manager_folders", {
        actorProfileId: owned.profile._id,
        projectId,
        name: defaultFolders[i].name,
        folderType: defaultFolders[i].folderType,
        icon: defaultFolders[i].icon,
        sortOrder: i,
        isExpanded: false,
        createdAt: Date.now(),
      });
    }

    return projectId;
  },
});

// Update a project
export const updateProject = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    projectType: v.optional(v.string()),
    status: v.optional(v.string()),
    releaseYear: v.optional(v.number()),
    genre: v.optional(v.string()),
    coverStorageId: v.optional(v.id("_storage")),
    coverUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    const { slug, projectId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.projectId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Delete a project and all its contents
export const deleteProject = mutation({
  args: { slug: v.string(), projectId: v.id("image_manager_projects") },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    // Delete all assets in the project
    const assets = await ctx.db
      .query("image_manager_assets")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const asset of assets) {
      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(asset._id);
    }

    // Delete all folders
    const folders = await ctx.db
      .query("image_manager_folders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const folder of folders) {
      await ctx.db.delete(folder._id);
    }

    // Delete auto-capture jobs
    const jobs = await ctx.db
      .query("auto_capture_jobs")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    for (const job of jobs) {
      await ctx.db.delete(job._id);
    }

    // Delete the project
    await ctx.db.delete(args.projectId);
  },
});

// ============================================================================
// FOLDER FUNCTIONS
// ============================================================================

// Get folders for a project
export const getFolders = query({
  args: { slug: v.string(), projectId: v.id("image_manager_projects") },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) return [];

    const folders = await ctx.db
      .query("image_manager_folders")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .collect();

    return folders.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  },
});

// Create a new folder
export const createFolder = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    parentId: v.optional(v.id("image_manager_folders")),
    name: v.string(),
    folderType: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    // Verify parent folder if provided
    if (args.parentId) {
      const parent = await ctx.db.get(args.parentId);
      if (!parent || parent.projectId !== args.projectId) {
        throw new Error("Parent folder not found");
      }
    }

    // Get next sort order for this parent level
    const siblings = await ctx.db
      .query("image_manager_folders")
      .withIndex("by_project_parent", (q) =>
        q.eq("projectId", args.projectId).eq("parentId", args.parentId)
      )
      .collect();

    const maxSortOrder = Math.max(0, ...siblings.map((f) => f.sortOrder ?? 0));

    return await ctx.db.insert("image_manager_folders", {
      actorProfileId: owned.profile._id,
      projectId: args.projectId,
      parentId: args.parentId,
      name: args.name,
      folderType: args.folderType ?? "custom",
      color: args.color,
      icon: args.icon ?? "folder",
      description: args.description,
      sortOrder: maxSortOrder + 1,
      isExpanded: false,
      createdAt: Date.now(),
    });
  },
});

// Update a folder
export const updateFolder = mutation({
  args: {
    slug: v.string(),
    folderId: v.id("image_manager_folders"),
    name: v.optional(v.string()),
    folderType: v.optional(v.string()),
    color: v.optional(v.string()),
    icon: v.optional(v.string()),
    description: v.optional(v.string()),
    isExpanded: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.actorProfileId !== owned.profile._id) {
      throw new Error("Folder not found");
    }

    const { slug, folderId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.folderId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Delete a folder and move contents to parent
export const deleteFolder = mutation({
  args: {
    slug: v.string(),
    folderId: v.id("image_manager_folders"),
    deleteContents: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.actorProfileId !== owned.profile._id) {
      throw new Error("Folder not found");
    }

    // Get all assets in this folder
    const assets = await ctx.db
      .query("image_manager_assets")
      .withIndex("by_folder", (q) => q.eq("folderId", args.folderId))
      .collect();

    // Get all child folders
    const childFolders = await ctx.db
      .query("image_manager_folders")
      .withIndex("by_parent", (q) => q.eq("parentId", args.folderId))
      .collect();

    if (args.deleteContents) {
      // Delete all assets
      for (const asset of assets) {
        await ctx.storage.delete(asset.storageId);
        await ctx.db.delete(asset._id);
      }

      // Recursively delete child folders
      for (const child of childFolders) {
        // Use the same deletion logic for children
        const childAssets = await ctx.db
          .query("image_manager_assets")
          .withIndex("by_folder", (q) => q.eq("folderId", child._id))
          .collect();

        for (const asset of childAssets) {
          await ctx.storage.delete(asset.storageId);
          await ctx.db.delete(asset._id);
        }

        await ctx.db.delete(child._id);
      }
    } else {
      // Move assets to parent folder
      for (const asset of assets) {
        await ctx.db.patch(asset._id, {
          folderId: folder.parentId,
          updatedAt: Date.now(),
        });
      }

      // Move child folders to parent
      for (const child of childFolders) {
        await ctx.db.patch(child._id, {
          parentId: folder.parentId,
          updatedAt: Date.now(),
        });
      }
    }

    await ctx.db.delete(args.folderId);
  },
});

// Move a folder to a new parent
export const moveFolder = mutation({
  args: {
    slug: v.string(),
    folderId: v.id("image_manager_folders"),
    newParentId: v.optional(v.id("image_manager_folders")),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const folder = await ctx.db.get(args.folderId);
    if (!folder || folder.actorProfileId !== owned.profile._id) {
      throw new Error("Folder not found");
    }

    // Verify new parent if provided
    if (args.newParentId) {
      const newParent = await ctx.db.get(args.newParentId);
      if (!newParent || newParent.projectId !== folder.projectId) {
        throw new Error("Invalid parent folder");
      }

      // Prevent moving folder into itself or its children
      let checkParent: Id<"image_manager_folders"> | undefined =
        args.newParentId;
      while (checkParent) {
        if (checkParent === args.folderId) {
          throw new Error("Cannot move folder into itself");
        }
        const parentFolder: Doc<"image_manager_folders"> | null = await ctx.db.get(checkParent);
        checkParent = parentFolder?.parentId;
      }
    }

    await ctx.db.patch(args.folderId, {
      parentId: args.newParentId,
      updatedAt: Date.now(),
    });
  },
});

// ============================================================================
// ASSET FUNCTIONS
// ============================================================================

// Get assets for a project/folder
export const getAssets = query({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    folderId: v.optional(v.id("image_manager_folders")),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) return [];

    let assets;

    if (args.folderId !== undefined) {
      // Get assets in a specific folder (including null for root)
      assets = await ctx.db
        .query("image_manager_assets")
        .withIndex("by_project_folder", (q) =>
          q.eq("projectId", args.projectId).eq("folderId", args.folderId)
        )
        .collect();
    } else {
      // Get all assets in the project
      assets = await ctx.db
        .query("image_manager_assets")
        .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
        .collect();
    }

    // Filter by category if provided
    if (args.category) {
      assets = assets.filter((a) => a.assetCategory === args.category);
    }

    return assets.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
  },
});

// Create an asset
export const createAsset = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    folderId: v.optional(v.id("image_manager_folders")),
    name: v.string(),
    description: v.optional(v.string()),
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    sourceType: v.string(),
    sourceId: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourceTimestamp: v.optional(v.number()),
    assetCategory: v.string(),
    targetPlatforms: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    // Verify folder if provided
    if (args.folderId) {
      const folder = await ctx.db.get(args.folderId);
      if (!folder || folder.projectId !== args.projectId) {
        throw new Error("Folder not found");
      }
    }

    // Get the URL for the storage ID
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Failed to get storage URL");

    return await ctx.db.insert("image_manager_assets", {
      actorProfileId: owned.profile._id,
      projectId: args.projectId,
      folderId: args.folderId,
      name: args.name,
      description: args.description,
      storageId: args.storageId,
      url,
      width: args.width,
      height: args.height,
      aspectRatio: args.aspectRatio,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceTitle: args.sourceTitle,
      sourceTimestamp: args.sourceTimestamp,
      assetCategory: args.assetCategory,
      targetPlatforms: args.targetPlatforms,
      tags: args.tags,
      isFavorite: false,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});

// Create multiple assets in batch
export const createAssetsBatch = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    folderId: v.optional(v.id("image_manager_folders")),
    assets: v.array(
      v.object({
        name: v.string(),
        storageId: v.id("_storage"),
        width: v.number(),
        height: v.number(),
        aspectRatio: v.string(),
        fileSize: v.optional(v.number()),
        mimeType: v.optional(v.string()),
        sourceType: v.string(),
        sourceId: v.optional(v.string()),
        sourceTitle: v.optional(v.string()),
        sourceTimestamp: v.optional(v.number()),
        assetCategory: v.string(),
      })
    ),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    const assetIds: Id<"image_manager_assets">[] = [];

    for (const asset of args.assets) {
      const url = await ctx.storage.getUrl(asset.storageId);
      if (!url) continue;

      const id = await ctx.db.insert("image_manager_assets", {
        actorProfileId: owned.profile._id,
        projectId: args.projectId,
        folderId: args.folderId,
        name: asset.name,
        storageId: asset.storageId,
        url,
        width: asset.width,
        height: asset.height,
        aspectRatio: asset.aspectRatio,
        fileSize: asset.fileSize,
        mimeType: asset.mimeType,
        sourceType: asset.sourceType,
        sourceId: asset.sourceId,
        sourceTitle: asset.sourceTitle,
        sourceTimestamp: asset.sourceTimestamp,
        assetCategory: asset.assetCategory,
        isFavorite: false,
        isPublic: false,
        createdAt: Date.now(),
      });

      assetIds.push(id);
    }

    return assetIds;
  },
});

// Update an asset
export const updateAsset = mutation({
  args: {
    slug: v.string(),
    assetId: v.id("image_manager_assets"),
    name: v.optional(v.string()),
    description: v.optional(v.string()),
    assetCategory: v.optional(v.string()),
    targetPlatforms: v.optional(v.array(v.string())),
    tags: v.optional(v.array(v.string())),
    isFavorite: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.actorProfileId !== owned.profile._id) {
      throw new Error("Asset not found");
    }

    const { slug, assetId, ...updates } = args;
    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(args.assetId, {
      ...filteredUpdates,
      updatedAt: Date.now(),
    });
  },
});

// Move an asset to a different folder
export const moveAsset = mutation({
  args: {
    slug: v.string(),
    assetId: v.id("image_manager_assets"),
    newFolderId: v.optional(v.id("image_manager_folders")),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.actorProfileId !== owned.profile._id) {
      throw new Error("Asset not found");
    }

    // Verify new folder if provided
    if (args.newFolderId) {
      const folder = await ctx.db.get(args.newFolderId);
      if (!folder || folder.projectId !== asset.projectId) {
        throw new Error("Invalid folder");
      }
    }

    await ctx.db.patch(args.assetId, {
      folderId: args.newFolderId,
      updatedAt: Date.now(),
    });
  },
});

// Move multiple assets
export const moveAssetsBatch = mutation({
  args: {
    slug: v.string(),
    assetIds: v.array(v.id("image_manager_assets")),
    newFolderId: v.optional(v.id("image_manager_folders")),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.actorProfileId !== owned.profile._id) continue;

      await ctx.db.patch(assetId, {
        folderId: args.newFolderId,
        updatedAt: Date.now(),
      });
    }
  },
});

// Delete an asset
export const deleteAsset = mutation({
  args: { slug: v.string(), assetId: v.id("image_manager_assets") },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const asset = await ctx.db.get(args.assetId);
    if (!asset || asset.actorProfileId !== owned.profile._id) {
      throw new Error("Asset not found");
    }

    await ctx.storage.delete(asset.storageId);
    await ctx.db.delete(args.assetId);
  },
});

// Delete multiple assets
export const deleteAssetsBatch = mutation({
  args: {
    slug: v.string(),
    assetIds: v.array(v.id("image_manager_assets")),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    for (const assetId of args.assetIds) {
      const asset = await ctx.db.get(assetId);
      if (!asset || asset.actorProfileId !== owned.profile._id) continue;

      await ctx.storage.delete(asset.storageId);
      await ctx.db.delete(assetId);
    }
  },
});

// ============================================================================
// AUTO-CAPTURE JOB FUNCTIONS
// ============================================================================

// Create an auto-capture job
export const createAutoCaptureJob = mutation({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    targetFolderId: v.optional(v.id("image_manager_folders")),
    sourceType: v.string(),
    sourceId: v.optional(v.string()),
    sourceUrl: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    videoDuration: v.optional(v.number()),
    captureMode: v.string(),
    intervalSeconds: v.optional(v.number()),
    frameCount: v.optional(v.number()),
    timestamps: v.optional(v.array(v.number())),
    aspectRatio: v.string(),
    quality: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    return await ctx.db.insert("auto_capture_jobs", {
      actorProfileId: owned.profile._id,
      projectId: args.projectId,
      targetFolderId: args.targetFolderId,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceUrl: args.sourceUrl,
      sourceTitle: args.sourceTitle,
      videoDuration: args.videoDuration,
      captureMode: args.captureMode,
      intervalSeconds: args.intervalSeconds,
      frameCount: args.frameCount,
      timestamps: args.timestamps,
      aspectRatio: args.aspectRatio,
      quality: args.quality ?? "high",
      status: "pending",
      progress: 0,
      createdAt: Date.now(),
    });
  },
});

// Update job progress
export const updateAutoCaptureJobProgress = mutation({
  args: {
    jobId: v.id("auto_capture_jobs"),
    status: v.optional(v.string()),
    progress: v.optional(v.number()),
    currentFrame: v.optional(v.number()),
    totalFrames: v.optional(v.number()),
    errorMessage: v.optional(v.string()),
    capturedCount: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { jobId, ...updates } = args;

    const filteredUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    if (updates.status === "processing" && !updates.errorMessage) {
      (filteredUpdates as Record<string, unknown>).startedAt = Date.now();
    }

    if (
      updates.status === "completed" ||
      updates.status === "failed"
    ) {
      (filteredUpdates as Record<string, unknown>).completedAt = Date.now();
    }

    await ctx.db.patch(jobId, filteredUpdates);
  },
});

// Get active jobs for a profile
export const getActiveJobs = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    const jobs = await ctx.db
      .query("auto_capture_jobs")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .collect();

    return jobs
      .filter((j) => j.status === "pending" || j.status === "processing")
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

// Get job history
export const getJobHistory = query({
  args: { slug: v.string(), projectId: v.optional(v.id("image_manager_projects")) },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return [];

    let jobs;
    const projectId = args.projectId;
    if (projectId) {
      jobs = await ctx.db
        .query("auto_capture_jobs")
        .withIndex("by_project", (q) => q.eq("projectId", projectId))
        .collect();
    } else {
      jobs = await ctx.db
        .query("auto_capture_jobs")
        .withIndex("by_actorProfile", (q) =>
          q.eq("actorProfileId", owned.profile._id)
        )
        .collect();
    }

    return jobs.sort((a, b) => b.createdAt - a.createdAt);
  },
});

// ============================================================================
// STATISTICS
// ============================================================================

// Get statistics for the image manager
export const getStats = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) return null;

    const projects = await ctx.db
      .query("image_manager_projects")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .collect();

    const assets = await ctx.db
      .query("image_manager_assets")
      .withIndex("by_actorProfile", (q) =>
        q.eq("actorProfileId", owned.profile._id)
      )
      .collect();

    const categoryCount: Record<string, number> = {};
    let totalSize = 0;

    for (const asset of assets) {
      categoryCount[asset.assetCategory] =
        (categoryCount[asset.assetCategory] ?? 0) + 1;
      totalSize += asset.fileSize ?? 0;
    }

    return {
      totalProjects: projects.length,
      activeProjects: projects.filter((p) => p.status === "active").length,
      totalAssets: assets.length,
      favoriteAssets: assets.filter((a) => a.isFavorite).length,
      totalStorageBytes: totalSize,
      categoryBreakdown: categoryCount,
    };
  },
});

// ============================================================================
// AI IMAGE GENERATION (Vertex AI Imagen)
// ============================================================================

// Helper function to convert ArrayBuffer to base64 (Web API compatible)
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

// Helper function to convert base64 to Uint8Array (Web API compatible)
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Base64URL encode (for JWT)
function base64UrlEncode(data: string): string {
  return btoa(data).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Import PEM private key for signing
async function importPrivateKey(pemKey: string): Promise<CryptoKey> {
  // Remove PEM headers and newlines
  const pemContents = pemKey
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/-----BEGIN RSA PRIVATE KEY-----/g, '')
    .replace(/-----END RSA PRIVATE KEY-----/g, '')
    .replace(/\s/g, '');

  const binaryKey = base64ToUint8Array(pemContents);

  return await crypto.subtle.importKey(
    'pkcs8',
    binaryKey,
    {
      name: 'RSASSA-PKCS1-v1_5',
      hash: 'SHA-256',
    },
    false,
    ['sign']
  );
}

// Create and sign a JWT for service account authentication
async function createSignedJWT(
  clientEmail: string,
  privateKey: string
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);

  const header = {
    alg: 'RS256',
    typ: 'JWT',
  };

  const payload = {
    iss: clientEmail,
    sub: clientEmail,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const key = await importPrivateKey(privateKey);
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput)
  );

  const signatureBytes = new Uint8Array(signature);
  let signatureString = '';
  for (let i = 0; i < signatureBytes.length; i++) {
    signatureString += String.fromCharCode(signatureBytes[i]);
  }
  const encodedSignature = base64UrlEncode(signatureString);

  return `${signingInput}.${encodedSignature}`;
}

// Get access token from service account credentials
async function getVertexAIAccessToken(serviceAccountJson: string): Promise<string> {
  const credentials = JSON.parse(serviceAccountJson);
  const jwt = await createSignedJWT(credentials.client_email, credentials.private_key);

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to get access token: ${error}`);
  }

  const data = await response.json();
  return data.access_token;
}

/**
 * Generate an AI image using Vertex AI Imagen with image-to-image editing.
 * Passes the actual source image to Imagen for true transformation.
 */
export const generateAIImage = action({
  args: {
    slug: v.string(),
    sourceImageUrl: v.string(),
    prompt: v.string(),
    aspectRatio: v.optional(v.string()), // "1:1", "16:9", "9:16", "4:3", "3:4"
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    imageBase64?: string;
    mimeType?: string;
    error?: string;
  }> => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    // Get Vertex AI service account credentials
    const serviceAccountJson = process.env.VERTEX_AI_SERVICE_ACCOUNT;
    if (!serviceAccountJson) {
      return { success: false, error: "Vertex AI service account not configured" };
    }

    try {
      // Parse service account to get project ID
      const credentials = JSON.parse(serviceAccountJson);
      const projectId = credentials.project_id;

      if (!projectId) {
        return { success: false, error: "Project ID not found in service account credentials" };
      }

      // Fetch the source image and convert to base64
      const imageResponse = await fetch(args.sourceImageUrl);
      if (!imageResponse.ok) {
        return { success: false, error: "Failed to fetch source image" };
      }

      const imageBuffer = await imageResponse.arrayBuffer();
      const base64Image = arrayBufferToBase64(imageBuffer);

      // Get Vertex AI access token
      const accessToken = await getVertexAIAccessToken(serviceAccountJson);

      // Try image editing models that support image-to-image transformation
      // These models accept a source image and apply transformations based on the prompt
      const editModelsToTry = [
        {
          model: "imagegeneration@006",  // Imagen 2 with edit support
          format: "imagen2"
        },
        {
          model: "imagen-3.0-capability-001",  // Imagen 3 editing model
          format: "imagen3"
        },
      ];

      let lastError = "";

      for (const { model, format } of editModelsToTry) {
        const vertexEndpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${model}:predict`;

        // Build request body based on model format
        let requestBody;
        if (format === "imagen2") {
          // Imagen 2 edit format
          requestBody = {
            instances: [
              {
                prompt: args.prompt,
                image: {
                  bytesBase64Encoded: base64Image,
                },
              },
            ],
            parameters: {
              sampleCount: 1,
            },
          };
        } else {
          // Imagen 3 edit format
          requestBody = {
            instances: [
              {
                prompt: args.prompt,
                referenceImages: [
                  {
                    referenceType: 1,  // STYLE_REFERENCE or similar
                    referenceId: 1,
                    referenceImage: {
                      bytesBase64Encoded: base64Image,
                    },
                  },
                ],
              },
            ],
            parameters: {
              sampleCount: 1,
              aspectRatio: args.aspectRatio || "1:1",
            },
          };
        }

        console.log(`Trying Imagen edit model: ${model}`);

        const generateResponse = await fetch(vertexEndpoint, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(requestBody),
        });

        if (generateResponse.ok) {
          const generateData = await generateResponse.json();
          // Vertex AI Imagen returns predictions array with bytesBase64Encoded
          if (generateData.predictions?.[0]?.bytesBase64Encoded) {
            console.log(`Success with model: ${model}`);
            return {
              success: true,
              imageBase64: generateData.predictions[0].bytesBase64Encoded,
              mimeType: generateData.predictions[0].mimeType || "image/png",
            };
          }
          // Response OK but no image data - try next model
          console.log(`Model ${model} returned OK but no image data, trying next...`);
          continue;
        }

        // Read error response once
        const errorText = await generateResponse.text();

        // If 403 or 404, try next model
        if (generateResponse.status === 403 || generateResponse.status === 404) {
          lastError = errorText;
          console.log(`Model ${model} not available (${generateResponse.status}), trying next...`);
          continue;
        }

        // For other errors, log and try next
        console.log(`Model ${model} error (${generateResponse.status}): ${errorText.slice(0, 200)}`);
        lastError = errorText;
        continue;
      }

      // If edit models failed, fall back to generation with enhanced prompt
      console.log("Edit models failed, falling back to generation with context...");

      // Use Gemini to create a context-aware prompt
      const geminiApiKey = process.env.GEMINI_API_KEY;
      if (geminiApiKey) {
        const analysisResponse = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${geminiApiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{
                parts: [
                  { inline_data: { mime_type: "image/png", data: base64Image } },
                  { text: `Describe this image concisely (50 words max). Focus on: main subject, setting, colors, style.` },
                ],
              }],
            }),
          }
        );

        let contextPrompt = args.prompt;
        if (analysisResponse.ok) {
          const analysisData = await analysisResponse.json();
          const description = analysisData.candidates?.[0]?.content?.parts?.[0]?.text || "";
          if (description) {
            contextPrompt = `Transform this scene: ${description.slice(0, 150)}. Apply: ${args.prompt}`;
          }
        }

        // Try generation models as fallback
        const genModelsToTry = [
          "imagegeneration@006",
          "imagen-3.0-fast-generate-001",
          "imagen-3.0-generate-001",
        ];

        for (const model of genModelsToTry) {
          const vertexEndpoint = `https://us-central1-aiplatform.googleapis.com/v1/projects/${projectId}/locations/us-central1/publishers/google/models/${model}:predict`;

          const generateResponse = await fetch(vertexEndpoint, {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              instances: [{ prompt: contextPrompt }],
              parameters: {
                sampleCount: 1,
                aspectRatio: args.aspectRatio || "1:1",
              },
            }),
          });

          if (generateResponse.ok) {
            const generateData = await generateResponse.json();
            if (generateData.predictions?.[0]?.bytesBase64Encoded) {
              return {
                success: true,
                imageBase64: generateData.predictions[0].bytesBase64Encoded,
                mimeType: generateData.predictions[0].mimeType || "image/png",
              };
            }
          }

          if (generateResponse.status !== 403 && generateResponse.status !== 404) {
            const errorText = await generateResponse.text();
            lastError = errorText;
          }
        }
      }

      // All models failed
      console.error("All Imagen models failed. Last error:", lastError);
      return {
        success: false,
        error: "Image generation failed. Please try a different prompt or image."
      };

    } catch (err) {
      console.error("AI image generation error:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error occurred"
      };
    }
  },
});

/**
 * Save an AI-generated image to the image manager.
 * Takes base64 image data and creates an asset.
 */
export const saveAIGeneratedImage = action({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    folderId: v.optional(v.id("image_manager_folders")),
    imageBase64: v.string(),
    mimeType: v.string(),
    name: v.string(),
    prompt: v.string(),
    sourceAssetId: v.optional(v.id("image_manager_assets")),
    assetCategory: v.string(),
    aspectRatio: v.string(),
    width: v.number(),
    height: v.number(),
  },
  handler: async (ctx, args): Promise<{
    success: boolean;
    assetId?: Id<"image_manager_assets">;
    error?: string;
  }> => {
    // Verify user is authenticated
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return { success: false, error: "Not authenticated" };
    }

    try {
      // Convert base64 to blob and upload to storage
      const binaryData = base64ToUint8Array(args.imageBase64);
      const blob = new Blob([binaryData], { type: args.mimeType });

      // Upload to Convex storage
      const storageId = await ctx.storage.store(blob);

      // Create the asset record
      const assetId = await ctx.runMutation(internal.imageManager.createAssetInternal, {
        slug: args.slug,
        projectId: args.projectId,
        folderId: args.folderId,
        name: args.name,
        storageId,
        width: args.width,
        height: args.height,
        aspectRatio: args.aspectRatio,
        fileSize: binaryData.byteLength,
        mimeType: args.mimeType,
        sourceType: "ai_generated",
        sourceId: args.sourceAssetId?.toString(),
        sourceTitle: `AI: ${args.prompt.slice(0, 50)}`,
        assetCategory: args.assetCategory,
      });

      return { success: true, assetId };
    } catch (err) {
      console.error("Failed to save AI generated image:", err);
      return {
        success: false,
        error: err instanceof Error ? err.message : "Failed to save image"
      };
    }
  },
});

/**
 * Internal mutation to create an asset (for use by actions).
 */
export const createAssetInternal = internalMutation({
  args: {
    slug: v.string(),
    projectId: v.id("image_manager_projects"),
    folderId: v.optional(v.id("image_manager_folders")),
    name: v.string(),
    storageId: v.id("_storage"),
    width: v.number(),
    height: v.number(),
    aspectRatio: v.string(),
    fileSize: v.optional(v.number()),
    mimeType: v.optional(v.string()),
    sourceType: v.string(),
    sourceId: v.optional(v.string()),
    sourceTitle: v.optional(v.string()),
    sourceTimestamp: v.optional(v.number()),
    assetCategory: v.string(),
  },
  handler: async (ctx, args) => {
    const owned = await getOwnedProfileBySlug(ctx, args.slug);
    if (!owned) throw new Error("Unauthorized");

    const project = await ctx.db.get(args.projectId);
    if (!project || project.actorProfileId !== owned.profile._id) {
      throw new Error("Project not found");
    }

    // Get the URL for the storage ID
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) throw new Error("Failed to get storage URL");

    return await ctx.db.insert("image_manager_assets", {
      actorProfileId: owned.profile._id,
      projectId: args.projectId,
      folderId: args.folderId,
      name: args.name,
      storageId: args.storageId,
      url,
      width: args.width,
      height: args.height,
      aspectRatio: args.aspectRatio,
      fileSize: args.fileSize,
      mimeType: args.mimeType,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      sourceTitle: args.sourceTitle,
      sourceTimestamp: args.sourceTimestamp,
      assetCategory: args.assetCategory,
      isFavorite: false,
      isPublic: false,
      createdAt: Date.now(),
    });
  },
});
