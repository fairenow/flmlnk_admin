"use client";

import { useCallback, useRef } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";

type ClipType = "generated" | "youtube" | "processing";

/**
 * Hook for automatically capturing and uploading 9:16 thumbnails from video clips.
 * Captures the first frame of the video and saves it as a custom thumbnail.
 */
export function useAutoThumbnail() {
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const saveCustomThumbnail = useMutation(api.storage.saveCustomThumbnail);
  const saveClipCustomThumbnail = useMutation(api.storage.saveClipCustomThumbnail);
  const saveProcessingClipCustomThumbnail = useMutation(api.storage.saveProcessingClipCustomThumbnail);

  // Track clips that are currently being processed to avoid duplicates
  const processingClips = useRef<Set<string>>(new Set());

  /**
   * Capture a 9:16 thumbnail from the first frame of a video
   */
  const captureFirstFrame = useCallback(
    async (
      videoUrl: string,
      clipId: Id<"generated_clips"> | Id<"clips"> | Id<"processing_clips">,
      clipType: ClipType
    ): Promise<string | null> => {
      const clipKey = `${clipType}-${clipId}`;

      // Skip if already processing this clip
      if (processingClips.current.has(clipKey)) {
        return null;
      }

      processingClips.current.add(clipKey);

      return new Promise((resolve) => {
        const video = document.createElement("video");
        const canvas = document.createElement("canvas");

        video.crossOrigin = "anonymous";
        video.preload = "metadata";
        video.muted = true;
        video.playsInline = true;

        const cleanup = () => {
          video.remove();
          canvas.remove();
          processingClips.current.delete(clipKey);
        };

        video.onloadeddata = async () => {
          try {
            // Seek to a small offset (0.1s) to ensure we get a good frame
            video.currentTime = 0.1;
          } catch {
            cleanup();
            resolve(null);
          }
        };

        video.onseeked = async () => {
          try {
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              cleanup();
              resolve(null);
              return;
            }

            // Target dimensions for 9:16 aspect ratio (1080x1920 for high quality)
            const targetWidth = 1080;
            const targetHeight = 1920;
            canvas.width = targetWidth;
            canvas.height = targetHeight;

            // Calculate source dimensions to maintain 9:16 crop from center
            const videoWidth = video.videoWidth;
            const videoHeight = video.videoHeight;

            // Calculate the crop area from the video
            const targetAspect = 9 / 16;
            const videoAspect = videoWidth / videoHeight;

            let sourceX = 0;
            let sourceY = 0;
            let sourceWidth = videoWidth;
            let sourceHeight = videoHeight;

            if (videoAspect > targetAspect) {
              // Video is wider than target - crop horizontally (center crop)
              sourceWidth = videoHeight * targetAspect;
              sourceX = (videoWidth - sourceWidth) / 2;
            } else {
              // Video is taller than target - crop vertically (center crop)
              sourceHeight = videoWidth / targetAspect;
              sourceY = (videoHeight - sourceHeight) / 2;
            }

            // Draw the cropped frame to canvas
            ctx.drawImage(
              video,
              sourceX, sourceY, sourceWidth, sourceHeight,
              0, 0, targetWidth, targetHeight
            );

            // Convert to blob
            canvas.toBlob(
              async (blob) => {
                if (!blob) {
                  cleanup();
                  resolve(null);
                  return;
                }

                try {
                  // Get upload URL from Convex
                  const uploadUrl = await generateUploadUrl();

                  // Upload to Convex storage
                  const uploadResponse = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": blob.type },
                    body: blob,
                  });

                  if (!uploadResponse.ok) {
                    cleanup();
                    resolve(null);
                    return;
                  }

                  const { storageId } = await uploadResponse.json();

                  // Save to appropriate table based on clip type
                  let thumbnailUrl: string | null = null;
                  if (clipType === "generated") {
                    thumbnailUrl = await saveCustomThumbnail({
                      clipId: clipId as Id<"generated_clips">,
                      storageId,
                      timestamp: 0.1,
                    });
                  } else if (clipType === "processing") {
                    thumbnailUrl = await saveProcessingClipCustomThumbnail({
                      clipId: clipId as Id<"processing_clips">,
                      storageId,
                      timestamp: 0.1,
                    });
                  } else {
                    thumbnailUrl = await saveClipCustomThumbnail({
                      clipId: clipId as Id<"clips">,
                      storageId,
                      timestamp: 0.1,
                    });
                  }

                  cleanup();
                  resolve(thumbnailUrl);
                } catch (err) {
                  console.error("Error saving auto-thumbnail:", err);
                  cleanup();
                  resolve(null);
                }
              },
              "image/jpeg",
              0.9
            );
          } catch (err) {
            console.error("Error capturing frame:", err);
            cleanup();
            resolve(null);
          }
        };

        video.onerror = () => {
          console.error("Error loading video for auto-thumbnail");
          cleanup();
          resolve(null);
        };

        // Set a timeout to avoid hanging
        setTimeout(() => {
          if (processingClips.current.has(clipKey)) {
            cleanup();
            resolve(null);
          }
        }, 30000); // 30 second timeout

        video.src = videoUrl;
        video.load();
      });
    },
    [generateUploadUrl, saveCustomThumbnail, saveClipCustomThumbnail, saveProcessingClipCustomThumbnail]
  );

  return { captureFirstFrame };
}
