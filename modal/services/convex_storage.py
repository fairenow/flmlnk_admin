"""
Convex Storage Service

Handles uploading clips and thumbnails directly to Convex storage.
Replaces R2 storage - all files are stored in Convex's built-in storage.
"""

import os
import httpx
from typing import Dict, Any, Optional
from pydantic import BaseModel


# =============================================================================
# CONFIGURATION
# =============================================================================

# Convex deployment URL (from environment)
CONVEX_URL = os.environ.get("CONVEX_URL", "")
MODAL_WEBHOOK_SECRET = os.environ.get("MODAL_WEBHOOK_SECRET", "")


# =============================================================================
# PYDANTIC MODELS
# =============================================================================

class ClipMetadata(BaseModel):
    """Metadata for a clip (without storage URLs)."""
    externalClipId: str
    title: str
    description: str
    transcript: str
    duration: float
    startTime: float
    endTime: float
    score: float
    videoTitle: Optional[str] = None
    hasFaces: Optional[bool] = None
    facePositions: Optional[list] = None
    layout: Optional[str] = None
    captionStyle: Optional[str] = None
    viralAnalysis: Optional[Dict[str, Any]] = None


class UploadResult(BaseModel):
    """Result of uploading a file to Convex storage."""
    storageId: str
    url: str


# =============================================================================
# CONVEX STORAGE CLIENT
# =============================================================================

