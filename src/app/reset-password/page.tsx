"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useState, useTransition, Suspense } from "react";
import { resetPassword } from "@/lib/auth-client";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!token) {
      setError("Invalid or missing reset token. Please request a new password reset link.");
      return;
    }

    startTransition(async () => {
      try {
        const result = await resetPassword({
          newPassword: password,
          token,
        });

        if (result.error) {
          setError(result.error.message ?? "Unable to reset password.");
        } else {
          setSuccess(true);
          // Redirect to signin after 3 seconds
          setTimeout(() => {
            router.push("/signin");
          }, 3000);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to reset password.";
        setError(message);
      }
    });
  };

  if (!token) {
    return (
      <div className="space-y-4">
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800 text-sm">
            Invalid or expired password reset link. Please request a new one.
          </p>
        </div>
        <Link
          href="/forgot-password"
          className="inline-block w-full text-center rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md"
        >
          Request New Reset Link
        </Link>
      </div>
    );
  }

  return (
    <>
      {success ? (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <p className="text-green-800 text-sm">
              Your password has been reset successfully! Redirecting to sign in...
            </p>
          </div>
          <Link
            href="/signin"
            className="inline-block w-full text-center rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md"
          >
            Sign In Now
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          <form className="space-y-3" onSubmit={handleSubmit}>
            <div>
              <input
                type="password"
                placeholder="New password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-carpet-red-500 focus:ring-1 focus:ring-carpet-red-500"
                required
                minLength={8}
              />
            </div>
            <div>
              <input
                type="password"
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-carpet-red-500 focus:ring-1 focus:ring-carpet-red-500"
                required
                minLength={8}
              />
            </div>
            <p className="text-xs text-slate-400">
              Password must be at least 8 characters long.
            </p>
            {error && <p className="text-xs text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={isPending}
              className="w-full rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60"
            >
              {isPending ? "Resetting..." : "Reset Password"}
            </button>
          </form>

          <p className="text-xs text-slate-500">
            Remember your password?{" "}
            <Link
              href="/signin"
              className="text-carpet-red-500 font-medium hover:underline"
            >
              Sign in
            </Link>
          </p>
        </div>
      )}
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-[#05040A] text-slate-900 flex">
      {/* LEFT */}
      <div className="w-full lg:w-[50%] bg-white flex flex-col [color-scheme:light]">
        <header className="px-8 pt-8 pb-4 flex items-center justify-between">
          <Link href="/" className="flex items-center">
            <Image
              src="/black_flmlnk.png"
              alt="FLMLNK logo"
              width={120}
              height={32}
            />
          </Link>
        </header>

        <main className="flex-1 px-8 pb-10 flex items-center">
          <div className="w-full max-w-md">
            <h1 className="text-4xl md:text-[2.6rem] font-semibold leading-tight mb-3">
              Create a
              <br />
              <span className="text-carpet-red-500">New Password</span>
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              Enter your new password below. Make sure it&apos;s strong and unique.
            </p>

            <Suspense
              fallback={
                <div className="animate-pulse space-y-3">
                  <div className="h-10 bg-slate-200 rounded-md"></div>
                  <div className="h-10 bg-slate-200 rounded-md"></div>
                  <div className="h-10 bg-slate-300 rounded-md"></div>
                </div>
              }
            >
              <ResetPasswordForm />
            </Suspense>
          </div>
        </main>
      </div>

      {/* RIGHT */}
      <div className="hidden lg:flex w-[50%] bg-gradient-to-br from-[#05040A] via-[#120014] to-[#190015] items-center justify-center">
        <div className="text-center px-12">
          <h2 className="text-3xl font-semibold text-white mb-4">
            Almost There!
            <br />
            <span className="text-carpet-red-500">Stay Secure</span>
          </h2>
          <p className="text-slate-400 text-sm">
            Choose a strong password to keep your account safe.
          </p>
        </div>
      </div>
    </div>
  );
}
