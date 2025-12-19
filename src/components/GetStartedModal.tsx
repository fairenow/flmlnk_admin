"use client";

import type { FC, FormEvent, SVGProps } from "react";
import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { signIn, signUp, sendVerificationEmail } from "@/lib/auth-client";
import { buildSignInUrl } from "@/lib/routes";

type IconProps = SVGProps<SVGSVGElement>;

const iconBase = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const Eye = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M1.5 12s4.5-7 10.5-7 10.5 7 10.5 7-4.5 7-10.5 7S1.5 12 1.5 12Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOff = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="m3 3 18 18" />
    <path d="M10.6 10.6a3 3 0 0 1 4.8 2.4 3 3 0 0 1-.4 1.5" />
    <path d="M9.5 5.2A10.8 10.8 0 0 1 12 5c6 0 10.5 7 10.5 7a15.8 15.8 0 0 1-3.2 4.1" />
    <path d="M4.2 7a15.3 15.3 0 0 0-2.7 5c0 0 4.5 7 10.5 7a9.5 9.5 0 0 0 2.7-.4" />
  </svg>
);

const Play = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="m8 5 11 7-11 7Z" />
  </svg>
);

const X = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </svg>
);

const Mail = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden>
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

type GetStartedModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export const GetStartedModal: FC<GetStartedModalProps> = ({
  isOpen,
  onClose,
}) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleEscape);
    }
    return () => window.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  const handleClose = useCallback(() => {
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setAgreedToTerms(false);
    setError(null);
    setIsLoading(false);
    setShowVerificationMessage(false);
    setIsResendingEmail(false);
    onClose();
  }, [onClose]);

  const handleEmailSignup = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy");
      return;
    }

    setError(null);
    setIsLoading(true);

    try {
      const result = await signUp.email({
        email,
        password,
        name: email.split("@")[0],
      });

      if (result.error) {
        setError(result.error.message ?? "Unable to create account.");
        setIsLoading(false);
        return;
      }

      // Show verification message - user must verify email before they can proceed
      setShowVerificationMessage(true);
      setIsLoading(false);
    } catch (err) {
      console.error("Signup error:", err);
      const message = err instanceof Error ? err.message : "Unable to complete signup right now.";
      setError(message);
      setIsLoading(false);
    }
  };

  const handleResendVerification = async () => {
    setIsResendingEmail(true);
    try {
      await sendVerificationEmail({ email });
    } catch {
      // Silently fail - the email might already be sent
    } finally {
      setIsResendingEmail(false);
    }
  };

  const resetForm = () => {
    setShowVerificationMessage(false);
    setEmail("");
    setPassword("");
    setError(null);
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setIsLoading(true);
    try {
      await signIn.social({
        provider: "google",
        redirectTo: "/onboarding",
      });
    } catch (err) {
      console.error("Google sign-in error:", err);
      const message = err instanceof Error ? err.message : "Google sign-in failed";
      setError(message);
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
    >
      <div className="relative w-full max-w-md">
        {/* Gradient glow effect */}
        <div className="absolute -inset-1 bg-gradient-to-r from-red-600/30 via-red-500/20 to-red-600/30 rounded-2xl blur-xl opacity-50" />

        <div className="relative bg-gray-950/95 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl">
          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            className="absolute top-4 right-4 p-2 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-white/10"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" />
          </button>

          {showVerificationMessage ? (
            <div className="space-y-4">
              <div className="text-center mb-2">
                <div className="w-16 h-16 bg-green-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-green-500" />
                </div>
                <h2 className="font-cinematic text-2xl tracking-wider uppercase mb-2">Check Your Email</h2>
                <p className="text-gray-400 text-sm">
                  We&apos;ve sent a verification link to <span className="text-white font-medium">{email}</span>
                </p>
              </div>

              <div className="bg-gray-900/50 border border-white/5 rounded-xl p-4">
                <p className="text-gray-400 text-sm leading-relaxed">
                  Click the link in your email to verify your account and start your free trial.
                </p>
              </div>

              <div className="text-center text-xs text-gray-500">
                <p>
                  Didn&apos;t receive the email?{" "}
                  <button
                    type="button"
                    onClick={handleResendVerification}
                    disabled={isResendingEmail}
                    className="text-red-400 hover:text-red-300 underline underline-offset-2 disabled:opacity-50"
                  >
                    {isResendingEmail ? "Sending..." : "Resend verification email"}
                  </button>
                </p>
                <p className="mt-2">
                  Wrong email?{" "}
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-red-400 hover:text-red-300 underline underline-offset-2"
                  >
                    Try again
                  </button>
                </p>
              </div>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="text-center mb-5">
                <h2 className="font-cinematic text-2xl tracking-wider uppercase mb-2">Start Free</h2>
                <p className="text-gray-400 text-sm">No credit card required. Launch in minutes.</p>
              </div>

              {/* Google Sign In */}
              <button
                onClick={handleGoogleSignIn}
                disabled={isLoading}
                className="w-full flex items-center justify-center gap-2 bg-white text-gray-900 py-3 rounded-xl font-medium transition disabled:opacity-60 hover:scale-[1.01] active:scale-95"
              >
                <GoogleIcon />
                <span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
              </button>

              {/* Divider */}
              <div className="my-5 flex items-center gap-3">
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
                <span className="text-gray-500 text-xs uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
              </div>

              {/* Email/Password Form */}
              <form className="space-y-4" onSubmit={handleEmailSignup}>
                <div>
                  <label className="text-xs text-gray-400 block mb-1.5 uppercase tracking-wider">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition text-white placeholder-gray-600 text-sm"
                    placeholder="filmmaker@example.com"
                    required
                  />
                </div>

                <div>
                  <label className="text-xs text-gray-400 block mb-1.5 uppercase tracking-wider">Password</label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 focus:border-red-500/50 focus:ring-2 focus:ring-red-500/20 transition text-white placeholder-gray-600 pr-12 text-sm"
                      placeholder="Create a password"
                      required
                      minLength={6}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute inset-y-0 right-3 flex items-center text-gray-500 hover:text-gray-300 transition"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <label className="flex items-start gap-3 text-xs text-gray-400 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-gray-700 bg-black/50 text-red-600 focus:ring-red-500/50"
                  />
                  <span>
                    I agree to the{" "}
                    <Link href="/terms" className="text-red-400 hover:text-red-300 underline underline-offset-2">
                      Terms
                    </Link>{" "}
                    and{" "}
                    <Link href="/privacy" className="text-red-400 hover:text-red-300 underline underline-offset-2">
                      Privacy Policy
                    </Link>
                  </span>
                </label>

                {error && (
                  <div className="text-sm text-red-400 bg-red-900/20 border border-red-800/50 rounded-xl p-3 transition-opacity duration-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white py-3 rounded-xl font-semibold transition disabled:opacity-60 shadow-lg shadow-red-900/30 hover:scale-[1.01] active:scale-95"
                >
                  {isLoading ? "Creating account..." : "Start Free Trial"}
                  <Play className="h-4 w-4" />
                </button>
              </form>

              <p className="text-center text-xs text-gray-500 mt-4">
                Already have an account?{" "}
                <Link href={buildSignInUrl()} className="text-red-400 hover:text-red-300 underline underline-offset-2">
                  Sign in
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default GetStartedModal;
