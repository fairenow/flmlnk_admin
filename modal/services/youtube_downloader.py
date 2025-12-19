"""
YouTube Downloader Service

Downloads videos from YouTube and other supported platforms using yt-dlp.
Extracts audio for transcription.

RECOMMENDED: Use a residential proxy (YOUTUBE_PROXY) for reliable YouTube downloads.
Modal's datacenter IPs are frequently blocked by YouTube, and a residential proxy
is the most effective solution.

Set YOUTUBE_PROXY env var to route traffic through a residential proxy:
  Format: http://user:pass@proxy.host.com:port
  Recommended providers: Bright Data, Smartproxy, IPRoyal, Oxylabs

For Oxylabs proxies, the system automatically adds session management:
  - Session IDs ensure the same IP is used throughout a download
  - Geo-rotation tries different countries when one fails
  - Session rotation gets a fresh IP when bot detection occurs

When YOUTUBE_PROXY is configured, the downloader uses a simplified approach
that relies on the proxy to make requests appear as regular residential traffic.
No cookies or PO tokens are needed in this mode.

Fallback authentication methods (only used when NO proxy is configured):
- Cookie file: Set YOUTUBE_COOKIES_FILE env var to path of cookies.txt
- Cookie content: Set YOUTUBE_COOKIES env var to Netscape cookie format content
- PO Token: Set YOUTUBE_PO_TOKEN env var (proof of origin token)
- Visitor Data: Set YOUTUBE_VISITOR_DATA env var

See: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
"""

import os
import asyncio
import subprocess
import json
import tempfile
import random
import time
import re
from typing import Dict, Any, Optional, List, Tuple
from urllib.parse import urlparse, urlunparse


class ProxyManager:
    """
    Manages proxy configuration with session rotation and geo-targeting.

    Supports Oxylabs, Bright Data, Smartproxy, and IPRoyal proxy formats.
    Automatically adds session IDs for sticky sessions and rotates countries
    when bot detection occurs.
    """

    # Countries to try in order of YouTube friendliness
    # These countries have less aggressive bot detection
    GEO_ROTATION_ORDER = [
        "DE",  # Germany - good YouTube support
        "GB",  # UK - good YouTube support
        "FR",  # France - good YouTube support
        "NL",  # Netherlands - less restrictive
        "CA",  # Canada - close to US, less restricted
        "AU",  # Australia - good YouTube support
        "JP",  # Japan - different detection algorithms
        "BR",  # Brazil - large YouTube market
        "US",  # US - try last as most restricted
    ]

    def __init__(self, proxy_url: Optional[str]):
        """Initialize proxy manager with the base proxy URL."""
        self.base_proxy = proxy_url.strip().strip('"').strip("'") if proxy_url else None
        self.proxy_type = self._detect_proxy_type()
        self.current_session_id = None
        self.current_country_idx = 0
        self.session_counter = 0

        if self.base_proxy:
            proxy_host = self.base_proxy.split('@')[-1] if '@' in self.base_proxy else self.base_proxy
            print(f"=== PROXY MANAGER INITIALIZED ===")
            print(f"Proxy host: {proxy_host}")
            print(f"Proxy type: {self.proxy_type}")
            print(f"Geo-rotation enabled: {len(self.GEO_ROTATION_ORDER)} countries")
            print("=================================")

    def _detect_proxy_type(self) -> str:
        """Detect proxy provider type from URL."""
        if not self.base_proxy:
            return "none"

        proxy_lower = self.base_proxy.lower()
        if "oxylabs.io" in proxy_lower:
            return "oxylabs"
        elif "brightdata" in proxy_lower or "zproxy.lum" in proxy_lower:
            return "brightdata"
        elif "smartproxy" in proxy_lower:
            return "smartproxy"
        elif "iproyal" in proxy_lower:
            return "iproyal"
        else:
            return "generic"

    def _generate_session_id(self) -> str:
        """Generate a unique session ID for sticky sessions."""
        self.session_counter += 1
        timestamp = int(time.time())
        random_part = random.randint(10000, 99999)
        return f"yt{timestamp}{random_part}{self.session_counter}"

    def get_proxy_with_session(self, country: Optional[str] = None, new_session: bool = False) -> Optional[str]:
        """
        Get a proxy URL with session ID and optional country targeting.

        Args:
            country: ISO country code (e.g., "US", "DE", "GB")
            new_session: Force a new session ID (new IP)

        Returns:
            Modified proxy URL with session/country parameters
        """
        if not self.base_proxy:
            return None

        if new_session or not self.current_session_id:
            self.current_session_id = self._generate_session_id()
            print(f"New proxy session: {self.current_session_id}")

        # Parse the proxy URL
        # Format: http://user:pass@host:port or http://user-options:pass@host:port

        if self.proxy_type == "oxylabs":
            return self._get_oxylabs_proxy(country)
        elif self.proxy_type == "brightdata":
            return self._get_brightdata_proxy(country)
        elif self.proxy_type == "smartproxy":
            return self._get_smartproxy_proxy(country)
        elif self.proxy_type == "iproyal":
            return self._get_iproyal_proxy(country)
        else:
            # Generic proxy - return as-is
            return self.base_proxy

    def _get_oxylabs_proxy(self, country: Optional[str] = None) -> str:
        """
        Build Oxylabs proxy URL with session and country.

        Oxylabs format: customer-USERNAME-cc-COUNTRY-sessid-SESSION:PASSWORD@pr.oxylabs.io:7777
        """
        parsed = urlparse(self.base_proxy)

        # Extract username and password
        if '@' in self.base_proxy:
            auth_part = self.base_proxy.split('@')[0].replace('http://', '').replace('https://', '')
            if ':' in auth_part:
                username, password = auth_part.rsplit(':', 1)
            else:
                username = auth_part
                password = ""
        else:
            return self.base_proxy  # Can't modify without auth

        # Parse existing username options (customer-USER-cc-XX-sessid-YY)
        # Remove existing country and session options
        base_username = username
        if '-cc-' in username:
            base_username = re.sub(r'-cc-[A-Z]{2}', '', base_username)
        if '-sessid-' in username:
            base_username = re.sub(r'-sessid-\w+', '', base_username)
        if '-sesstime-' in username:
            base_username = re.sub(r'-sesstime-\d+', '', base_username)

        # Build new username with session and country
        new_username = base_username
        if country:
            new_username += f"-cc-{country}"
        new_username += f"-sessid-{self.current_session_id}"
        new_username += "-sesstime-30"  # 30 minute session time

        # Rebuild proxy URL
        host_port = parsed.netloc.split('@')[-1] if '@' in parsed.netloc else parsed.netloc
        new_url = f"{parsed.scheme}://{new_username}:{password}@{host_port}"

        return new_url

    def _get_brightdata_proxy(self, country: Optional[str] = None) -> str:
        """
        Build Bright Data proxy URL with session and country.

        Bright Data format: username-country-XX-session-YY:password@host:port
        """
        parsed = urlparse(self.base_proxy)

        if '@' in self.base_proxy:
            auth_part = self.base_proxy.split('@')[0].replace('http://', '').replace('https://', '')
            if ':' in auth_part:
                username, password = auth_part.rsplit(':', 1)
            else:
                username = auth_part
                password = ""
        else:
            return self.base_proxy

        # Remove existing options
        base_username = username
        base_username = re.sub(r'-country-[a-z]{2}', '', base_username, flags=re.IGNORECASE)
        base_username = re.sub(r'-session-\w+', '', base_username)

        # Build new username
        new_username = base_username
        if country:
            new_username += f"-country-{country.lower()}"
        new_username += f"-session-{self.current_session_id}"

        host_port = parsed.netloc.split('@')[-1] if '@' in parsed.netloc else parsed.netloc
        return f"{parsed.scheme}://{new_username}:{password}@{host_port}"

    def _get_smartproxy_proxy(self, country: Optional[str] = None) -> str:
        """
        Build Smartproxy URL with session and country.

        Smartproxy format: user-cc-XX-sessid-YY:pass@gate.smartproxy.com:port
        """
        parsed = urlparse(self.base_proxy)

        if '@' in self.base_proxy:
            auth_part = self.base_proxy.split('@')[0].replace('http://', '').replace('https://', '')
            if ':' in auth_part:
                username, password = auth_part.rsplit(':', 1)
            else:
                username = auth_part
                password = ""
        else:
            return self.base_proxy

        # Remove existing options
        base_username = username
        base_username = re.sub(r'-cc-[a-z]{2}', '', base_username, flags=re.IGNORECASE)
        base_username = re.sub(r'-sessid-\w+', '', base_username)

        # Build new username
        new_username = base_username
        if country:
            new_username += f"-cc-{country.lower()}"
        new_username += f"-sessid-{self.current_session_id}"

        host_port = parsed.netloc.split('@')[-1] if '@' in parsed.netloc else parsed.netloc
        return f"{parsed.scheme}://{new_username}:{password}@{host_port}"

    def _get_iproyal_proxy(self, country: Optional[str] = None) -> str:
        """
        Build IPRoyal proxy URL with session and country.

        IPRoyal format: username_country-XX_session-YY:pass@host:port
        """
        parsed = urlparse(self.base_proxy)

        if '@' in self.base_proxy:
            auth_part = self.base_proxy.split('@')[0].replace('http://', '').replace('https://', '')
            if ':' in auth_part:
                username, password = auth_part.rsplit(':', 1)
            else:
                username = auth_part
                password = ""
        else:
            return self.base_proxy

        # Remove existing options (IPRoyal uses underscore)
        base_username = username
        base_username = re.sub(r'_country-[a-z]{2}', '', base_username, flags=re.IGNORECASE)
        base_username = re.sub(r'_session-\w+', '', base_username)

        # Build new username
        new_username = base_username
        if country:
            new_username += f"_country-{country.lower()}"
        new_username += f"_session-{self.current_session_id}"

        host_port = parsed.netloc.split('@')[-1] if '@' in parsed.netloc else parsed.netloc
        return f"{parsed.scheme}://{new_username}:{password}@{host_port}"

    def get_next_country(self) -> Optional[str]:
        """Get the next country in the rotation order."""
        if self.current_country_idx >= len(self.GEO_ROTATION_ORDER):
            return None  # All countries exhausted

        country = self.GEO_ROTATION_ORDER[self.current_country_idx]
        self.current_country_idx += 1
        return country

    def reset_rotation(self):
        """Reset country rotation to start."""
        self.current_country_idx = 0

    def rotate_session(self):
        """Force a new session (new IP)."""
        self.current_session_id = self._generate_session_id()
        print(f"Rotated to new session: {self.current_session_id}")

    async def test_proxy(self, proxy_url: str) -> Tuple[bool, str]:
        """
        Test if a proxy connection works.

        Returns:
            Tuple of (success, message)
        """
        try:
            # Use yt-dlp to test the proxy with a simple request
            cmd = [
                "yt-dlp",
                "--proxy", proxy_url,
                "--dump-json",
                "--no-download",
                "--no-playlist",
                "--no-warnings",
                # Use a known working video for testing
                "https://www.youtube.com/watch?v=jNQXAC9IVRw",  # "Me at the zoo" - first YouTube video
            ]

            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )

            stdout, stderr = await process.communicate()

            if process.returncode == 0:
                return True, "Proxy connection successful"
            else:
                error_msg = stderr.decode() if stderr else "Unknown error"
                return False, f"Proxy test failed: {error_msg[:200]}"

        except asyncio.TimeoutError:
            return False, "Proxy test timed out"
        except Exception as e:
            return False, f"Proxy test error: {str(e)}"


