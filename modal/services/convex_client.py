"""
Convex Client - API client for Convex actions

Provides a client for Modal workers to call Convex HTTP actions
for job claiming, progress updates, and completion.

Uses the Convex HTTP API (/api/action) to call public actions
that wrap internal mutations with webhook secret verification.
"""

import os
import httpx
from typing import Optional, Dict, Any, List


class ConvexClient:
    """
    Client for calling Convex actions from Modal.

    Uses the Convex HTTP API to call actions for:
    - Claiming jobs for processing
    - Completing/failing jobs
    - Saving clip timestamps
    """

    def __init__(self):
        """
        Initialize Convex client.

        Environment variables required:
        - CONVEX_URL: Convex deployment URL (e.g., https://marvelous-bat-438.convex.cloud)
        - MODAL_WEBHOOK_SECRET: Shared secret for authentication
        """
        self.convex_url = os.environ.get("CONVEX_URL")
        self.webhook_secret = os.environ.get("MODAL_WEBHOOK_SECRET")

        if not self.convex_url:
            raise RuntimeError("CONVEX_URL not configured")

        # HTTP client with longer timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=60.0)
        return self._client

    async def _call_action(
        self,
        path: str,
        args: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Call a Convex action via HTTP.

        Args:
            path: The action path (e.g., "processing:httpClaimJob")
            args: The action arguments

        Returns:
            The action result
        """
        client = await self._get_client()

        # Convex HTTP API endpoint for actions
        url = f"{self.convex_url}/api/action"

        headers = {
            "Content-Type": "application/json",
        }

        # Include webhook secret in args for verification
        if self.webhook_secret:
            args["webhookSecret"] = self.webhook_secret

        body = {
            "path": path,
            "args": args,
        }

        try:
            response = await client.post(url, json=body, headers=headers)

            if response.status_code != 200:
                error_text = response.text
                raise RuntimeError(
                    f"Convex action failed: {response.status_code} - {error_text}"
                )

            result = response.json()

            # Check for Convex error response format
            # When an action throws, Convex returns {"status": "error", "errorMessage": "..."}
            if result.get("status") == "error":
                error_message = result.get("errorMessage", "Unknown Convex error")
                # Return a standardized error format that processors expect
                return {
                    "success": False,
                    "reason": f"Convex error: {error_message}",
                }

            return result.get("value", result)

        except httpx.RequestError as e:
            raise RuntimeError(f"Network error calling Convex: {e}")

    async def claim_job(
        self,
        job_id: str,
        lock_id: str,
    ) -> Dict[str, Any]:
        """
        Claim a job for processing.

        Implements idempotent locking to prevent duplicate processing.

        Args:
            job_id: The Convex job ID
            lock_id: Unique lock ID for this worker

        Returns:
            {
                "claimed": bool,
                "reason": str (if not claimed),
                "r2SourceKey": str (if claimed),
                "userId": str,
                "actorProfileId": str | None,
                "clipCount": int | None,
                "layout": str | None,
                "captionStyle": dict | None,
            }
        """
        return await self._call_action(
            "processing:httpClaimJob",
            {"jobId": job_id, "lockId": lock_id},
        )

    async def complete_processing(
        self,
        job_id: str,
        lock_id: str,
        clips: List[Dict[str, Any]],
        video_duration: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Mark processing as complete and save clips.

        Args:
            job_id: The Convex job ID
            lock_id: The lock ID used when claiming
            clips: List of clip data to save (must have index, r2Key, startTime, endTime, duration)
            video_duration: Video duration in seconds

        Returns:
            {"success": bool, "reason": str | None, "clipCount": int}
        """
        return await self._call_action(
            "processing:httpCompleteProcessing",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "clips": clips,
                "videoDuration": video_duration,
            },
        )

    async def fail_processing(
        self,
        job_id: str,
        lock_id: str,
        error: str,
        error_stage: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mark processing as failed.

        Args:
            job_id: The Convex job ID
            lock_id: The lock ID used when claiming
            error: Error message
            error_stage: Stage where error occurred

        Returns:
            {"success": bool, "reason": str | None}
        """
        return await self._call_action(
            "processing:httpFailProcessing",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "error": error,
                "errorStage": error_stage,
            },
        )

    async def save_clip_timestamps(
        self,
        job_id: str,
        timestamps: List[Dict[str, Any]],
        source: str,
    ) -> None:
        """
        Save clip timestamps to Convex.

        Args:
            job_id: The Convex job ID
            timestamps: List of timestamp objects with start, end, reason, etc.
            source: Source of timestamps ("equal_segments", "scene_detection", "ai_analysis")
        """
        await self._call_action(
            "processing:httpSaveClipTimestamps",
            {
                "jobId": job_id,
                "timestamps": timestamps,
                "source": source,
            },
        )

    async def update_progress(
        self,
        job_id: str,
        lock_id: str,
        progress: int,
        current_step: Optional[str] = None,
    ) -> None:
        """
        Update job progress.

        Args:
            job_id: The Convex job ID
            lock_id: The lock ID used when claiming
            progress: Progress percentage (0-100)
            current_step: Current processing step description
        """
        await self._call_action(
            "processing:httpUpdateProgress",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "progress": progress,
                "currentStep": current_step,
            },
        )

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    # =========================================================================
    # MEME GENERATION METHODS (R2-based)
    # =========================================================================

    async def claim_meme_job(
        self,
        job_id: str,
        lock_id: str,
    ) -> Dict[str, Any]:
        """
        Claim a meme job for processing.

        Args:
            job_id: The Convex meme job ID
            lock_id: Unique lock ID for this worker

        Returns:
            {
                "claimed": bool,
                "reason": str (if not claimed),
                "r2SourceKey": str (if claimed),
                "userId": str,
                "actorProfileId": str | None,
                "memeCount": int,
                "targetTemplates": list | None,
                "movieMetadata": dict | None,
                "videoTitle": str | None,
            }
        """
        return await self._call_action(
            "memeGenerator:httpClaimMemeJob",
            {"jobId": job_id, "lockId": lock_id},
        )

    async def update_meme_progress(
        self,
        job_id: str,
        lock_id: str,
        progress: int,
        status: str,
        current_step: Optional[str] = None,
    ) -> None:
        """
        Update meme job progress.

        Args:
            job_id: The Convex meme job ID
            lock_id: The lock ID used when claiming
            progress: Progress percentage (0-100)
            status: Status string
            current_step: Current processing step description
        """
        await self._call_action(
            "memeGenerator:httpUpdateMemeProgress",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "progress": progress,
                "status": status,
                "currentStep": current_step,
            },
        )

    async def complete_meme_processing(
        self,
        job_id: str,
        lock_id: str,
        memes: List[Dict[str, Any]],
        candidate_frames: List[Dict[str, Any]],
        video_title: Optional[str] = None,
        video_duration: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Mark meme processing as complete and save memes.

        Args:
            job_id: The Convex meme job ID
            lock_id: The lock ID used when claiming
            memes: List of meme data to save
            candidate_frames: List of analyzed frames
            video_title: Video title
            video_duration: Video duration in seconds

        Returns:
            {"success": bool, "reason": str | None, "memeCount": int}
        """
        # Build args dict, omitting None values to avoid Convex validation errors
        # (Convex v.optional() accepts undefined but not null)
        args: Dict[str, Any] = {
            "jobId": job_id,
            "lockId": lock_id,
            "memes": memes,
            "candidateFrames": candidate_frames,
        }
        if video_title is not None:
            args["videoTitle"] = video_title
        if video_duration is not None:
            args["videoDuration"] = video_duration

        return await self._call_action(
            "memeGenerator:httpCompleteMemeProcessing",
            args,
        )

    async def fail_meme_processing(
        self,
        job_id: str,
        lock_id: str,
        error: str,
        error_stage: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mark meme processing as failed.

        Args:
            job_id: The Convex meme job ID
            lock_id: The lock ID used when claiming
            error: Error message
            error_stage: Stage where error occurred

        Returns:
            {"success": bool, "reason": str | None}
        """
        return await self._call_action(
            "memeGenerator:httpFailMemeProcessing",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "error": error,
                "errorStage": error_stage,
            },
        )

    # =========================================================================
    # GIF GENERATION METHODS (R2-based)
    # =========================================================================

    async def claim_gif_job(
        self,
        job_id: str,
        lock_id: str,
    ) -> Dict[str, Any]:
        """
        Claim a GIF job for processing.

        Args:
            job_id: The Convex GIF job ID
            lock_id: Unique lock ID for this worker

        Returns:
            {
                "claimed": bool,
                "reason": str (if not claimed),
                "r2SourceKey": str (if claimed),
                "userId": str,
                "actorProfileId": str | None,
                "gifCount": int,
                "maxDuration": float,
                "targetWidth": int,
                "frameRate": int,
                "overlayStyle": str,
                "movieMetadata": dict | None,
                "videoTitle": str | None,
            }
        """
        return await self._call_action(
            "gifGenerator:httpClaimGifJob",
            {"jobId": job_id, "lockId": lock_id},
        )

    async def update_gif_progress(
        self,
        job_id: str,
        lock_id: str,
        progress: int,
        status: str,
        current_step: Optional[str] = None,
    ) -> None:
        """
        Update GIF job progress.

        Args:
            job_id: The Convex GIF job ID
            lock_id: The lock ID used when claiming
            progress: Progress percentage (0-100)
            status: Status string
            current_step: Current processing step description
        """
        await self._call_action(
            "gifGenerator:httpUpdateGifProgress",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "progress": progress,
                "status": status,
                "currentStep": current_step,
            },
        )

    async def complete_gif_processing(
        self,
        job_id: str,
        lock_id: str,
        gifs: List[Dict[str, Any]],
        moments: List[Dict[str, Any]],
        video_title: Optional[str] = None,
        video_duration: Optional[float] = None,
    ) -> Dict[str, Any]:
        """
        Mark GIF processing as complete and save GIFs.

        Args:
            job_id: The Convex GIF job ID
            lock_id: The lock ID used when claiming
            gifs: List of GIF data to save
            moments: List of detected viral moments (candidateMoments)
            video_title: Video title
            video_duration: Video duration in seconds

        Returns:
            {"success": bool, "reason": str | None, "gifCount": int}
        """
        # Build args dict, omitting None values to avoid Convex validation errors
        # (Convex v.optional() accepts undefined but not null)
        args: Dict[str, Any] = {
            "jobId": job_id,
            "lockId": lock_id,
            "gifs": gifs,
            "candidateMoments": moments,  # Convex expects candidateMoments
        }
        if video_title is not None:
            args["videoTitle"] = video_title
        if video_duration is not None:
            args["videoDuration"] = video_duration

        return await self._call_action(
            "gifGenerator:httpCompleteGifProcessing",
            args,
        )

    async def fail_gif_processing(
        self,
        job_id: str,
        lock_id: str,
        error: str,
        error_stage: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Mark GIF processing as failed.

        Args:
            job_id: The Convex GIF job ID
            lock_id: The lock ID used when claiming
            error: Error message
            error_stage: Stage where error occurred

        Returns:
            {"success": bool, "reason": str | None}
        """
        return await self._call_action(
            "gifGenerator:httpFailGifProcessing",
            {
                "jobId": job_id,
                "lockId": lock_id,
                "error": error,
                "errorStage": error_stage,
            },
        )
