"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { verifyEmail } from "@/lib/auth-client";

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams?.get("token") ?? "";

  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError("Invalid or missing verification token.");
      return;
    }

    const verify = async () => {
      try {
        const result = await verifyEmail({
          token,
        });

        if (result.error) {
          setStatus("error");
          setError(result.error.message ?? "Unable to verify email.");
        } else {
          setStatus("success");
          // Redirect to onboarding after 3 seconds
          setTimeout(() => {
            router.push("/onboarding");
          }, 3000);
        }
      } catch (err) {
        setStatus("error");
        const message =
          err instanceof Error ? err.message : "Unable to verify email.";
        setError(message);
      }
    };

    verify();
  }, [token, router]);

  return (
    <>
      {status === "loading" && (
        <div className="space-y-4">
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-carpet-red-500 border-t-transparent"></div>
          </div>
          <p className="text-center text-slate-600">
            Verifying your email address...
          </p>
        </div>
      )}

      {status === "success" && (
        <div className="space-y-4">
          <div className="bg-green-50 border border-green-200 rounded-md p-4">
            <div className="flex items-center gap-3">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
              <p className="text-green-800 text-sm font-medium">
                Email verified successfully!
              </p>
            </div>
          </div>
          <p className="text-slate-600 text-sm">
            Redirecting you to complete your profile...
          </p>
          <Link
            href="/onboarding"
            className="inline-block w-full text-center rounded-md bg-gradient-to-r from-black via-carpet-red-600 to-carpet-red-500 py-2.5 text-sm font-medium text-white shadow-md"
          >
            Continue to Onboarding
          </Link>
        </div>
      )}

      {status === "error" && (
        <div className="space-y-4">
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800 text-sm">
              {error || "Unable to verify your email. The link may have expired."}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            Need a new verification email?{" "}
            <Link
              href="/signin"
              className="text-carpet-red-500 font-medium hover:underline"
            >
              Sign in to request one
            </Link>
            .
          </p>
        </div>
      )}
    </>
  );
}

export default function VerifyEmailPage() {
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
              Verify Your
              <br />
              <span className="text-carpet-red-500">Email</span>
            </h1>
            <p className="text-sm text-slate-500 mb-6">
              We&apos;re confirming your email address to secure your account.
            </p>

            <Suspense
              fallback={
                <div className="space-y-4">
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-carpet-red-500 border-t-transparent"></div>
                  </div>
                  <p className="text-center text-slate-600">Loading...</p>
                </div>
              }
            >
              <VerifyEmailContent />
            </Suspense>
          </div>
        </main>
      </div>

      {/* RIGHT */}
      <div className="hidden lg:flex w-[50%] bg-gradient-to-br from-[#05040A] via-[#120014] to-[#190015] items-center justify-center">
        <div className="text-center px-12">
          <h2 className="text-3xl font-semibold text-white mb-4">
            One Step
            <br />
            <span className="text-carpet-red-500">Closer</span>
          </h2>
          <p className="text-slate-400 text-sm">
            Your email verification helps keep your account secure and your work protected.
          </p>
        </div>
      </div>
    </div>
  );
}
