"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();

  useEffect(() => {
    // Redirect to signin - admin dashboard doesn't support signup
    router.replace("/signin");
  }, [router]);

  return (
    <div className="min-h-screen bg-admin-dark flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="w-8 h-8 text-admin-primary-400 animate-spin mx-auto mb-4" />
        <p className="text-slate-400 text-sm">Redirecting to sign in...</p>
      </div>
    </div>
  );
}
