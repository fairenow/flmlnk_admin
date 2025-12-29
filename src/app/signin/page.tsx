import { Suspense } from "react";
import { SignInContent } from "./signin-content";

export default function SigninPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#05040A]" />}>
      <SignInContent />
    </Suspense>
  );
}
