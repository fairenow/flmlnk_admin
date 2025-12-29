"use client";

import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import Link from "next/link";
import { useState, Suspense } from "react";

function UnsubscribeContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") || "";

  const status = useQuery(api.newsletter.getUnsubscribeStatus, { token });
  const unsubscribe = useMutation(api.newsletter.unsubscribeByToken);
  const resubscribe = useMutation(api.newsletter.resubscribeByToken);

  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUnsubscribe = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await unsubscribe({ token });
      if (result.success) {
        setMessage(result.message || "You have been unsubscribed successfully.");
      } else {
        setError(result.error || "Failed to unsubscribe.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleResubscribe = async () => {
    setIsLoading(true);
    setError(null);
    setMessage(null);

    try {
      const result = await resubscribe({ token });
      if (result.success) {
        setMessage(result.message || "You have been resubscribed successfully.");
      } else {
        setError(result.error || "Failed to resubscribe.");
      }
    } catch {
      setError("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  // No token provided
  if (!token) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center">
        <div className="text-4xl mb-4">📧</div>
        <h2 className="text-xl font-semibold mb-2">Invalid Unsubscribe Link</h2>
        <p className="text-gray-400 mb-6">
          This unsubscribe link appears to be invalid or incomplete.
        </p>
        <p className="text-sm text-gray-500">
          If you&apos;re trying to unsubscribe from Flmlnk emails, please use the link
          provided in the email you received.
        </p>
      </div>
    );
  }

  // Loading state
  if (status === undefined) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center">
        <div className="animate-pulse">
          <div className="h-8 bg-white/10 rounded w-3/4 mx-auto mb-4"></div>
          <div className="h-4 bg-white/10 rounded w-1/2 mx-auto"></div>
        </div>
      </div>
    );
  }

  // Invalid token
  if (!status.valid) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center">
        <div className="text-4xl mb-4">❌</div>
        <h2 className="text-xl font-semibold mb-2">Link Expired or Invalid</h2>
        <p className="text-gray-400 mb-6">
          This unsubscribe link is no longer valid. It may have expired or been used already.
        </p>
        <p className="text-sm text-gray-500">
          If you continue to receive unwanted emails, please contact{" "}
          <a href="mailto:support@flmlnk.com" className="text-red-400 hover:text-red-300">
            support@flmlnk.com
          </a>
        </p>
      </div>
    );
  }

  // Show success/error messages after action
  if (message) {
    return (
      <div className="rounded-2xl border border-green-500/20 bg-green-500/10 backdrop-blur-sm p-8 text-center">
        <div className="text-4xl mb-4">✅</div>
        <h2 className="text-xl font-semibold mb-2 text-green-400">Success</h2>
        <p className="text-gray-300 mb-6">{message}</p>
        <Link
          href="/"
          className="inline-block px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          Return to Flmlnk
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/10 backdrop-blur-sm p-8 text-center">
        <div className="text-4xl mb-4">⚠️</div>
        <h2 className="text-xl font-semibold mb-2 text-red-400">Error</h2>
        <p className="text-gray-300 mb-6">{error}</p>
        <button
          onClick={() => setError(null)}
          className="inline-block px-6 py-2 rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Already unsubscribed - offer to resubscribe
  if (status.unsubscribed) {
    return (
      <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center">
        <div className="text-4xl mb-4">📭</div>
        <h2 className="text-xl font-semibold mb-2">You&apos;re Unsubscribed</h2>
        <p className="text-gray-400 mb-2">
          The email <span className="text-white">{status.email}</span> has been unsubscribed.
        </p>
        <p className="text-gray-500 text-sm mb-6">
          You won&apos;t receive any more newsletter emails at this address.
        </p>
        <div className="space-y-3">
          <button
            onClick={handleResubscribe}
            disabled={isLoading}
            className="inline-block px-6 py-2 rounded-full bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Processing..." : "Resubscribe"}
          </button>
          <p className="text-xs text-gray-600">
            Changed your mind? Click above to start receiving emails again.
          </p>
        </div>
      </div>
    );
  }

  // Active subscription - offer to unsubscribe
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center">
      <div className="text-4xl mb-4">📧</div>
      <h2 className="text-xl font-semibold mb-2">Unsubscribe from Emails</h2>
      <p className="text-gray-400 mb-2">
        You&apos;re about to unsubscribe <span className="text-white">{status.email}</span>
      </p>
      <p className="text-gray-500 text-sm mb-6">
        You won&apos;t receive any more newsletter updates at this email address.
      </p>
      <div className="space-y-3">
        <button
          onClick={handleUnsubscribe}
          disabled={isLoading}
          className="inline-block px-6 py-2 rounded-full bg-red-600 hover:bg-red-500 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? "Processing..." : "Unsubscribe"}
        </button>
        <p className="text-xs text-gray-600">
          You can resubscribe at any time.
        </p>
      </div>
    </div>
  );
}

export default function UnsubscribePage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-red-900/10 via-transparent to-red-900/5 blur-3xl" aria-hidden />
        <div className="relative max-w-lg mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="flex items-center gap-3 text-sm text-gray-400 mb-8">
            <Link href="/" className="hover:text-white transition-colors">
              Home
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-white">Unsubscribe</span>
          </div>

          <div className="text-center mb-8">
            <h1 className="text-3xl font-semibold mb-2">Email Preferences</h1>
            <p className="text-gray-400">Manage your Flmlnk email subscriptions</p>
          </div>

          <Suspense fallback={
            <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-sm p-8 text-center">
              <div className="animate-pulse">
                <div className="h-8 bg-white/10 rounded w-3/4 mx-auto mb-4"></div>
                <div className="h-4 bg-white/10 rounded w-1/2 mx-auto"></div>
              </div>
            </div>
          }>
            <UnsubscribeContent />
          </Suspense>

          <div className="mt-8 text-center text-sm text-gray-500">
            <p>
              Questions?{" "}
              <a href="mailto:support@flmlnk.com" className="text-red-400 hover:text-red-300">
                Contact support
              </a>
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
