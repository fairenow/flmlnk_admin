"use client";

import type { FC, FormEvent } from "react";
import type { Id } from "@convex/_generated/dataModel";
import { useState, useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { X, Star } from "lucide-react";
import { signIn, useSession } from "@/lib/auth-client";

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
    <path
      fill="#EA4335"
      d="M12 10.2v3.6h5.1c-.2 1.2-.8 2.1-1.6 2.8l2.6 2c1.5-1.4 2.4-3.5 2.4-6 0-.6-.1-1.2-.2-1.8H12z"
    />
    <path
      fill="#34A853"
      d="M5.3 14.3l-.8.6-2 1.6C4 20 7.7 22 12 22c2.4 0 4.4-.8 5.9-2.4l-2.6-2c-.7.5-1.6.8-2.7.8-2.1 0-3.9-1.4-4.6-3.4z"
    />
    <path
      fill="#4A90E2"
      d="M3 7.5C2.4 8.7 2 10.1 2 11.5s.4 2.8 1 4l3.2-2.5c-.2-.5-.3-1-.3-1.5s.1-1 .3-1.5z"
    />
    <path
      fill="#FBBC05"
      d="M12 4.8c1.3 0 2.5.4 3.4 1.3l2.5-2.4C16.4 2.4 14.4 1.5 12 1.5 7.7 1.5 4 3.5 2.5 7l3.2 2.5C6.1 6.2 8 4.8 12 4.8z"
    />
    <path fill="none" d="M2 2h20v20H2z" />
  </svg>
);

type FanEmailModalProps = {
  isOpen: boolean;
  onClose: () => void;
  actorProfileId: Id<"actor_profiles">;
  actorName: string;
  primaryColor?: string;
};

export const FanEmailModal: FC<FanEmailModalProps> = ({
  isOpen,
  onClose,
  actorProfileId,
  actorName,
  primaryColor = "#FF1744",
}) => {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [isGooglePending, setIsGooglePending] = useState(false);

  const { data: sessionData } = useSession();
  const isAuthenticated = Boolean(sessionData?.session);

  const submitFanEmail = useMutation(api.filmmakers.submitFanEmail);

  const handleGoogleSignIn = useCallback(async () => {
    setIsGooglePending(true);
    setErrorMessage("");
    try {
      await signIn.social({
        provider: "google",
        redirectTo: window.location.href,
      });
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to sign in with Google");
      setIsGooglePending(false);
    }
  }, []);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();

      if (!email.trim()) {
        setErrorMessage("Email is required");
        return;
      }

      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        setErrorMessage("Please enter a valid email");
        return;
      }

      setStatus("loading");
      setErrorMessage("");

      try {
        await submitFanEmail({
          actorProfileId,
          email: email.trim(),
          name: name.trim() || undefined,
          source: "modal",
        });

        // Save auth state to localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem('flmlnk_auth', JSON.stringify({
            isAuthenticated: true,
            userName: name.trim() || 'Fan',
            userEmail: email.trim()
          }));
        }

        setStatus("success");
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Failed to subscribe");
      }
    },
    [email, name, actorProfileId, submitFanEmail]
  );

  const handleClose = useCallback(() => {
    setName("");
    setEmail("");
    setStatus("idle");
    setErrorMessage("");
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-75 backdrop-blur-sm">
      <div
        className="relative w-full max-w-lg bg-gray-900 rounded-2xl shadow-2xl border"
        style={{ borderColor: `${primaryColor}30` }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
        >
          <X className="w-6 h-6" />
        </button>

        <div className="p-8">
          {status === "success" ? (
            <div className="text-center py-6">
              <div className="mb-4 text-5xl">🎬</div>
              <h2 className="text-2xl font-bold text-white mb-2">
                You&apos;re In!
              </h2>
              <p className="text-gray-400">
                Thanks for connecting with {actorName}. You&apos;ll receive updates on new projects and releases.
              </p>
              <button
                type="button"
                onClick={handleClose}
                className="mt-6 px-8 py-3 rounded-lg font-semibold text-white transition hover:opacity-90"
                style={{
                  background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}cc)`
                }}
              >
                Done
              </button>
            </div>
          ) : (
            <>
              {/* Modal Header */}
              <div className="text-center mb-6">
                <h2
                  className="text-3xl font-bold mb-3 bg-clip-text text-transparent"
                  style={{
                    backgroundImage: `linear-gradient(to right, ${primaryColor}, ${primaryColor}cc)`
                  }}
                >
                  Join {actorName}&apos;s Community
                </h2>
                <p className="text-gray-400">
                  Sign up for exclusive updates about upcoming projects and enter to win exclusive prizes.
                </p>
              </div>

              {/* Google Auth Button at Top */}
              {!isAuthenticated && (
                <div className="mb-6">
                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isGooglePending || status === "loading"}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-lg border border-gray-600 bg-white px-4 py-3 text-sm font-medium text-gray-900 shadow-sm transition hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                  >
                    <GoogleIcon />
                    {isGooglePending ? "Connecting to Google..." : "Continue with Google"}
                  </button>

                  <div className="relative text-center text-xs text-gray-500 my-4">
                    <span className="absolute left-0 top-1/2 h-px w-full bg-gray-700 -z-10" />
                    <span className="relative inline-block bg-gray-900 px-3">or sign up with email</span>
                  </div>
                </div>
              )}

              {/* Form */}
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="fan-name" className="block text-sm font-medium text-gray-300 mb-1">
                    Name *
                  </label>
                  <input
                    type="text"
                    id="fan-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 transition focus:outline-none focus:ring-2"
                    style={{
                      ['--tw-ring-color' as any]: primaryColor
                    }}
                    placeholder="John Doe"
                    disabled={status === "loading"}
                  />
                </div>

                <div>
                  <label htmlFor="fan-email" className="block text-sm font-medium text-gray-300 mb-1">
                    Email *
                  </label>
                  <input
                    type="email"
                    id="fan-email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 transition focus:outline-none focus:ring-2"
                    style={{
                      ['--tw-ring-color' as any]: primaryColor
                    }}
                    placeholder="john@example.com"
                    disabled={status === "loading"}
                  />
                </div>

                {errorMessage && (
                  <div
                    className="p-3 rounded-lg text-sm"
                    style={{
                      backgroundColor: 'rgba(239, 68, 68, 0.1)',
                      borderColor: 'rgba(239, 68, 68, 0.3)',
                      borderWidth: '1px',
                      color: 'rgb(248, 113, 113)'
                    }}
                  >
                    {errorMessage}
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={status === "loading" || isGooglePending}
                  className="w-full py-3 px-6 text-white font-semibold rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                  style={{
                    background: `linear-gradient(to right, ${primaryColor}, ${primaryColor}cc)`
                  }}
                >
                  {status === "loading" ? "Signing Up..." : "Sign Up"}
                </button>
              </form>

              <div className="mt-6 pt-6 border-t border-gray-800 text-center">
                <p className="text-sm text-gray-500">
                  Join the community for exclusive updates and giveaways.
                </p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  {[...Array(5)].map((_, i) => (
                    <Star
                      key={i}
                      className="w-4 h-4"
                      fill={primaryColor}
                      style={{ color: primaryColor }}
                    />
                  ))}
                  <span className="text-xs text-gray-400 ml-1">An Exclusive Experience</span>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FanEmailModal;
