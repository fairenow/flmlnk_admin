"use client";

import Image from "next/image";
import Link from "next/link";
import { FormEvent, useState, useTransition } from "react";
import { forgetPassword } from "@/lib/auth-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(false);

    startTransition(async () => {
      try {
        const result = await forgetPassword({
          email,
          redirectTo: "/reset-password",
        });

        if (result.error) {
          setError(result.error.message ?? "Unable to send reset email.");
        } else {
          setSuccess(true);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Unable to send reset email.";
        setError(message);
      }
    });
  };

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
              Forgot Your
              <br />
              <span className="text-carpet-red-500">Password?</span>
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              No worries! Enter your email and we&apos;ll send you a link to reset
              your password.
            </p>

            {success ? (
              <div className="space-y-4">
                <div className="bg-green-50 border border-green-200 rounded-md p-4">
                  <p className="text-green-800 text-sm">
                    Check your email! We&apos;ve sent a password reset link to{" "}
                    <strong>{email}</strong>.
                  </p>
                </div>
                <p className="text-xs text-slate-500">
                  Didn&apos;t receive the email? Check your spam folder or{" "}
                  <button
                    type="button"
                    onClick={() => setSuccess(false)}
                    className="text-carpet-red-500 font-medium hover:underline"
                  >
                    try again
                  </button>
                  .
                </p>
                <Link
                  href="/signin"
                  className="inline-block text-sm text-carpet-red-500 font-medium hover:underline"
                >
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <div className="space-y-4">
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <div>
                    <input
                      type="email"
                      placeholder="Enter your email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none focus:border-carpet-red-500 focus:ring-1 focus:ring-carpet-red-500"
                      required
                    />
                  </div>
                  {error && <p className="text-xs text-red-500">{error}</p>}

                  <button
                    type="submit"
                    disabled={isPending}
                    className="w-full rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md disabled:opacity-60"
                  >
                    {isPending ? "Sending..." : "Send Reset Link"}
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
          </div>
        </main>
      </div>

      {/* RIGHT */}
      <div className="hidden lg:flex w-[50%] bg-gradient-to-br from-[#05040A] via-[#120014] to-[#190015] items-center justify-center">
        <div className="text-center px-12">
          <h2 className="text-3xl font-semibold text-white mb-4">
            Get Back to
            <br />
            <span className="text-carpet-red-500">Your Story</span>
          </h2>
          <p className="text-slate-400 text-sm">
            We&apos;ll help you reset your password so you can continue showcasing your work.
          </p>
        </div>
      </div>
    </div>
  );
}