class ConvexStorage:
    """
    Service for uploading files directly to Convex storage.

    Flow:
    1. Request upload URL from Convex
    2. POST file directly to that URL
    3. Receive storage ID back
    4. Use storage ID to update clip records
    """

    def __init__(
        self,
        convex_url: Optional[str] = None,
        webhook_secret: Optional[str] = None,
    ):
        self.convex_url = convex_url or CONVEX_URL
        self.webhook_secret = webhook_secret or MODAL_WEBHOOK_SECRET

        if not self.convex_url:
            raise ValueError(
                "CONVEX_URL environment variable not set. "
                "Please configure the 'convex-webhooks' secret in Modal dashboard with:\n"
                "  - CONVEX_URL: Your Convex deployment URL (e.g., https://xxx.convex.cloud)\n"
                "  - MODAL_WEBHOOK_SECRET: Secret for authenticating webhook requests"
            )

        # Build base URL for HTTP endpoints
        # Convex URL format: https://xxx.convex.cloud
        # HTTP endpoints: https://xxx.convex.site
        self.http_base = self.convex_url.replace(".convex.cloud", ".convex.site")

        self._client: Optional[httpx.AsyncClient] = None

    def _get_headers(self) -> Dict[str, str]:
        """Get headers for Convex HTTP requests."""
        headers = {"Content-Type": "application/json"}
        if self.webhook_secret:
            headers["Authorization"] = f"Bearer {self.webhook_secret}"
        return headers

    async def _get_client(self) -> httpx.AsyncClient:
        """Get or create async HTTP client."""
        if self._client is None:
            self._client = httpx.AsyncClient(timeout=300.0)  # 5 min timeout for uploads
        return self._client

    async def close(self):
        """Close the HTTP client."""
        if self._client:
            await self._client.aclose()
            self._client = None

    async def get_upload_url(self) -> str:
        """
        Request an upload URL from Convex.

        Returns:
            Upload URL that accepts POST requests with file content
        """
        client = await self._get_client()

        response = await client.post(
            f"{self.http_base}/modal/upload-url",
            headers=self._get_headers(),
        )
        response.raise_for_status()

        data = response.json()
        return data["uploadUrl"]

    async def upload_file(
        self,
        file_path: str,
        content_type: Optional[str] = None,
    ) -> UploadResult:
        """
        Upload a file to Convex storage.

        Args:
            file_path: Local path to file
            content_type: MIME type (auto-detected if not provided)

        Returns:
            UploadResult with storageId and url
        """
        import mimetypes

        # Auto-detect content type
        if content_type is None:
            content_type, _ = mimetypes.guess_type(file_path)
            if content_type is None:
                if file_path.endswith(".mp4"):
                    content_type = "video/mp4"
                elif file_path.endswith(".jpg") or file_path.endswith(".jpeg"):
                    content_type = "image/jpeg"
                elif file_path.endswith(".png"):
                    content_type = "image/png"
                else:
                    content_type = "application/octet-stream"

        # Get upload URL
        upload_url = await self.get_upload_url()

        # Upload file directly to Convex storage
        client = await self._get_client()

        with open(file_path, "rb") as f:
            file_content = f.read()

        response = await client.post(
            upload_url,
            content=file_content,
            headers={"Content-Type": content_type},
        )
        response.raise_for_status()

        # Response contains the storage ID
        data = response.json()
        storage_id = data["storageId"]

        # Get the public URL for this storage ID
        url = await self.get_file_url(storage_id)

        return UploadResult(storageId=storage_id, url=url or "")

    async def get_file_url(self, storage_id: str) -> Optional[str]:
        """
        Get the public URL for a storage ID.

        Args:
            storage_id: Convex storage ID

        Returns:
            Public URL or None
        """
        client = await self._get_client()

        response = await client.post(
            f"{self.http_base}/modal/file-url",
            headers=self._get_headers(),
            json={"storageId": storage_id},
        )
        response.raise_for_status()

        data = response.json()
        return data.get("url")

    async def create_pending_clip(
        self,
        external_job_id: str,
        clip: ClipMetadata,
    ) -> str:
        """
        Create a pending clip record in Convex before uploading.

        Args:
            external_job_id: The job ID from Modal
            clip: Clip metadata

        Returns:
            Clip ID for subsequent operations
        """
        client = await self._get_client()

        response = await client.post(
            f"{self.http_base}/modal/create-clip",
            headers=self._get_headers(),
            json={
                "externalJobId": external_job_id,
                "clip": clip.model_dump(exclude_none=True),
            },
        )
        response.raise_for_status()

        data = response.json()
        return data["clipId"]

    async def confirm_clip_upload(
        self,
        clip_id: str,
        storage_id: str,
        thumbnail_storage_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Confirm clip upload by providing storage IDs.

        Args:
            clip_id: The clip record ID
            storage_id: Storage ID of the video file
            thumbnail_storage_id: Optional storage ID of thumbnail

        Returns:
            Dict with url and thumbnailUrl
        """
        client = await self._get_client()

        payload: Dict[str, Any] = {
            "clipId": clip_id,
            "storageId": storage_id,
        }
        if thumbnail_storage_id:
            payload["thumbnailStorageId"] = thumbnail_storage_id

        response = await client.post(
            f"{self.http_base}/modal/confirm-clip",
            headers=self._get_headers(),
            json=payload,
        )
        response.raise_for_status()

        return response.json()

    async def mark_clip_failed(self, clip_id: str, error: str) -> None:
        """
        Mark a clip upload as failed.

        Args:
            clip_id: The clip record ID
            error: Error message
        """
        client = await self._get_client()

        response = await client.post(
            f"{self.http_base}/modal/clip-failed",
            headers=self._get_headers(),
            json={"clipId": clip_id, "error": error},
        )
        response.raise_for_status()

    async def upload_clip(
        self,
        external_job_id: str,
        clip_path: str,
        thumbnail_path: Optional[str],
        metadata: ClipMetadata,
    ) -> Dict[str, Any]:
        """
        Full clip upload workflow:
        1. Create pending clip record
        2. Upload video file
        3. Upload thumbnail (if provided)
        4. Confirm upload with storage IDs

        Args:
            external_job_id: The job ID
            clip_path: Path to video file
            thumbnail_path: Optional path to thumbnail
            metadata: Clip metadata

        Returns:
            Dict with clipId, url, thumbnailUrl
        """
        clip_id = None
        try:
            # Step 1: Create pending clip record
            clip_id = await self.create_pending_clip(external_job_id, metadata)
            print(f"Created pending clip: {clip_id}")

            # Step 2: Upload video file
            video_result = await self.upload_file(clip_path, "video/mp4")
            print(f"Uploaded video: {video_result.storageId}")

            # Step 3: Upload thumbnail (if provided)
            thumbnail_storage_id = None
            if thumbnail_path and os.path.exists(thumbnail_path):
                thumbnail_result = await self.upload_file(thumbnail_path, "image/jpeg")
                thumbnail_storage_id = thumbnail_result.storageId
                print(f"Uploaded thumbnail: {thumbnail_storage_id}")

            # Step 4: Confirm upload
            result = await self.confirm_clip_upload(
                clip_id=clip_id,
                storage_id=video_result.storageId,
                thumbnail_storage_id=thumbnail_storage_id,
            )

            return {
                "clipId": clip_id,
                "storageId": video_result.storageId,
                "url": result.get("url"),
                "thumbnailStorageId": thumbnail_storage_id,
                "thumbnailUrl": result.get("thumbnailUrl"),
            }

        except Exception as e:
            if clip_id:
                try:
                    await self.mark_clip_failed(clip_id, str(e))
                except Exception:
                    pass  # Best effort to mark as failed
            raise


# =============================================================================
# FACTORY FUNCTION
# =============================================================================

def get_storage() -> ConvexStorage:
    """Get the Convex storage client."""
    return ConvexStorage()