class YouTubeDownloader:
    """
    Service for downloading videos using yt-dlp.

    Key anti-bot detection features:
    - Browser TLS fingerprint impersonation (--impersonate)
    - Residential proxy with geo-rotation
    - Session management for sticky IPs
    - Randomized delays between requests
    - Multiple player client fallbacks
    """

    # Browser impersonation targets for TLS fingerprint matching
    # These make yt-dlp's TLS handshake match real browsers
    # Critical for bypassing YouTube's TLS fingerprint detection
    # IMPORTANT: Must use specific browser versions supported by curl_cffi
    # The actual list will be populated dynamically from yt-dlp --list-impersonate-targets
    # See: https://github.com/yifeikong/curl_cffi#supported-browsers
    # Default fallback list (Chrome-based targets are most reliable)
    DEFAULT_IMPERSONATE_TARGETS = [
        "chrome",       # Generic Chrome - most compatible
        "chrome120",    # Chrome 120
        "chrome119",    # Chrome 119
        "chrome110",    # Chrome 110
        "edge99",       # Edge 99 - commonly available
        "edge101",      # Edge 101
    ]

    # Will be populated with actually available targets at runtime
    IMPERSONATE_TARGETS = []

    # Quality presets with extensive fallbacks for proxy connections
    # YouTube returns different format lists depending on IP location/type
    # These fallback chains ensure we always get a valid format
    #
    # IMPORTANT: We exclude AV1 codec (av01) because Modal's container doesn't have
    # hardware AV1 decoding support, causing FFmpeg to fail with "Missing Sequence Header"
    # errors. We prefer H.264 (avc1) and VP9 (vp9) which are universally supported.
    QUALITY_PRESETS = {
        # High quality: try 1080p H.264/VP9, then 720p, then any quality (excluding AV1)
        "high": (
            "bestvideo[height<=1080][vcodec^=avc1]+bestaudio/best[height<=1080][vcodec^=avc1]/"
            "bestvideo[height<=1080][vcodec^=vp9]+bestaudio/best[height<=1080][vcodec^=vp9]/"
            "bestvideo[height<=1080][vcodec!*=av01]+bestaudio/best[height<=1080]/"
            "bestvideo[height<=720][vcodec!*=av01]+bestaudio/best[height<=720]/"
            "bestvideo[vcodec!*=av01]+bestaudio/best"
        ),
        # Medium quality: try 720p H.264/VP9, then 480p, then any quality (excluding AV1)
        "medium": (
            "bestvideo[height<=720][vcodec^=avc1]+bestaudio/best[height<=720][vcodec^=avc1]/"
            "bestvideo[height<=720][vcodec^=vp9]+bestaudio/best[height<=720][vcodec^=vp9]/"
            "bestvideo[height<=720][vcodec!*=av01]+bestaudio/best[height<=720]/"
            "bestvideo[height<=480][vcodec!*=av01]+bestaudio/best[height<=480]/"
            "bestvideo[vcodec!*=av01]+bestaudio/best"
        ),
        # Low quality: try 480p H.264/VP9, then 360p, then any quality (excluding AV1)
        "low": (
            "bestvideo[height<=480][vcodec^=avc1]+bestaudio/best[height<=480][vcodec^=avc1]/"
            "bestvideo[height<=480][vcodec^=vp9]+bestaudio/best[height<=480][vcodec^=vp9]/"
            "bestvideo[height<=480][vcodec!*=av01]+bestaudio/best[height<=480]/"
            "bestvideo[height<=360][vcodec!*=av01]+bestaudio/best[height<=360]/"
            "bestvideo[vcodec!*=av01]+bestaudio/best"
        ),
    }

    async def download(
        self,
        url: str,
        quality: str = "medium",
    ) -> Dict[str, Any]:
        """
        Download a video and extract audio.

        Args:
            url: Video URL (YouTube, Vimeo, etc.)
            quality: Quality preset ("high", "medium", "low")

        Returns:
            Dictionary with video_path, audio_path, title, duration, etc.
        """
        video_path = os.path.join(self.output_dir, "video.mp4")
        audio_path = os.path.join(self.output_dir, "audio.mp3")
        info_path = os.path.join(self.output_dir, "info.json")

        # Get format string
        format_str = self.QUALITY_PRESETS.get(quality, self.QUALITY_PRESETS["medium"])

        # Download video
        await self._download_video(url, video_path, format_str, info_path)

        # Extract audio
        await self._extract_audio(video_path, audio_path)

        # Parse video info
        info = await self._get_video_info(info_path)

        return {
            "video_path": video_path,
            "audio_path": audio_path,
            "title": info.get("title"),
            "duration": info.get("duration"),
            "uploader": info.get("uploader"),
            "upload_date": info.get("upload_date"),
            "view_count": info.get("view_count"),
            "description": info.get("description"),
            "thumbnail": info.get("thumbnail"),
        }

    # Player client configurations to try (in order of preference)
    # Different player clients have different bot detection thresholds
    # Updated Dec 2024: Prioritize clients that work best with residential proxies
    # See: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
    PLAYER_CLIENT_CONFIGS = [
        # Web client - most compatible with residential proxies
        "youtube:player_client=web",
        # Mobile web client - good with PO tokens, try after web
        "youtube:player_client=mweb",
        # iOS client - often less restricted than Android
        "youtube:player_client=ios",
        # Android testsuite client - sometimes works when others fail
        "youtube:player_client=android_testsuite",
        # TV client - good for residential IPs
        "youtube:player_client=tv",
        # MediaConnect (Google Cast) client - less restricted
        "youtube:player_client=mediaconnect",
        # Web creator client - used by YouTube Studio
        "youtube:player_client=web_creator",
        # TV embedded client - can be restrictive, try later
        "youtube:player_client=tv_embedded",
    ]

    # Priority player configs for geo-rotation
    # REDUCED to 3 configs per country to fail faster and try more countries
    # Most effective configs based on December 2024 testing
    PRIORITY_PLAYER_CONFIGS = [
        "youtube:player_client=web",           # Most compatible
        "youtube:player_client=ios",           # Often bypasses restrictions
        "youtube:player_client=tv",            # Works well with residential IPs
    ]

    # User agents to rotate through for better evasion
    USER_AGENTS = [
        # Chrome on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        # Chrome on Mac
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        # Firefox on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
        # Safari on Mac
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        # Edge on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    ]

    # Modern browser user agent (Chrome 131) - default
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )

    def _get_random_user_agent(self) -> str:
        """Get a random user agent for better evasion."""
        return random.choice(self.USER_AGENTS)

    def _get_random_impersonate_target(self) -> Optional[str]:
        """Get a random browser impersonation target.

        This makes yt-dlp's TLS handshake fingerprint match a real browser,
        which is critical for bypassing YouTube's bot detection.

        Returns:
            A random impersonation target, or None if no targets are available.
        """
        targets = self.IMPERSONATE_TARGETS or self.DEFAULT_IMPERSONATE_TARGETS
        if not targets:
            return None
        return random.choice(targets)

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        os.makedirs(output_dir, exist_ok=True)
        self._temp_cookie_file = None
        self._cache_cleared = False
        self._impersonation_available = False

        # Initialize proxy manager with advanced session/geo features
        proxy_raw = os.environ.get("YOUTUBE_PROXY")
        self.proxy_manager = ProxyManager(proxy_raw)

        self._setup_auth()
        self._check_pot_provider()
        self._check_impersonation_support()

    def _setup_auth(self):
        """Set up authentication from environment variables.

        PROXY MODE (recommended): When YOUTUBE_PROXY is set, use only the proxy.
        This is the simplest and most reliable approach for Modal deployments.
        Now enhanced with session management and geo-rotation.

        FALLBACK MODE: When no proxy is configured, fall back to cookies/PO tokens.
        """
        # Initialize auth attributes
        self.cookies_file = None
        self.po_token = None
        self.visitor_data = None

        # Use proxy manager for proxy configuration
        self.proxy = self.proxy_manager.base_proxy

        if self.proxy:
            # PROXY MODE: Use only the proxy with advanced session management
            # Residential proxy makes requests appear as regular home traffic
            print(f"=== PROXY MODE ENABLED (Enhanced) ===")
            print(f"Session management: ENABLED")
            print(f"Geo-rotation: ENABLED ({len(self.proxy_manager.GEO_ROTATION_ORDER)} countries)")
            print("Using residential proxy only - no cookies or PO tokens needed")
            print("=====================================")
            return  # Skip all other auth setup

        # FALLBACK MODE: No proxy configured, try cookies/PO tokens
        print("Warning: No YOUTUBE_PROXY configured - using fallback authentication")
        print("Note: Modal datacenter IPs are often blocked. Consider setting YOUTUBE_PROXY.")

        # Check for cookie file path - validate it exists
        cookies_file_path = os.environ.get("YOUTUBE_COOKIES_FILE")
        if cookies_file_path and os.path.exists(cookies_file_path):
            self.cookies_file = cookies_file_path
            print(f"YouTube cookies configured from file: {self.cookies_file}")
        else:
            # Check if it's a placeholder value (common misconfiguration)
            is_placeholder = cookies_file_path and (
                "/path/to/" in cookies_file_path or
                cookies_file_path == "cookies.txt" or
                cookies_file_path.startswith("/example/")
            )
            if cookies_file_path and not is_placeholder:
                print(f"Warning: YOUTUBE_COOKIES_FILE path does not exist: {cookies_file_path}")

        # Check for cookie content (create temp file if provided)
        cookies_content = os.environ.get("YOUTUBE_COOKIES")
        if cookies_content and not self.cookies_file:
            cookies_content = cookies_content.strip().strip('"').strip("'")
            if cookies_content:
                validation_error = self._validate_cookie_content(cookies_content)
                if validation_error:
                    print(f"ERROR: Invalid YOUTUBE_COOKIES content - {validation_error}")
                else:
                    self._temp_cookie_file = tempfile.NamedTemporaryFile(
                        mode='w', suffix='.txt', delete=False
                    )
                    self._temp_cookie_file.write(cookies_content)
                    self._temp_cookie_file.close()
                    self.cookies_file = self._temp_cookie_file.name
                    print(f"Created temporary cookie file from YOUTUBE_COOKIES: {self.cookies_file}")

        # PO Token (proof of origin) for bot detection bypass
        po_token_raw = os.environ.get("YOUTUBE_PO_TOKEN")
        self.po_token = po_token_raw.strip().strip('"').strip("'") if po_token_raw else None

        # Visitor data for session continuity
        visitor_data_raw = os.environ.get("YOUTUBE_VISITOR_DATA")
        self.visitor_data = visitor_data_raw.strip().strip('"').strip("'") if visitor_data_raw else None

        # Log fallback auth status
        if self.cookies_file:
            print(f"Fallback: cookies ready: {self.cookies_file}")
        if self.po_token:
            print(f"Fallback: PO token configured (length: {len(self.po_token)})")
        if self.visitor_data:
            print(f"Fallback: visitor data configured (length: {len(self.visitor_data)})")
        if not self.cookies_file and not self.po_token:
            print("Warning: No fallback authentication configured")

    def _validate_cookie_content(self, content: str) -> Optional[str]:
        """Validate that cookie content looks like actual Netscape format cookies.

        Returns None if valid, or an error message string if invalid.
        """
        # Check for shell command syntax (common misconfiguration)
        if "$(" in content or "`" in content:
            return "contains shell command syntax like '$()' or backticks - shell expansion is not performed on env vars"

        # Check for placeholder text
        if content.startswith("<") and ">" in content:
            return "contains placeholder text like '<...>' - replace with actual cookie content"

        # Check for common placeholder patterns
        placeholder_patterns = [
            "netscape format cookie content",
            "paste your cookies here",
            "your cookie content",
            "insert cookies",
            "cookie data here",
        ]
        content_lower = content.lower()
        for pattern in placeholder_patterns:
            if pattern in content_lower:
                return f"appears to contain placeholder text '{pattern}'"

        # Check if content looks like a file path instead of cookie content
        if content.startswith("/") and "\t" not in content and len(content) < 200:
            return "appears to be a file path, not cookie content - use YOUTUBE_COOKIES_FILE for file paths"

        # Basic validation: Netscape cookies should have tab-separated fields
        # or start with a comment line (# Netscape HTTP Cookie File)
        lines = content.strip().split("\n")
        has_valid_line = False
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Netscape format: domain, flag, path, secure, expiration, name, value (7 tab-separated fields)
            fields = line.split("\t")
            if len(fields) >= 6:  # At least 6 fields for basic validity
                has_valid_line = True
                break

        if not has_valid_line and len(lines) > 0:
            # Check if it's too short to be valid cookies
            if len(content) < 50:
                return "content is too short to be valid Netscape format cookies"
            # Check for common wrong formats
            if "=" in content and "\t" not in content:
                return "appears to be in key=value format, not Netscape format - export cookies using a browser extension"

        return None  # Valid

    def _check_pot_provider(self):
        """Check if PO token provider plugin is available."""
        try:
            result = subprocess.run(
                ["yt-dlp", "--list-extractors"],
                capture_output=True,
                text=True,
                timeout=10
            )
            # Check for bgutil provider in verbose output
            check_result = subprocess.run(
                ["yt-dlp", "-v", "--skip-download", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"],
                capture_output=True,
                text=True,
                timeout=30
            )
            if "bgutil" in check_result.stderr.lower() or "pot" in check_result.stderr.lower():
                print("PO Token Provider plugin detected (bgutil)")
                self.has_pot_provider = True
            else:
                print("No PO Token Provider plugin detected - using manual token if provided")
                self.has_pot_provider = False
        except Exception as e:
            print(f"Could not check for PO token provider: {e}")
            self.has_pot_provider = False

    def _check_impersonation_support(self):
        """Check if curl_cffi is available for browser TLS impersonation.

        The --impersonate flag requires curl_cffi to be installed.
        This is CRITICAL for bypassing YouTube's bot detection which
        fingerprints TLS handshakes.

        Dynamically detects available impersonation targets using:
        yt-dlp --list-impersonate-targets
        """
        try:
            # Check if curl_cffi is installed
            import importlib.util
            curl_cffi_spec = importlib.util.find_spec("curl_cffi")

            if curl_cffi_spec is not None:
                # Verify yt-dlp supports --impersonate by checking help
                result = subprocess.run(
                    ["yt-dlp", "--help"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if "--impersonate" in result.stdout:
                    self._impersonation_available = True

                    # Dynamically get list of available impersonation targets
                    available_targets = self._get_available_impersonate_targets()
                    if available_targets:
                        # Update class-level list with actually available targets
                        YouTubeDownloader.IMPERSONATE_TARGETS = available_targets
                    else:
                        # Fall back to defaults if we couldn't get the list
                        YouTubeDownloader.IMPERSONATE_TARGETS = self.DEFAULT_IMPERSONATE_TARGETS.copy()

                    print("=== BROWSER IMPERSONATION ENABLED ===")
                    print("curl_cffi installed - TLS fingerprint impersonation active")
                    print(f"Available targets: {', '.join(YouTubeDownloader.IMPERSONATE_TARGETS)}")
                    print("=====================================")
                else:
                    print("WARNING: yt-dlp version does not support --impersonate flag")
                    print("Consider upgrading: pip install -U yt-dlp")
                    self._impersonation_available = False
                    YouTubeDownloader.IMPERSONATE_TARGETS = []
            else:
                print("WARNING: curl_cffi not installed - browser impersonation DISABLED")
                print("This significantly reduces YouTube download success rate!")
                print("Install with: pip install curl_cffi>=0.5.0")
                self._impersonation_available = False
                YouTubeDownloader.IMPERSONATE_TARGETS = []

        except Exception as e:
            print(f"Could not verify impersonation support: {e}")
            self._impersonation_available = False
            YouTubeDownloader.IMPERSONATE_TARGETS = []

    def _get_available_impersonate_targets(self) -> List[str]:
        """Get list of available impersonation targets from yt-dlp.

        Returns:
            List of available target names (e.g., ["chrome", "chrome120", "edge99"])
        """
        try:
            result = subprocess.run(
                ["yt-dlp", "--list-impersonate-targets"],
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode != 0:
                print(f"Warning: Could not list impersonate targets: {result.stderr[:200]}")
                return []

            # Parse the output - format is typically:
            # Client    Version    OS
            # chrome    120        windows
            # chrome    119        windows
            # edge      99         windows
            # etc.
            targets = []
            lines = result.stdout.strip().split('\n')

            for line in lines:
                line = line.strip()
                # Skip header and empty lines
                if not line or line.startswith('Client') or line.startswith('-'):
                    continue

                # Parse line - columns are typically: Client, Version, OS
                parts = line.split()
                if len(parts) >= 2:
                    client = parts[0].lower()
                    version = parts[1]

                    # Build target name: "chrome120" or "chrome" (generic)
                    # Prefer versioned targets for specificity
                    if version and version.replace('.', '').replace('_', '').isdigit():
                        # Version with dots/underscores: safari17_0, safari15_3
                        version_clean = version.replace('.', '_')
                        target_versioned = f"{client}{version_clean}"
                        if target_versioned not in targets:
                            targets.append(target_versioned)
                    elif version.isdigit() or (len(version) <= 3 and version.replace('.', '').isdigit()):
                        # Simple numeric version: chrome120, edge99
                        target_versioned = f"{client}{version}"
                        if target_versioned not in targets:
                            targets.append(target_versioned)

                    # Also add generic client if not already present
                    if client not in targets:
                        targets.append(client)

            # Prioritize Chrome-based targets (most reliable for YouTube)
            chrome_targets = [t for t in targets if t.startswith('chrome')]
            edge_targets = [t for t in targets if t.startswith('edge')]
            other_targets = [t for t in targets if not t.startswith('chrome') and not t.startswith('edge')]

            # Return in order of preference: Chrome first, then Edge, then others
            prioritized = chrome_targets + edge_targets + other_targets

            if prioritized:
                print(f"Detected {len(prioritized)} available impersonation targets")
                return prioritized[:10]  # Limit to top 10 to avoid too many retries
            else:
                print("Warning: No impersonation targets detected, using defaults")
                return []

        except subprocess.TimeoutExpired:
            print("Warning: Timeout getting impersonate targets")
            return []
        except Exception as e:
            print(f"Warning: Error getting impersonate targets: {e}")
            return []

    async def _clear_cache(self):
        """Clear yt-dlp cache to avoid stale data issues."""
        if self._cache_cleared:
            return
        try:
            print("Clearing yt-dlp cache...")
            process = await asyncio.create_subprocess_exec(
                "yt-dlp", "--rm-cache-dir",
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            await process.communicate()
            self._cache_cleared = True
            print("Cache cleared successfully")
        except Exception as e:
            print(f"Warning: Could not clear cache: {e}")

    def __del__(self):
        """Clean up temporary cookie file if created."""
        if self._temp_cookie_file and os.path.exists(self._temp_cookie_file.name):
            try:
                os.unlink(self._temp_cookie_file.name)
            except Exception:
                pass

    def _get_auth_args(self) -> List[str]:
        """Get authentication arguments for yt-dlp."""
        args = []

        # Add cookie file if available
        if self.cookies_file and os.path.exists(self.cookies_file):
            args.extend(["--cookies", self.cookies_file])

        return args

    def _get_extractor_args(self, player_config: str) -> str:
        """Build extractor args for yt-dlp.

        PROXY MODE: Returns only the player client config (no PO token/visitor data).
        The residential proxy handles authentication by making traffic appear residential.

        FALLBACK MODE: Includes PO token and visitor data if available.
        As of yt-dlp 2024.09.27+, PO tokens use format: CLIENT.CONTEXT+TOKEN

        See: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
        """
        # In proxy mode, use simple player client config only
        # No PO token or visitor data needed - proxy handles it
        if self.proxy:
            return player_config

        # FALLBACK MODE: Include PO token and visitor data if available
        parts = [player_config]

        # Extract client name from player_config (e.g., "youtube:player_client=mweb" -> "mweb")
        client_name = "web"  # default
        if "player_client=" in player_config:
            client_name = player_config.split("player_client=")[1].split(";")[0]

        # Add PO token if available using the new format: CLIENT.CONTEXT+TOKEN
        if self.po_token:
            po_token_arg = f"po_token={client_name}.gvs+{self.po_token}"
            parts.append(po_token_arg)

        # Add visitor data if available
        if self.visitor_data:
            parts.append(f"visitor_data={self.visitor_data}")

        # Join with semicolon for multiple extractor args
        base_config = parts[0]
        if len(parts) > 1:
            extra_args = ";".join(parts[1:])
            return f"{base_config};{extra_args}"
        return base_config

    async def _download_video(
        self,
        url: str,
        output_path: str,
        format_str: str,
        info_path: str,
    ):
        """Download video using yt-dlp with geo-rotation and session management.

        Enhanced retry logic:
        1. If proxy mode: Try multiple countries with geo-rotation
        2. For each country/session: Try all player client configurations
        3. Rotate session (get new IP) when bot detection occurs
        """
        last_error = None
        num_configs = len(self.PLAYER_CLIENT_CONFIGS)
        countries_tried = []

        # Clear cache before download attempts to avoid stale data
        await self._clear_cache()

        # Log mode and authentication status
        if self.proxy:
            print("Download mode: PROXY with geo-rotation and session management")
            print(f"Available countries: {', '.join(self.proxy_manager.GEO_ROTATION_ORDER)}")
        else:
            print("Download mode: FALLBACK (cookies/PO tokens)")
            if hasattr(self, 'has_pot_provider') and self.has_pot_provider:
                print("PO Token Provider is available - automatic token generation enabled")

        # PROXY MODE: Use geo-rotation with session management
        if self.proxy:
            # Reset rotation and try each country
            self.proxy_manager.reset_rotation()

            # PHASE 1: Try each country with sticky sessions and browser impersonation
            print("\n=== PHASE 1: Trying countries with sticky sessions + browser impersonation ===")
            while True:
                # Get next country to try
                country = self.proxy_manager.get_next_country()
                if country is None:
                    # All countries exhausted
                    break

                countries_tried.append(country)

                # Get new session for this country (new IP)
                proxy_url = self.proxy_manager.get_proxy_with_session(
                    country=country,
                    new_session=True
                )

                # Select browser impersonation target for TLS fingerprint matching
                # This is CRITICAL - YouTube detects Python's TLS fingerprint
                impersonate_target = self._get_random_impersonate_target()

                print(f"\n=== Trying country: {country} (session: {self.proxy_manager.current_session_id}, impersonate: {impersonate_target}) ===")

                # Use reduced priority configs for faster failover
                priority_configs = self.PRIORITY_PLAYER_CONFIGS

                for i, player_config in enumerate(priority_configs):
                    extractor_args = self._get_extractor_args(player_config)
                    print(f"  [{country}] Player config {i + 1}/{len(priority_configs)}: {player_config}")

                    success, error = await self._try_download(
                        url, output_path, format_str, extractor_args, proxy_url,
                        impersonate_target=impersonate_target
                    )

                    if success:
                        print(f"Download succeeded with country={country}, config={player_config}, impersonate={impersonate_target}")
                        return  # Success!

                    last_error = error
                    error_str = str(error).lower() if error else ""

                    if self._is_bot_detection_error(error_str):
                        print(f"  [{country}] Bot detection with {player_config}")
                        self._cleanup_partial_downloads(output_path)
                        # Increased delay before trying next config (4-8 seconds)
                        delay = random.uniform(4, 8)
                        await asyncio.sleep(delay)
                        continue
                    elif self._is_permanent_error(error_str):
                        # Permanent errors (private, members-only) - don't retry
                        raise RuntimeError(f"Permanent error: {error}")
                    else:
                        # Other error - try next config
                        self._cleanup_partial_downloads(output_path)
                        continue

                # All configs failed for this country
                print(f"  [{country}] All configs failed, trying next country...")
                # Increased delay between countries (8-15 seconds)
                delay = random.uniform(8, 15)
                await asyncio.sleep(delay)

            # PHASE 2: Try with non-sticky sessions (random IPs) + different impersonation
            print(f"\n=== PHASE 2: Retrying with random IPs + different browser impersonation ===")
            self.proxy_manager.reset_rotation()

            # Only try top 3 countries with random IPs
            for _ in range(3):
                country = self.proxy_manager.get_next_country()
                if country is None:
                    break

                # Use non-sticky session by modifying the proxy URL
                proxy_url = self.proxy_manager.get_proxy_with_session(
                    country=country,
                    new_session=True  # Force new session each time
                )

                # Try a different impersonation target than phase 1
                impersonate_target = self._get_random_impersonate_target()
                print(f"\n=== Retry {country} with random IP (impersonate: {impersonate_target}) ===")

                # Try just web and ios for the fallback phase
                fallback_configs = [
                    "youtube:player_client=web",
                    "youtube:player_client=ios",
                ]

                for player_config in fallback_configs:
                    extractor_args = self._get_extractor_args(player_config)
                    print(f"  [{country}] Fallback: {player_config}")

                    # Try with geo-bypass flag and browser impersonation
                    success, error = await self._try_download(
                        url, output_path, format_str, extractor_args, proxy_url,
                        extra_flags=["--geo-bypass"],
                        impersonate_target=impersonate_target
                    )

                    if success:
                        print(f"Download succeeded with country={country}, config={player_config}, impersonate={impersonate_target} (fallback)")
                        return

                    last_error = error
                    self._cleanup_partial_downloads(output_path)
                    # Increased delay (5-10 seconds)
                    await asyncio.sleep(random.uniform(5, 10))

            # PHASE 3: Try with permissive format string + all impersonation targets
            print(f"\n=== PHASE 3: Trying with permissive format + cycling all impersonation targets ===")
            self.proxy_manager.reset_rotation()

            # Use "best" as a very permissive format - no codec/resolution restrictions
            permissive_format = "best[vcodec!*=av01]/best"

            # Only try top 3 countries
            for _ in range(3):
                country = self.proxy_manager.get_next_country()
                if country is None:
                    break

                proxy_url = self.proxy_manager.get_proxy_with_session(
                    country=country,
                    new_session=True
                )

                # Cycle through all impersonation targets in phase 3
                for impersonate_target in self.IMPERSONATE_TARGETS:
                    print(f"\n=== Retry {country} with permissive format (impersonate: {impersonate_target}) ===")

                    # Try just web client with permissive format
                    for player_config in ["youtube:player_client=web", "youtube:player_client=ios"]:
                        extractor_args = self._get_extractor_args(player_config)
                        print(f"  [{country}] Permissive format: {player_config}")

                        success, error = await self._try_download(
                            url, output_path, permissive_format, extractor_args, proxy_url,
                            extra_flags=["--geo-bypass", "--no-check-formats"],
                            impersonate_target=impersonate_target
                        )

                        if success:
                            print(f"Download succeeded with country={country}, permissive format, impersonate={impersonate_target}")
                            return

                        last_error = error
                        self._cleanup_partial_downloads(output_path)
                        # Delay between attempts (5-10 seconds)
                        await asyncio.sleep(random.uniform(5, 10))

            # All countries exhausted - fall through to error handling
            print(f"\nExhausted all countries: {', '.join(countries_tried)}")

        else:
            # FALLBACK MODE (no proxy): Try all player configs with browser impersonation
            print("Download mode: FALLBACK with browser impersonation")
            for i, player_config in enumerate(self.PLAYER_CLIENT_CONFIGS):
                extractor_args = self._get_extractor_args(player_config)
                impersonate_target = self._get_random_impersonate_target()
                print(f"Trying player config {i + 1}/{num_configs}: {extractor_args} (impersonate: {impersonate_target})")

                success, error = await self._try_download(
                    url, output_path, format_str, extractor_args, proxy_url=None,
                    impersonate_target=impersonate_target
                )

                if success:
                    print(f"Download succeeded with player config: {player_config}, impersonate: {impersonate_target}")
                    return

                last_error = error
                error_str = str(error).lower() if error else ""

                if self._is_bot_detection_error(error_str):
                    print(f"Bot detection error with {player_config}, trying next config...")
                    self._cleanup_partial_downloads(output_path)
                    if i < num_configs - 1:
                        # Increased delay with exponential backoff (8-12s base + exponential)
                        delay = random.uniform(8, 12) + (i * 3)
                        print(f"Waiting {delay:.1f}s before next attempt...")
                        await asyncio.sleep(delay)
                    continue
                elif self._is_permanent_error(error_str):
                    raise RuntimeError(f"Permanent error: {error}")
                else:
                    self._cleanup_partial_downloads(output_path)
                    continue

        # All attempts failed - provide helpful error message
        error_msg = str(last_error) if last_error else "Unknown error"
        error_msg_lower = error_msg.lower()

        if "format is not available" in error_msg_lower or "requested format" in error_msg_lower:
            raise RuntimeError(
                f"No compatible video formats found after trying all configurations. "
                f"This can happen with: age-restricted content, region-locked videos, "
                f"or videos with unusual format restrictions. "
                f"Countries tried: {', '.join(countries_tried) if countries_tried else 'N/A'}. "
                f"Original error: {error_msg}"
            )

        if self._is_bot_detection_error(error_msg_lower):
            if self.proxy:
                auth_hint = (
                    f" Tried {len(countries_tried)} countries ({', '.join(countries_tried)}) "
                    "but all were blocked. This video may have additional restrictions. "
                    "Try: 1) A different video, 2) Check if video is age-restricted or region-locked, "
                    "3) Contact your proxy provider for premium residential IPs."
                )
            else:
                auth_hint = (
                    " Modal's datacenter IPs are blocked by YouTube. "
                    "Set YOUTUBE_PROXY to a residential proxy URL for reliable downloads."
                )
            raise RuntimeError(
                f"YouTube bot detection triggered after all attempts. "
                f"This may be due to: age-restricted content, regional restrictions, "
                f"or YouTube's aggressive bot detection.{auth_hint} "
                f"Original error: {error_msg}"
            )

        raise RuntimeError(f"Failed to download video after all attempts: {error_msg}")

    async def _try_download(
        self,
        url: str,
        output_path: str,
        format_str: str,
        extractor_args: str,
        proxy_url: Optional[str],
        user_agent: Optional[str] = None,
        extra_flags: Optional[List[str]] = None,
        impersonate_target: Optional[str] = None,
    ) -> Tuple[bool, Optional[Exception]]:
        """Attempt a single download with specific configuration.

        Args:
            url: Video URL to download
            output_path: Path to save video
            format_str: yt-dlp format string
            extractor_args: Extractor arguments for player client
            proxy_url: Proxy URL if using proxy mode
            user_agent: User agent string (uses default if not provided)
            extra_flags: Additional yt-dlp flags to add
            impersonate_target: Browser to impersonate for TLS fingerprint (e.g., "chrome120")

        Returns:
            Tuple of (success, error) - error is None if successful
        """
        # Use provided user agent or default
        ua = user_agent or self.USER_AGENT

        cmd = [
            "yt-dlp",
            "--format", format_str,
            "--merge-output-format", "mp4",
            "--output", output_path,
            "--write-info-json",
            "--no-playlist",
            "--no-warnings",
            "--sleep-interval", "3",    # Increased from 2 to reduce rate limit detection
            "--max-sleep-interval", "8", # Increased from 5 to be more conservative
            "--extractor-args", extractor_args,
            "--retries", "3",           # Reduced from 5 - fail faster to try different configs
            "--fragment-retries", "3",  # Reduced from 5
            "--no-check-certificates",
            "--source-address", "0.0.0.0",
        ]

        # Add browser impersonation for TLS fingerprint matching
        # This is CRITICAL for bypassing YouTube's bot detection
        # It makes the TLS handshake match a real browser
        # Only use if curl_cffi is available
        if impersonate_target and self._impersonation_available:
            cmd.extend(["--impersonate", impersonate_target])
            # When impersonating, let yt-dlp handle the user agent to match the TLS fingerprint
            # Don't add manual headers that could conflict with impersonation
        else:
            # Only add manual headers when not impersonating
            # Use a user agent that matches the intended impersonation target
            if impersonate_target and "chrome" in impersonate_target.lower():
                # Chrome-like UA
                ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            elif impersonate_target and "safari" in impersonate_target.lower():
                # Safari UA
                ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
            elif impersonate_target and "edge" in impersonate_target.lower():
                # Edge UA
                ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0"

            cmd.extend([
                "--user-agent", ua,
                "--add-headers", "Accept-Language:en-US,en;q=0.9",
                "--add-headers", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
                "--add-headers", "Sec-Ch-Ua:\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\", \"Google Chrome\";v=\"120\"",
                "--add-headers", "Sec-Ch-Ua-Mobile:?0",
                "--add-headers", "Sec-Ch-Ua-Platform:\"Windows\"",
                "--add-headers", "Sec-Fetch-Dest:document",
                "--add-headers", "Sec-Fetch-Mode:navigate",
                "--add-headers", "Sec-Fetch-Site:none",
                "--add-headers", "Sec-Fetch-User:?1",
                "--add-headers", "Upgrade-Insecure-Requests:1",
            ])

        # Add any extra flags (like --geo-bypass)
        if extra_flags:
            cmd.extend(extra_flags)

        if proxy_url:
            cmd.extend(["--proxy", proxy_url])
        else:
            auth_args = self._get_auth_args()
            if auth_args:
                cmd.extend(auth_args)

        cmd.append(url)

        try:
            await self._run_command(cmd)
            return True, None
        except Exception as e:
            return False, e

    def _is_permanent_error(self, error_str: str) -> bool:
        """Check if the error is permanent and shouldn't be retried."""
        permanent_indicators = [
            "private video",
            "members-only content",
            "join this channel to get access",
            "this video has been removed",
            "video is no longer available",
            "copyright claim",
            "account terminated",
        ]
        return any(indicator in error_str for indicator in permanent_indicators)

    def _is_bot_detection_error(self, error_str: str) -> bool:
        """Check if the error is related to bot detection or format availability.

        Format availability errors are included because different player clients
        may return different format lists through proxies.
        """
        bot_indicators = [
            "sign in",
            "bot",
            "confirm",
            "not a robot",
            "verification",
            "captcha",
            "unusual traffic",
            "automated",
            "temporarily unavailable",
            # Format errors - different player clients may have different formats
            "requested format is not available",
            "format is not available",
            # YouTube error codes that indicate bot detection or access issues
            # Error 152 = "Sign in to confirm you're not a bot" type restrictions
            # These errors should trigger retry with different player clients
            "error code: 152",
            "error code: 150",  # Similar access restriction
            "this video is unavailable",
            "video unavailable",
            "playback on other websites has been disabled",
            "join this channel to get access",
            "members-only content",
            "private video",
            # TLS fingerprint and HTTP/2 related errors
            "http error 403",
            "403 forbidden",
            "got error: 403",
            # Potential curl_cffi/impersonation issues
            "impersonate",
            "curl_cffi",
            "tls",
            "ssl",
            "handshake",
        ]
        return any(indicator in error_str for indicator in bot_indicators)

    def _cleanup_partial_downloads(self, output_path: str):
        """Clean up partial download files."""
        for ext in [".mp4", ".mp4.part", ".info.json", ".webm", ".webm.part"]:
            partial = output_path.replace(".mp4", ext)
            if os.path.exists(partial):
                try:
                    os.remove(partial)
                    print(f"Cleaned up partial file: {partial}")
                except Exception as ex:
                    print(f"Failed to clean up {partial}: {ex}")

    async def _extract_audio(self, video_path: str, audio_path: str):
        """Extract audio from video using ffmpeg."""
        cmd = [
            "ffmpeg",
            "-i", video_path,
            "-vn",  # No video
            "-acodec", "libmp3lame",
            "-ar", "16000",  # 16kHz for Whisper
            "-ac", "1",  # Mono
            "-b:a", "64k",  # Low bitrate for smaller file
            "-y",  # Overwrite
            audio_path,
        ]

        await self._run_command(cmd)

    async def _get_video_info(self, info_path: str) -> Dict[str, Any]:
        """Parse video info from JSON file."""
        # Find the info.json file (yt-dlp may add video id to filename)
        info_files = [
            f for f in os.listdir(self.output_dir)
            if f.endswith(".info.json")
        ]

        if info_files:
            actual_path = os.path.join(self.output_dir, info_files[0])
        elif os.path.exists(info_path):
            actual_path = info_path
        else:
            return {}

        try:
            with open(actual_path, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error reading video info: {e}")
            return {}

    async def _run_command(self, cmd: list) -> str:
        """Run a shell command asynchronously."""
        process = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout, stderr = await process.communicate()

        if process.returncode != 0:
            error_msg = stderr.decode() if stderr else "Unknown error"
            raise RuntimeError(f"Command failed: {' '.join(cmd)}\nError: {error_msg}")

        return stdout.decode() if stdout else ""


class VideoInfoExtractor:
    """
    Extract video information without downloading.
    Useful for validation and metadata retrieval.

    Supports authentication via environment variables (same as YouTubeDownloader).
    Uses browser impersonation for TLS fingerprint matching.
    """

    # Browser impersonation targets for TLS fingerprint matching
    # IMPORTANT: Must use specific browser versions supported by curl_cffi
    # Default fallback list (Chrome-based targets are most reliable)
    DEFAULT_IMPERSONATE_TARGETS = [
        "chrome",       # Generic Chrome - most compatible
        "chrome120",    # Chrome 120
        "chrome119",    # Chrome 119
        "chrome110",    # Chrome 110
        "edge99",       # Edge 99 - commonly available
        "edge101",      # Edge 101
    ]

    # Will be populated with actually available targets at runtime
    IMPERSONATE_TARGETS = []

    # Player client configurations to try (same as downloader)
    # Updated Dec 2024: Prioritize clients that work best with residential proxies
    PLAYER_CLIENT_CONFIGS = [
        # Web client - most compatible with residential proxies
        "youtube:player_client=web",
        # Mobile web client - good with PO tokens, try after web
        "youtube:player_client=mweb",
        # iOS client - often less restricted than Android
        "youtube:player_client=ios",
        # Android testsuite client - sometimes works when others fail
        "youtube:player_client=android_testsuite",
        # TV client - good for residential IPs
        "youtube:player_client=tv",
        # MediaConnect (Google Cast) client - less restricted
        "youtube:player_client=mediaconnect",
        # Web creator client - used by YouTube Studio
        "youtube:player_client=web_creator",
        # TV embedded client - can be restrictive, try later
        "youtube:player_client=tv_embedded",
    ]

    # Priority player configs for geo-rotation (reduced for faster failover)
    PRIORITY_PLAYER_CONFIGS = [
        "youtube:player_client=web",
        "youtube:player_client=ios",
        "youtube:player_client=tv",
    ]

    # User agents to rotate through for better evasion
    USER_AGENTS = [
        # Chrome on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        # Chrome on Mac
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        # Firefox on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
        # Safari on Mac
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15",
        # Edge on Windows
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0",
    ]

    # Modern browser user agent (Chrome 131) - default
    USER_AGENT = (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/131.0.0.0 Safari/537.36"
    )

    @staticmethod
    def _get_random_user_agent() -> str:
        """Get a random user agent for better evasion."""
        return random.choice(VideoInfoExtractor.USER_AGENTS)

    @staticmethod
    def _get_random_impersonate_target() -> Optional[str]:
        """Get a random browser impersonation target.

        This makes yt-dlp's TLS handshake fingerprint match a real browser,
        which is critical for bypassing YouTube's bot detection.

        Returns:
            A random impersonation target, or None if no targets are available.
        """
        targets = VideoInfoExtractor.IMPERSONATE_TARGETS or VideoInfoExtractor.DEFAULT_IMPERSONATE_TARGETS
        if not targets:
            return None
        return random.choice(targets)

    # Bot detection error indicators (also includes format errors for retry logic)
    BOT_INDICATORS = [
        "sign in",
        "bot",
        "confirm",
        "not a robot",
        "verification",
        "captcha",
        "unusual traffic",
        "automated",
        "temporarily unavailable",
        # Format errors - different player clients may have different formats
        "requested format is not available",
        "format is not available",
        # YouTube error codes that indicate bot detection or access issues
        # Error 152 = "Sign in to confirm you're not a bot" type restrictions
        # These errors should trigger retry with different player clients
        "error code: 152",
        "error code: 150",  # Similar access restriction
        "this video is unavailable",
        "video unavailable",
        "playback on other websites has been disabled",
        "join this channel to get access",
        "members-only content",
        "private video",
        # TLS fingerprint and HTTP/2 related errors
        "http error 403",
        "403 forbidden",
        "got error: 403",
        # Potential curl_cffi/impersonation issues
        "impersonate",
        "curl_cffi",
        "tls",
        "ssl",
        "handshake",
    ]

    @staticmethod
    def _check_impersonation_available() -> bool:
        """Check if curl_cffi is available for browser TLS impersonation.

        Also populates IMPERSONATE_TARGETS with actually available targets.
        """
        try:
            import importlib.util
            curl_cffi_spec = importlib.util.find_spec("curl_cffi")

            if curl_cffi_spec is not None:
                result = subprocess.run(
                    ["yt-dlp", "--help"],
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                if "--impersonate" in result.stdout:
                    # Dynamically get available targets
                    available = VideoInfoExtractor._get_available_impersonate_targets()
                    if available:
                        VideoInfoExtractor.IMPERSONATE_TARGETS = available
                    else:
                        VideoInfoExtractor.IMPERSONATE_TARGETS = VideoInfoExtractor.DEFAULT_IMPERSONATE_TARGETS.copy()
                    return True
            return False
        except Exception:
            return False

    @staticmethod
    def _get_available_impersonate_targets() -> List[str]:
        """Get list of available impersonation targets from yt-dlp.

        Returns:
            List of available target names (e.g., ["chrome", "chrome120", "edge99"])
        """
        try:
            result = subprocess.run(
                ["yt-dlp", "--list-impersonate-targets"],
                capture_output=True,
                text=True,
                timeout=15
            )

            if result.returncode != 0:
                return []

            # Parse the output - format is typically:
            # Client    Version    OS
            # chrome    120        windows
            # etc.
            targets = []
            lines = result.stdout.strip().split('\n')

            for line in lines:
                line = line.strip()
                # Skip header and empty lines
                if not line or line.startswith('Client') or line.startswith('-'):
                    continue

                # Parse line - columns are typically: Client, Version, OS
                parts = line.split()
                if len(parts) >= 2:
                    client = parts[0].lower()
                    version = parts[1]

                    # Build target name: "chrome120" or "chrome" (generic)
                    if version and version.replace('.', '').replace('_', '').isdigit():
                        version_clean = version.replace('.', '_')
                        target_versioned = f"{client}{version_clean}"
                        if target_versioned not in targets:
                            targets.append(target_versioned)
                    elif version.isdigit() or (len(version) <= 3 and version.replace('.', '').isdigit()):
                        target_versioned = f"{client}{version}"
                        if target_versioned not in targets:
                            targets.append(target_versioned)

                    # Also add generic client if not already present
                    if client not in targets:
                        targets.append(client)

            # Prioritize Chrome-based targets (most reliable for YouTube)
            chrome_targets = [t for t in targets if t.startswith('chrome')]
            edge_targets = [t for t in targets if t.startswith('edge')]
            other_targets = [t for t in targets if not t.startswith('chrome') and not t.startswith('edge')]

            prioritized = chrome_targets + edge_targets + other_targets
            return prioritized[:10] if prioritized else []

        except Exception:
            return []

    @staticmethod
    def _get_auth_config() -> tuple:
        """Get authentication configuration from environment variables.

        PROXY MODE (recommended): When YOUTUBE_PROXY is set, use ProxyManager with geo-rotation.
        FALLBACK MODE: When no proxy is configured, use cookies/PO tokens.

        Returns: (cookies_file, po_token, visitor_data, temp_cookie_file, proxy_manager)
        """
        # Check for residential proxy FIRST - this is the recommended approach
        proxy_raw = os.environ.get("YOUTUBE_PROXY")

        if proxy_raw:
            # PROXY MODE: Use ProxyManager with geo-rotation
            proxy_manager = ProxyManager(proxy_raw)
            print(f"=== INFO EXTRACTION: PROXY MODE (Enhanced) ===")
            print(f"Session management: ENABLED")
            print(f"Geo-rotation: ENABLED ({len(proxy_manager.GEO_ROTATION_ORDER)} countries)")
            print("Using residential proxy only - no cookies or PO tokens needed")
            print("===============================================")
            return None, None, None, None, proxy_manager

        # FALLBACK MODE: No proxy configured, try cookies/PO tokens
        print("Info extraction: Warning - No YOUTUBE_PROXY configured, using fallback auth")
        cookies_file = None
        temp_cookie_file = None

        # Check for cookie file path
        cookies_file_path = os.environ.get("YOUTUBE_COOKIES_FILE")
        if cookies_file_path and os.path.exists(cookies_file_path):
            cookies_file = cookies_file_path
            print(f"Info extraction: cookies from file: {cookies_file}")
        else:
            is_placeholder = cookies_file_path and (
                "/path/to/" in cookies_file_path or
                cookies_file_path == "cookies.txt" or
                cookies_file_path.startswith("/example/")
            )
            if cookies_file_path and not is_placeholder:
                print(f"Info extraction: Warning - YOUTUBE_COOKIES_FILE path does not exist: {cookies_file_path}")

        # Get cookie content and create temp file if needed
        cookies_content = os.environ.get("YOUTUBE_COOKIES")
        if cookies_content and not cookies_file:
            cookies_content = cookies_content.strip().strip('"').strip("'")
            if cookies_content:
                validation_error = VideoInfoExtractor._validate_cookie_content(cookies_content)
                if validation_error:
                    print(f"Info extraction: ERROR - Invalid YOUTUBE_COOKIES - {validation_error}")
                else:
                    temp_cookie_file = tempfile.NamedTemporaryFile(
                        mode='w', suffix='.txt', delete=False
                    )
                    temp_cookie_file.write(cookies_content)
                    temp_cookie_file.close()
                    cookies_file = temp_cookie_file.name
                    print(f"Info extraction: created temp cookie file: {cookies_file}")

        # Get PO token and visitor data
        po_token_raw = os.environ.get("YOUTUBE_PO_TOKEN")
        po_token = po_token_raw.strip().strip('"').strip("'") if po_token_raw else None

        visitor_data_raw = os.environ.get("YOUTUBE_VISITOR_DATA")
        visitor_data = visitor_data_raw.strip().strip('"').strip("'") if visitor_data_raw else None

        # Log fallback auth status
        if cookies_file:
            print(f"Info extraction fallback: cookies ready")
        if po_token:
            print(f"Info extraction fallback: PO token configured")
        if visitor_data:
            print(f"Info extraction fallback: visitor data configured")
        if not cookies_file and not po_token:
            print("Info extraction: Warning - No fallback auth configured")

        return cookies_file, po_token, visitor_data, temp_cookie_file, None

    @staticmethod
    def _get_extractor_args(player_config: str, po_token: Optional[str], visitor_data: Optional[str], proxy: Optional[str] = None) -> str:
        """Build extractor args for yt-dlp.

        PROXY MODE: Returns only the player client config (no PO token/visitor data).
        FALLBACK MODE: Includes PO token and visitor data if available.

        See: https://github.com/yt-dlp/yt-dlp/wiki/PO-Token-Guide
        """
        # In proxy mode, use simple player client config only
        if proxy:
            return player_config

        # FALLBACK MODE: Include PO token and visitor data if available
        parts = [player_config]

        # Extract client name from player_config
        client_name = "web"  # default
        if "player_client=" in player_config:
            client_name = player_config.split("player_client=")[1].split(";")[0]

        # Add PO token using the new format: CLIENT.gvs+TOKEN
        if po_token:
            po_token_arg = f"po_token={client_name}.gvs+{po_token}"
            parts.append(po_token_arg)

        if visitor_data:
            parts.append(f"visitor_data={visitor_data}")

        base_config = parts[0]
        if len(parts) > 1:
            extra_args = ";".join(parts[1:])
            return f"{base_config};{extra_args}"
        return base_config

    @staticmethod
    async def get_info(url: str) -> Dict[str, Any]:
        """
        Get video information without downloading.
        Enhanced with geo-rotation and session management for proxy mode.

        Args:
            url: Video URL

        Returns:
            Dictionary with video metadata
        """
        last_error = None
        countries_tried = []

        # Get authentication configuration
        cookies_file, po_token, visitor_data, temp_cookie_file, proxy_manager = VideoInfoExtractor._get_auth_config()

        # Check if impersonation is available
        impersonation_available = VideoInfoExtractor._check_impersonation_available()
        if impersonation_available:
            print("=== BROWSER IMPERSONATION ENABLED for info extraction ===")
            print(f"Available targets: {', '.join(VideoInfoExtractor.IMPERSONATE_TARGETS)}")
        else:
            print("WARNING: Browser impersonation NOT available - falling back to headers only")

        # Use expanded priority configs for better coverage
        priority_configs = VideoInfoExtractor.PRIORITY_PLAYER_CONFIGS

        try:
            # PROXY MODE with geo-rotation and browser impersonation
            if proxy_manager:
                print("Info extraction mode: PROXY with geo-rotation + browser impersonation")
                proxy_manager.reset_rotation()

                while True:
                    country = proxy_manager.get_next_country()
                    if country is None:
                        break

                    countries_tried.append(country)
                    proxy_url = proxy_manager.get_proxy_with_session(country=country, new_session=True)
                    # Use browser impersonation for TLS fingerprint matching
                    impersonate_target = VideoInfoExtractor._get_random_impersonate_target()
                    print(f"\n=== Info extraction: trying {country} (impersonate: {impersonate_target}) ===")

                    for i, player_config in enumerate(priority_configs):
                        extractor_args = VideoInfoExtractor._get_extractor_args(player_config, None, None, proxy_url)
                        print(f"  [{country}] Config {i + 1}/{len(priority_configs)}: {player_config}")

                        # Build command with impersonation if available
                        cmd = [
                            "yt-dlp",
                            "--dump-json",
                            "--no-playlist",
                            "--no-warnings",
                            "--extractor-args", extractor_args,
                            "--source-address", "0.0.0.0",
                            "--geo-bypass",
                            "--proxy", proxy_url,
                        ]

                        # Add browser impersonation if curl_cffi is available
                        if impersonation_available:
                            cmd.extend(["--impersonate", impersonate_target])
                        else:
                            # Fallback: Use matching user agent and headers
                            ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                            cmd.extend([
                                "--user-agent", ua,
                                "--add-headers", "Accept-Language:en-US,en;q=0.9",
                                "--add-headers", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                                "--add-headers", "Sec-Ch-Ua:\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\"",
                                "--add-headers", "Sec-Ch-Ua-Mobile:?0",
                                "--add-headers", "Sec-Ch-Ua-Platform:\"Windows\"",
                            ])

                        cmd.append(url)

                        process = await asyncio.create_subprocess_exec(
                            *cmd,
                            stdout=asyncio.subprocess.PIPE,
                            stderr=asyncio.subprocess.PIPE,
                        )

                        stdout, stderr = await process.communicate()

                        if process.returncode == 0:
                            try:
                                print(f"Info extraction succeeded with country={country}, config={player_config}, impersonate={impersonate_target}")
                                return json.loads(stdout.decode())
                            except json.JSONDecodeError:
                                return {}

                        error_msg = stderr.decode() if stderr else "Unknown error"
                        last_error = error_msg

                        if VideoInfoExtractor._is_bot_detection_error(error_msg):
                            print(f"  [{country}] Bot detection with {player_config}")
                            # Increased delay (5-10 seconds)
                            await asyncio.sleep(random.uniform(5, 10))
                            continue

                        # Non-bot error - try next config
                        continue

                    # All configs failed for this country
                    print(f"  [{country}] All configs failed, trying next country...")
                    # Increased delay between countries (8-15 seconds)
                    await asyncio.sleep(random.uniform(8, 15))

                # All countries exhausted
                print(f"\nExhausted all countries: {', '.join(countries_tried)}")

            else:
                # FALLBACK MODE (no proxy) with browser impersonation
                print("Info extraction mode: FALLBACK with browser impersonation")
                num_configs = len(VideoInfoExtractor.PLAYER_CLIENT_CONFIGS)

                for i, player_config in enumerate(VideoInfoExtractor.PLAYER_CLIENT_CONFIGS):
                    extractor_args = VideoInfoExtractor._get_extractor_args(player_config, po_token, visitor_data, None)
                    impersonate_target = VideoInfoExtractor._get_random_impersonate_target()
                    print(f"Info extraction: trying config {i + 1}/{num_configs}: {extractor_args} (impersonate: {impersonate_target})")

                    # Build command with impersonation if available
                    cmd = [
                        "yt-dlp",
                        "--dump-json",
                        "--no-playlist",
                        "--no-warnings",
                        "--extractor-args", extractor_args,
                        "--source-address", "0.0.0.0",
                    ]

                    # Add browser impersonation if curl_cffi is available
                    if impersonation_available:
                        cmd.extend(["--impersonate", impersonate_target])
                    else:
                        # Fallback: Use matching user agent and headers
                        ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
                        cmd.extend([
                            "--user-agent", ua,
                            "--add-headers", "Accept-Language:en-US,en;q=0.9",
                            "--add-headers", "Accept:text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                            "--add-headers", "Sec-Ch-Ua:\"Not_A Brand\";v=\"8\", \"Chromium\";v=\"120\"",
                            "--add-headers", "Sec-Ch-Ua-Mobile:?0",
                            "--add-headers", "Sec-Ch-Ua-Platform:\"Windows\"",
                        ])

                    if cookies_file and os.path.exists(cookies_file):
                        cmd.extend(["--cookies", cookies_file])

                    cmd.append(url)

                    process = await asyncio.create_subprocess_exec(
                        *cmd,
                        stdout=asyncio.subprocess.PIPE,
                        stderr=asyncio.subprocess.PIPE,
                    )

                    stdout, stderr = await process.communicate()

                    if process.returncode == 0:
                        try:
                            print(f"Info extraction succeeded with player config: {player_config}, impersonate: {impersonate_target}")
                            return json.loads(stdout.decode())
                        except json.JSONDecodeError:
                            return {}

                    error_msg = stderr.decode() if stderr else "Unknown error"
                    last_error = error_msg

                    if VideoInfoExtractor._is_bot_detection_error(error_msg):
                        print(f"Bot detection error with {player_config}, trying next config...")
                        if i < num_configs - 1:
                            # Increased delay with exponential backoff (8-12s base)
                            delay = random.uniform(8, 12) + (i * 3)
                            print(f"Waiting {delay:.1f}s before next attempt...")
                            await asyncio.sleep(delay)
                        continue

                    raise RuntimeError(f"Failed to get video info: {error_msg}")

            # All attempts failed
            if last_error and VideoInfoExtractor._is_bot_detection_error(last_error):
                if proxy_manager:
                    auth_hint = (
                        f" Tried {len(countries_tried)} countries ({', '.join(countries_tried)}) "
                        "but all were blocked. This video may have additional restrictions. "
                        "Try: 1) A different video, 2) Check if video is restricted."
                    )
                else:
                    auth_hint = (
                        " Modal's datacenter IPs are blocked by YouTube. "
                        "Set YOUTUBE_PROXY to a residential proxy URL for reliable access."
                    )
                raise RuntimeError(
                    f"YouTube bot detection triggered after all attempts. "
                    f"This may be due to: age-restricted content or aggressive bot detection.{auth_hint} "
                    f"Original error: {last_error}"
                )
            raise RuntimeError(f"Failed to get video info after all attempts: {last_error}")

        finally:
            if temp_cookie_file and os.path.exists(temp_cookie_file.name):
                try:
                    os.unlink(temp_cookie_file.name)
                except Exception:
                    pass

    @staticmethod
    def _is_bot_detection_error(error_str: str) -> bool:
        """Check if the error is related to bot detection."""
        error_lower = error_str.lower()
        return any(indicator in error_lower for indicator in VideoInfoExtractor.BOT_INDICATORS)

    @staticmethod
    def _validate_cookie_content(content: str) -> Optional[str]:
        """Validate that cookie content looks like actual Netscape format cookies.

        Returns None if valid, or an error message string if invalid.
        """
        # Check for shell command syntax (common misconfiguration)
        if "$(" in content or "`" in content:
            return "contains shell command syntax like '$()' or backticks - shell expansion is not performed on env vars"

        # Check for placeholder text
        if content.startswith("<") and ">" in content:
            return "contains placeholder text like '<...>' - replace with actual cookie content"

        # Check for common placeholder patterns
        placeholder_patterns = [
            "netscape format cookie content",
            "paste your cookies here",
            "your cookie content",
            "insert cookies",
            "cookie data here",
        ]
        content_lower = content.lower()
        for pattern in placeholder_patterns:
            if pattern in content_lower:
                return f"appears to contain placeholder text '{pattern}'"

        # Check if content looks like a file path instead of cookie content
        if content.startswith("/") and "\t" not in content and len(content) < 200:
            return "appears to be a file path, not cookie content - use YOUTUBE_COOKIES_FILE for file paths"

        # Basic validation: Netscape cookies should have tab-separated fields
        lines = content.strip().split("\n")
        has_valid_line = False
        for line in lines:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            # Netscape format: domain, flag, path, secure, expiration, name, value (7 tab-separated fields)
            fields = line.split("\t")
            if len(fields) >= 6:
                has_valid_line = True
                break

        if not has_valid_line and len(lines) > 0:
            if len(content) < 50:
                return "content is too short to be valid Netscape format cookies"
            if "=" in content and "\t" not in content:
                return "appears to be in key=value format, not Netscape format - export cookies using a browser extension"

        return None  # Valid

    @staticmethod
    def is_valid_url(url: str) -> bool:
        """
        Check if URL is a valid video URL.
        """
        patterns = [
            # YouTube
            r"^https?://(www\.)?youtube\.com/watch\?v=[\w-]+",
            r"^https?://youtu\.be/[\w-]+",
            r"^https?://(www\.)?youtube\.com/shorts/[\w-]+",
            # Vimeo
            r"^https?://(www\.)?vimeo\.com/\d+",
            # TikTok
            r"^https?://(www\.)?tiktok\.com/@[\w.-]+/video/\d+",
            # Twitter/X
            r"^https?://(www\.)?(twitter|x)\.com/\w+/status/\d+",
        ]

        import re
        return any(re.match(pattern, url) for pattern in patterns)
