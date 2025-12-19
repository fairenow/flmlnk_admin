"""
R2 Storage Service

Handles uploading clips and thumbnails to Cloudflare R2.
R2 is S3-compatible, so we use boto3.
"""

import os
import asyncio
import mimetypes
from typing import Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor

import boto3
from botocore.config import Config


# =============================================================================
# CONFIGURATION
# =============================================================================

# These are loaded from environment variables (Modal secrets)
R2_ENDPOINT_URL = os.environ.get("R2_ENDPOINT_URL", "")
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET_NAME = os.environ.get("R2_BUCKET_NAME", "clipper-clips")
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")

# Thread pool for async operations
_executor = ThreadPoolExecutor(max_workers=4)


class R2Storage:
    """
    Service for uploading files to Cloudflare R2.
    """

    def __init__(
        self,
        endpoint_url: Optional[str] = None,
        access_key_id: Optional[str] = None,
        secret_access_key: Optional[str] = None,
        bucket_name: Optional[str] = None,
        public_url: Optional[str] = None,
    ):
        self.endpoint_url = endpoint_url or R2_ENDPOINT_URL
        self.access_key_id = access_key_id or R2_ACCESS_KEY_ID
        self.secret_access_key = secret_access_key or R2_SECRET_ACCESS_KEY
        self.bucket_name = bucket_name or R2_BUCKET_NAME
        self.public_url = public_url or R2_PUBLIC_URL

        self._client = None

    def _get_client(self):
        """Lazy initialization of S3 client."""
        if self._client is None:
            self._client = boto3.client(
                "s3",
                endpoint_url=self.endpoint_url,
                aws_access_key_id=self.access_key_id,
                aws_secret_access_key=self.secret_access_key,
                config=Config(
                    signature_version="s3v4",
                    retries={"max_attempts": 3, "mode": "standard"},
                ),
            )
        return self._client

    async def upload(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """
        Upload a file to R2.

        Args:
            file_path: Local file path
            key: S3 key (path in bucket)
            content_type: MIME type (auto-detected if not provided)
            metadata: Optional metadata to attach

        Returns:
            Dictionary with public_url and key
        """
        loop = asyncio.get_event_loop()

        return await loop.run_in_executor(
            _executor,
            self._upload_sync,
            file_path,
            key,
            content_type,
            metadata,
        )

    def _upload_sync(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str],
        metadata: Optional[Dict[str, str]],
    ) -> Dict[str, Any]:
        """Synchronous upload implementation."""
        client = self._get_client()

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

        # Prepare extra args
        extra_args = {
            "ContentType": content_type,
            "CacheControl": "public, max-age=31536000",  # 1 year cache
        }

        if metadata:
            extra_args["Metadata"] = metadata

        # Upload file
        with open(file_path, "rb") as f:
            client.upload_fileobj(
                f,
                self.bucket_name,
                key,
                ExtraArgs=extra_args,
            )

        # Generate public URL
        public_url = f"{self.public_url.rstrip('/')}/{key}"

        return {
            "key": key,
            "bucket": self.bucket_name,
            "public_url": public_url,
            "content_type": content_type,
            "size": os.path.getsize(file_path),
        }

    async def delete(self, key: str) -> bool:
        """
        Delete a file from R2.

        Args:
            key: S3 key to delete

        Returns:
            True if successful
        """
        loop = asyncio.get_event_loop()

        try:
            await loop.run_in_executor(
                _executor,
                self._delete_sync,
                key,
            )
            return True
        except Exception as e:
            print(f"Failed to delete {key}: {e}")
            return False

    def _delete_sync(self, key: str):
        """Synchronous delete implementation."""
        client = self._get_client()
        client.delete_object(Bucket=self.bucket_name, Key=key)

    async def list_objects(
        self,
        prefix: str = "",
        max_keys: int = 1000,
    ) -> list:
        """
        List objects in R2 with given prefix.

        Args:
            prefix: Key prefix to filter
            max_keys: Maximum number of keys to return

        Returns:
            List of object keys
        """
        loop = asyncio.get_event_loop()

        return await loop.run_in_executor(
            _executor,
            self._list_sync,
            prefix,
            max_keys,
        )

    def _list_sync(self, prefix: str, max_keys: int) -> list:
        """Synchronous list implementation."""
        client = self._get_client()

        response = client.list_objects_v2(
            Bucket=self.bucket_name,
            Prefix=prefix,
            MaxKeys=max_keys,
        )

        objects = []
        for obj in response.get("Contents", []):
            objects.append({
                "key": obj["Key"],
                "size": obj["Size"],
                "last_modified": obj["LastModified"].isoformat(),
            })

        return objects

    async def get_presigned_url(
        self,
        key: str,
        expires_in: int = 3600,
    ) -> str:
        """
        Generate a presigned URL for download.

        Args:
            key: S3 key
            expires_in: URL expiration time in seconds

        Returns:
            Presigned URL string
        """
        loop = asyncio.get_event_loop()

        return await loop.run_in_executor(
            _executor,
            self._presigned_url_sync,
            key,
            expires_in,
        )

    def _presigned_url_sync(self, key: str, expires_in: int) -> str:
        """Synchronous presigned URL generation."""
        client = self._get_client()

        url = client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket_name,
                "Key": key,
            },
            ExpiresIn=expires_in,
        )

        return url

    async def download_file(self, key: str, local_path: str) -> None:
        """
        Download a file from R2 to local path.

        Args:
            key: S3 key (path in bucket)
            local_path: Local file path to save to
        """
        loop = asyncio.get_event_loop()

        await loop.run_in_executor(
            _executor,
            self._download_file_sync,
            key,
            local_path,
        )

    def _download_file_sync(self, key: str, local_path: str) -> None:
        """Synchronous download implementation."""
        client = self._get_client()
        client.download_file(self.bucket_name, key, local_path)

    async def upload_file(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Upload a file to R2 (alias for upload with simpler interface).

        Args:
            file_path: Local file path
            key: S3 key (path in bucket)
            content_type: MIME type (auto-detected if not provided)

        Returns:
            Dictionary with public_url and key
        """
        return await self.upload(file_path, key, content_type)


class LocalStorage:
    """
    Local file storage for testing/development.
    Mimics R2Storage interface.
    """

    def __init__(self, base_dir: str = "/tmp/clips"):
        self.base_dir = base_dir
        os.makedirs(base_dir, exist_ok=True)

    async def upload(
        self,
        file_path: str,
        key: str,
        content_type: Optional[str] = None,
        metadata: Optional[Dict[str, str]] = None,
    ) -> Dict[str, Any]:
        """Copy file to local storage."""
        import shutil

        dest_path = os.path.join(self.base_dir, key)
        os.makedirs(os.path.dirname(dest_path), exist_ok=True)

        shutil.copy2(file_path, dest_path)

        return {
            "key": key,
            "public_url": f"file://{dest_path}",
            "content_type": content_type,
            "size": os.path.getsize(dest_path),
        }

    async def delete(self, key: str) -> bool:
        """Delete local file."""
        try:
            path = os.path.join(self.base_dir, key)
            if os.path.exists(path):
                os.remove(path)
            return True
        except Exception:
            return False


def get_storage(use_local: bool = False) -> R2Storage | LocalStorage:
    """Get appropriate storage backend."""
    if use_local or not R2_ENDPOINT_URL:
        return LocalStorage()
    return R2Storage()
