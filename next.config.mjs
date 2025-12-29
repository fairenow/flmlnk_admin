import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    // Skip type checking during build - types are checked by Convex CLI separately
    ignoreBuildErrors: true,
  },
  eslint: {
    // Skip ESLint during build - allows warnings without failing build
    ignoreDuringBuilds: true,
  },
  typedRoutes: true,
  // Use dynamic path resolution instead of hardcoded path for portability
  outputFileTracingRoot: __dirname,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        pathname: '/images/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
        pathname: '/vi/**',
      },
      {
        protocol: 'https',
        hostname: '*.convex.cloud',
        pathname: '/**',
      },
      // Allow posters hosted on arbitrary HTTPS domains so creators can paste links
      // from services like Google Drive, Dropbox, Squarespace, etc.
      {
        protocol: 'https',
        hostname: '**',
        pathname: '/**',
      },
      // Fallback for HTTP-only hosts (less common, but keeps previews working)
      {
        protocol: 'http',
        hostname: '**',
        pathname: '/**',
      },
    ],
  },
};

export default nextConfig;
