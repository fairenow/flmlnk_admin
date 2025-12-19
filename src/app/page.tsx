"use client";

import type { ReactNode } from "react";
import {
  Children,
  CSSProperties,
  FormEvent,
  SVGProps,
  RefObject,
  cloneElement,
  isValidElement,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { signIn, signUp, sendVerificationEmail } from "@/lib/auth-client";
import { buildSignInUrl } from "@/lib/routes";
import { api } from "@convex/_generated/api";
import { GetStartedModal } from "@/components/GetStartedModal";

type InViewOptions = { once?: boolean; margin?: string };

const useInView = (ref: RefObject<Element>, options: InViewOptions = {}) => {
  const { once = false, margin = "0px" } = options;
  const [isInView, setIsInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setIsInView(false);
        }
      },
      { rootMargin: margin },
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [margin, once, ref]);

  return isInView;
};

const useScrollProgress = (target: RefObject<HTMLElement>) => {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const updateProgress = () => {
      const element = target.current;
      if (!element) return;

      const height = Math.max(element.offsetHeight, 1);
      const scrollTop = window.scrollY;
      const start = element.offsetTop;
      const value = (scrollTop - start) / height;
      setProgress(Math.min(Math.max(value, 0), 1));
    };

    updateProgress();
    window.addEventListener("scroll", updateProgress, { passive: true });
    window.addEventListener("resize", updateProgress);
    return () => {
      window.removeEventListener("scroll", updateProgress);
      window.removeEventListener("resize", updateProgress);
    };
  }, [target]);

  return progress;
};

const useTransform = (value: number, input: [number, number], output: [number | string, number | string]) =>
  useMemo(() => {
    const [inStart, inEnd] = input;
    const [outStart, outEnd] = output;
    const clamped = Math.min(Math.max(value, inStart), inEnd);
    const ratio = inEnd === inStart ? 0 : (clamped - inStart) / (inEnd - inStart);

    const interpolate = (from: number | string, to: number | string) => {
      if (typeof from === "number" && typeof to === "number") {
        return from + (to - from) * ratio;
      }

      return ratio > 0.5 ? to : from;
    };

    return [interpolate(outStart, outEnd)] as const;
  }, [input, output, value])[0];

type AnimatedSectionProps = { children: ReactNode; className?: string; delay?: number };

const AnimatedSection = ({ children, className = "", delay = 0 }: AnimatedSectionProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <div
      ref={ref}
      style={{
        opacity: isInView ? 1 : 0,
        transform: isInView ? "translateY(0)" : "translateY(60px)",
        transition: `opacity 0.8s ${delay}s ease, transform 0.8s ${delay}s ease`,
      }}
      className={className}
    >
      {children}
    </div>
  );
};

type StaggerContainerProps = { children: ReactNode; className?: string };

const StaggerContainer = ({ children, className = "" }: StaggerContainerProps) => {
  const ref = useRef<HTMLDivElement | null>(null);
  const isInView = useInView(ref, { once: true, margin: "-50px" });

  const staggered = Children.map(children, (child, index) => {
    if (!isValidElement(child)) return child;
    return cloneElement(child, { isInView, delay: index * 0.1 } as Partial<StaggerItemProps>);
  });

  return (
    <div ref={ref} className={className}>
      {staggered}
    </div>
  );
};

type StaggerItemProps = { children: ReactNode; className?: string; isInView?: boolean; delay?: number; style?: CSSProperties };

const StaggerItem = ({ children, className = "", isInView = false, delay = 0, style }: StaggerItemProps) => (
  <div
    className={className}
    style={{
      opacity: isInView ? 1 : 0,
      transform: isInView ? "translateY(0) scale(1)" : "translateY(30px) scale(0.95)",
      transition: `opacity 0.5s ${delay}s ease, transform 0.5s ${delay}s ease`,
      ...style,
    }}
  >
    {children}
  </div>
);

type FloatingElementProps = {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
};

const FloatingElement = ({ children, delay = 0, duration = 6, className = "" }: FloatingElementProps) => (
  <div
    className={className}
    style={{ animation: `floaty ${duration}s ease-in-out ${delay}s infinite` }}
  >
    {children}
  </div>
);

type IconProps = SVGProps<SVGSVGElement>;

const iconBase = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ArrowRight = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M5 12h14" />
    <path d="m13 6 6 6-6 6" />
  </svg>
);

const BarChart3 = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M4 20v-6" />
    <path d="M10 20V8" />
    <path d="M16 20V4" />
    <path d="M2 20h20" />
  </svg>
);

const Check = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M4 13.5 9 18l11-11" />
  </svg>
);

const ChevronDown = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="m6 9 6 6 6-6" />
  </svg>
);

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

const Film = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16M15 4v16" />
    <path d="M3 8h4M3 16h4M17 8h4M17 16h4" />
  </svg>
);

const Mail = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3 7 9 6 9-6" />
  </svg>
);

const MapPin = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M12 22s7-6.5 7-12a7 7 0 1 0-14 0c0 5.5 7 12 7 12Z" />
    <circle cx="12" cy="10" r="3" />
  </svg>
);

const Monitor = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <rect x="3" y="4" width="18" height="12" rx="2" />
    <path d="M8 20h8" />
    <path d="M12 16v4" />
  </svg>
);

const Play = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="m8 5 11 7-11 7Z" />
  </svg>
);

const Rocket = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M6 22c0-2.5.9-4.5 2.5-6l4.5 4.5C10.5 21.1 8.5 22 6 22Z" />
    <path d="M9 15s0-7 3-11c3 2 6 7 6 11a6 6 0 0 1-9 0Z" />
    <path d="M5 12c0-3 2-7 6-9" />
    <circle cx="13" cy="10" r="1.5" />
  </svg>
);

const Scissors = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <circle cx="6" cy="6" r="2" />
    <circle cx="6" cy="18" r="2" />
    <path d="M8 7 20 3l-7.5 7.5" />
    <path d="M8 17l5.5-5.5L20 21l-8-3" />
  </svg>
);

const Sparkles = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="m12 3 1.5 3.5L17 8 13.5 9.5 12 13l-1.5-3.5L7 8l3.5-1.5Z" />
    <path d="m5 13 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
    <path d="m18 14 1 2 2 1-2 1-1 2-1-2-2-1 2-1Z" />
  </svg>
);

const Target = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
  </svg>
);

const TrendingUp = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="m3 17 6-6 4 4 8-8" />
    <path d="M14 7h7v7" />
  </svg>
);

const Upload = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M4 17v3h16v-3" />
    <path d="M12 3v12" />
    <path d="m8 7 4-4 4 4" />
  </svg>
);

const Users = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <circle cx="9" cy="7" r="3.5" />
    <path d="M17 11a3 3 0 1 0-3-3" />
    <path d="M2 21a7 7 0 0 1 14 0" />
    <path d="M15 19a4 4 0 0 1 7 2" />
  </svg>
);

const Zap = (props: IconProps) => (
  <svg viewBox="0 0 24 24" {...iconBase} {...props}>
    <path d="M13 2 4 13h6l-1 9 9-11h-6Z" />
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

export default function HomePage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isGetStartedModalOpen, setIsGetStartedModalOpen] = useState(false);
  const [showVerificationMessage, setShowVerificationMessage] = useState(false);
  const [isResendingEmail, setIsResendingEmail] = useState(false);

  const router = useRouter();
  const onboardingStatus = useQuery(api.filmmakers.getOnboardingStatus, {});

  const heroRef = useRef<HTMLElement | null>(null);
  const scrollYProgress = useScrollProgress(heroRef);

  const heroY = useTransform(scrollYProgress, [0, 1], ["0%", "20%"]);
  const heroOpacity = useTransform(scrollYProgress, [0, 0.8], [1, 0.2]);
  const bgScale = useTransform(scrollYProgress, [0, 1], [1, 1.2]);

  useEffect(() => {
    if (!onboardingStatus?.isAuthenticated) return;

    const destination = onboardingStatus.hasProfile && onboardingStatus.slug
      ? "/dashboard/actor"
      : "/onboarding";

    router.replace(destination);
  }, [onboardingStatus, router]);

  const scrollToSignup = () => {
    // Check if we're on mobile (below lg breakpoint - 1024px)
    const isMobile = window.innerWidth < 1024;
    if (isMobile) {
      // Open modal on mobile
      setIsGetStartedModalOpen(true);
    } else {
      // Scroll to signup form on desktop
      document.getElementById("signup-form")?.scrollIntoView({ behavior: "smooth" });
    }
  };

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

  const resetSignupForm = () => {
    setShowVerificationMessage(false);
    setEmail("");
    setPassword("");
    setError(null);
  };

  const heroStats = useMemo(
    () => [
      { value: "156K", label: "Impressions" },
      { value: "55%+", label: "Engagement" },
      { value: "3 Days", label: "To Results" },
    ],
    [],
  );

  return (
    <div className="min-h-screen bg-black text-white font-sans overflow-x-hidden pb-20 lg:pb-0">
      <section ref={heroRef} className="relative min-h-screen flex flex-col">
        <div
          style={{ transform: `scale(${bgScale})`, transition: "transform 0.6s ease" }}
          className="absolute inset-0 bg-gradient-to-br from-black via-gray-950 to-black"
        />

        <div className="absolute inset-0 overflow-hidden">
          <FloatingElement
            delay={0}
            duration={8}
            className="absolute -top-20 -right-20 w-96 h-96 bg-red-600/20 rounded-full blur-[100px]"
          />
          <FloatingElement
            delay={2}
            duration={10}
            className="absolute top-1/3 -left-20 w-72 h-72 bg-red-900/20 rounded-full blur-[80px]"
          />
          <FloatingElement
            delay={4}
            duration={12}
            className="absolute bottom-20 right-1/4 w-64 h-64 bg-red-800/15 rounded-full blur-[60px]"
          />
        </div>

        <div
          className="absolute inset-0 opacity-[0.015] pointer-events-none"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
          }}
        />

        <nav className="relative z-20 flex items-center justify-between px-4 sm:px-6 lg:px-12 py-4 sm:py-6">
          <Link href="/" className="flex items-center gap-2 text-white">
            <Image
              src="/white_flmlnk.png"
              alt="FLMLNK"
              width={240}
              height={120}
              className="h-20 w-auto sm:h-24 lg:h-[120px]"
              priority
            />
          </Link>
          <div className="flex items-center gap-2 sm:gap-4 text-sm">
            <Link href="/how-it-works" className="hidden md:block text-white/60 hover:text-white transition">
              How It Works
            </Link>
            <Link href={buildSignInUrl()} className="text-white/60 hover:text-white transition">
              Sign In
            </Link>
            <button
              onClick={scrollToSignup}
              className="bg-red-600 hover:bg-red-500 text-white px-4 sm:px-5 py-2 rounded-lg font-medium transition-transform duration-200 hover:scale-[1.02] active:scale-95"
            >
              Get Started
            </button>
          </div>
        </nav>

        <div
          style={{
            transform: `translateY(${heroY})`,
            opacity: Number(heroOpacity),
            transition: "transform 0.3s ease, opacity 0.3s ease",
          }}
          className="relative z-10 flex-1 flex items-start pt-6 sm:pt-10 lg:pt-12"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12 pb-10 sm:pb-12 lg:pb-16 grid lg:grid-cols-2 gap-8 lg:gap-16 items-start w-full">
            <div className="space-y-6 sm:space-y-8">
              <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-red-600/10 border border-red-500/20 backdrop-blur-sm transition-transform duration-500 hover:scale-[1.01]">
                <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-red-400 text-xs sm:text-sm font-medium tracking-wide">Your Complete Film Marketing System</span>
              </div>

              <h1 className="font-cinematic text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl leading-[0.9] tracking-wide uppercase">
                <span className="text-white">Your Film</span>
                <br className="hidden sm:block" />
                <span className="text-white"> </span>
                <span className="text-red-500">Marketing,</span>
                <br className="hidden sm:block" />
                <span className="text-white">It's Done!</span>
              </h1>

              <p className="text-base sm:text-lg lg:text-xl text-gray-400 leading-relaxed max-w-xl font-light">
                One upload. Maximum reach. Zero complexity. FLMLNK automates your entire film marketing workflow—from inception through post-launch audience building.
              </p>

              <div className="grid grid-cols-3 gap-2 sm:gap-4 py-4 sm:py-6">
                {heroStats.map((stat, index) => (
                  <div
                    key={stat.label}
                    className="text-center p-3 sm:p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] backdrop-blur-sm"
                    style={{
                      transition: "opacity 0.6s ease, transform 0.6s ease",
                      transitionDelay: `${0.8 + index * 0.1}s`,
                    }}
                  >
                    <div className="font-cinematic text-2xl sm:text-3xl lg:text-4xl text-red-500 tracking-wider">{stat.value}</div>
                    <div className="text-xs sm:text-sm text-gray-500 mt-1">{stat.label}</div>
                  </div>
                ))}
              </div>

              <p className="text-xs sm:text-sm text-gray-600 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-red-500/50" />
                Real results from "Don't Come Looking" campaign
              </p>
            </div>

            {/* Desktop Sign Up Form - Hidden on mobile */}
            <div id="signup-form" className="relative hidden lg:block">
              <div className="absolute -inset-1 bg-gradient-to-r from-red-600/30 via-red-500/20 to-red-600/30 rounded-2xl blur-xl opacity-50" />

              <div className="relative bg-gray-950/80 backdrop-blur-xl border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl">
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
                          onClick={resetSignupForm}
                          className="text-red-400 hover:text-red-300 underline underline-offset-2"
                        >
                          Try again
                        </button>
                      </p>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="text-center mb-6">
                      <h2 className="font-cinematic text-2xl sm:text-3xl tracking-wider uppercase mb-2">Start Free</h2>
                      <p className="text-gray-400 text-sm">No credit card required. Launch in minutes.</p>
                    </div>

                    <button
                      onClick={handleGoogleSignIn}
                      disabled={isLoading}
                      className="w-full flex items-center justify-center gap-3 bg-white text-gray-900 py-3 rounded-xl font-medium transition disabled:opacity-60 hover:scale-[1.01] active:scale-95"
                    >
                      <GoogleIcon />
                      <span>{isLoading ? "Connecting..." : "Continue with Google"}</span>
                    </button>

                    <div className="my-6 flex items-center gap-4">
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
                      <span className="text-gray-500 text-xs uppercase tracking-wider">or</span>
                      <div className="flex-1 h-px bg-gradient-to-r from-transparent via-gray-700 to-transparent" />
                    </div>

                    <form className="space-y-4" onSubmit={handleEmailSignup}>
                      <div>
                        <label className="text-xs text-gray-400 block mb-1.5 uppercase tracking-wider">Email</label>
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition text-gray-900 placeholder-gray-500 text-sm"
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
                            className="w-full px-4 py-3 rounded-xl bg-white border border-gray-200 focus:border-red-500 focus:ring-2 focus:ring-red-500/20 transition text-gray-900 placeholder-gray-500 pr-12 text-sm"
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
                          className="mt-0.5 h-4 w-4 rounded border-gray-300 bg-white text-red-600 focus:ring-red-500/50"
                        />
                        <span>
                          I agree to the {" "}
                          <Link href="/terms" className="text-red-400 hover:text-red-300 underline underline-offset-2">
                            Terms
                          </Link>{" "}
                          and {" "}
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
                      Already have an account? {" "}
                      <Link href={buildSignInUrl()} className="text-red-400 hover:text-red-300 underline underline-offset-2">
                        Sign in
                      </Link>
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex justify-center pb-6 sm:pb-8">
          <div className="animate-bounce">
            <ChevronDown className="w-6 h-6 sm:w-8 sm:h-8 text-gray-600" />
          </div>
        </div>
      </section>

      <AnimatedSection className="bg-black border-y border-white/5 py-6 sm:py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-8 lg:gap-12">
            {[
              { icon: Users, text: "10,000+ Filmmakers" },
              { icon: Film, text: "Sundance & Cannes Alumni" },
              { icon: TrendingUp, text: "$2.5M+ Marketing Value" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-2 text-gray-400">
                <Icon className="w-4 h-4 sm:w-5 sm:h-5 text-red-500/70" />
                <span className="text-xs sm:text-sm">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </AnimatedSection>

      <section className="py-16 sm:py-24 lg:py-32 bg-black relative overflow-hidden">
        <FloatingElement
          delay={0}
          duration={15}
          className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-red-900/5 rounded-full blur-[150px]"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <AnimatedSection className="text-center max-w-3xl mx-auto mb-12 sm:mb-16">
            <h2 className="font-cinematic text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-wider uppercase mb-4 sm:mb-6">
              Hollywood Spends <span className="text-red-500">50%</span>
              <br className="hidden sm:block" />
              on Marketing
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-400 font-light">
              A $100K film needs $50K for marketing. A $1M film needs $500K. A $5M film needs $2.5M.
              <span className="text-white font-medium"> Most indie filmmakers have $0.</span>
            </p>
          </AnimatedSection>

          <StaggerContainer className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            <StaggerItem>
              <div className="h-full bg-gray-950/50 border border-white/5 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
                <div className="text-gray-500 text-xs uppercase tracking-[0.2em] mb-4">Hollywood Way</div>
                <div className="font-cinematic text-3xl sm:text-4xl lg:text-5xl text-gray-500 mb-6 tracking-wider">$50K - $2.5M</div>
                <ul className="space-y-3 text-gray-500 text-sm">
                  {["PR agencies & publicists", "Social media managers", "Paid advertising teams", "Email marketing specialists"].map((item) => (
                    <li key={item} className="flex items-center gap-3">
                      <span className="w-1 h-1 bg-gray-600 rounded-full" />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="relative h-full group">
                <div className="absolute -inset-0.5 bg-gradient-to-r from-red-600 to-red-800 rounded-2xl blur opacity-30 group-hover:opacity-50 transition duration-500" />
                <div className="relative h-full bg-black border-2 border-red-600/50 rounded-2xl p-6 sm:p-8">
                  <div className="text-red-500 text-xs uppercase tracking-[0.2em] mb-4">FLMLNK Way</div>
                  <div className="font-cinematic text-3xl sm:text-4xl lg:text-5xl text-white mb-1 tracking-wider">$0 - $799</div>
                  <div className="text-gray-500 text-sm mb-6">/year</div>
                  <ul className="space-y-3 text-gray-300 text-sm">
                    {[
                      "Automated social clips & posting",
                      "AI-powered email campaigns",
                      "Smart paid amplification",
                      "Cast & crew multiplier effect",
                    ].map((item) => (
                      <li key={item} className="flex items-center gap-3">
                        <Check className="w-4 h-4 text-red-500 flex-shrink-0" />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </StaggerItem>
          </StaggerContainer>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32 bg-gradient-to-b from-black via-gray-950/50 to-black relative overflow-hidden">
        <FloatingElement
          delay={3}
          duration={20}
          className="absolute bottom-0 right-0 w-[800px] h-[800px] bg-red-900/5 rounded-full blur-[200px]"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <AnimatedSection className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600/10 border border-red-500/20 mb-6">
              <Zap className="w-4 h-4 text-red-500" />
              <span className="text-red-400 text-xs sm:text-sm font-medium tracking-wide">Your Marketing System</span>
            </div>
            <h2 className="font-cinematic text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-wider uppercase mb-4 sm:mb-6">
              From Idea to Audience
              <br />
              <span className="text-red-500">Automated</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-2xl mx-auto font-light">
              FLMLNK is with you from the first spark of your idea through post-launch audience building.
            </p>
          </AnimatedSection>

          <StaggerContainer className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              { icon: Upload, step: "01", title: "Upload Content", description: "Upload your trailer, feature, or short in any format. We handle secure storage and processing." },
              { icon: Monitor, step: "02", title: "Netflix-Style Showcase", description: "Get a professional showcase page with built-in email capture that collects audience data." },
              { icon: Scissors, step: "03", title: "Auto Clips + Email", description: "AI generates optimized clips for social with auto-scheduling. Plus personalized email drip campaigns." },
              { icon: Rocket, step: "04", title: "Smart Boosting", description: "High-performing organic posts are automatically identified and converted into paid ads." },
              { icon: Users, step: "05", title: "Actor Multiplier", description: "Your cast gets their own pages to promote your project—turning them into marketing powerhouses." },
              { icon: BarChart3, step: "06", title: "Deep Analytics", description: "Track every impression, engagement, and conversion. Identify audience hotspots with precision." },
            ].map(({ icon: Icon, step, title, description }) => (
              <StaggerItem key={step}>
                <div className="group h-full bg-gray-950/50 border border-white/5 hover:border-red-600/30 hover:bg-gray-950/80 rounded-2xl p-5 sm:p-6 backdrop-blur-sm transition-all duration-300 hover:-translate-y-1">
                  <div className="flex items-center justify-between mb-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-600/10 rounded-xl flex items-center justify-center group-hover:bg-red-600/20 transition-colors">
                      <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                    </div>
                    <span className="font-cinematic text-3xl sm:text-4xl text-gray-800/50 group-hover:text-gray-700/50 transition-colors tracking-wider">{step}</span>
                  </div>
                  <h3 className="font-cinematic text-lg sm:text-xl tracking-wide uppercase mb-2">{title}</h3>
                  <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32 bg-black relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-r from-red-900/5 via-transparent to-red-900/5" />
        <FloatingElement
          delay={5}
          duration={18}
          className="absolute top-1/4 left-0 w-[500px] h-[500px] bg-red-900/10 rounded-full blur-[150px]"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <AnimatedSection className="text-center mb-12 sm:mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-red-600/10 border border-red-500/20 mb-6">
              <Target className="w-4 h-4 text-red-500" />
              <span className="text-red-400 text-xs sm:text-sm font-medium tracking-wide">Real Results</span>
            </div>
            <h2 className="font-cinematic text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-wider uppercase mb-4 sm:mb-6">
              Case Study
              <br />
              <span className="text-red-500">"Don't Come Looking"</span>
            </h2>
            <p className="text-base sm:text-lg lg:text-xl text-gray-400 max-w-2xl mx-auto font-light">
              How one independent thriller reached 156K people, achieved 55%+ engagement, and identified regional hotspots—all in just 3 days.
            </p>
          </AnimatedSection>

          <StaggerContainer className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-8 sm:mb-12">
            {[
              { value: "156K", label: "Impressions", icon: TrendingUp },
              { value: "86K", label: "Engagements", icon: Users },
              { value: "55%+", label: "Engagement Rate", icon: Target },
              { value: "3", label: "Hotspot States", icon: MapPin },
            ].map(({ value, label, icon: Icon }) => (
              <StaggerItem key={label}>
                <div className="bg-gray-950/50 border border-white/5 rounded-2xl p-4 sm:p-6 text-center backdrop-blur-sm transition-transform duration-200 hover:scale-[1.02]">
                  <Icon className="w-6 h-6 sm:w-8 sm:h-8 text-red-500/70 mx-auto mb-2 sm:mb-3" />
                  <div className="font-cinematic text-2xl sm:text-3xl lg:text-4xl text-white tracking-wider">{value}</div>
                  <div className="text-gray-500 text-xs sm:text-sm mt-1">{label}</div>
                </div>
              </StaggerItem>
            ))}
          </StaggerContainer>

          <AnimatedSection delay={0.2}>
            <div className="bg-gray-950/50 border border-white/5 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
              <h3 className="font-cinematic text-xl sm:text-2xl tracking-wider uppercase mb-6 sm:mb-8 text-center">Three-Phase Campaign</h3>
              <div className="grid md:grid-cols-3 gap-6 sm:gap-8">
                {[ 
                  { num: "1", title: "Awareness", desc: "Meta campaign builds initial audience with optimized targeting" },
                  { num: "2", title: "Engagement", desc: "Easter Egg Challenge retargets engaged viewers with $500 prize" },
                  { num: "3", title: "Conversion", desc: "Tubi conversion campaign drives streaming views at scale" },
                ].map(({ num, title, desc }) => (
                  <div key={num} className="text-center transition-transform duration-200 hover:-translate-y-1">
                    <div className="w-12 h-12 sm:w-14 sm:h-14 bg-red-600/10 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-500/20">
                      <span className="font-cinematic text-xl sm:text-2xl text-red-500">{num}</span>
                    </div>
                    <h4 className="font-cinematic text-lg sm:text-xl tracking-wide uppercase mb-2">{title}</h4>
                    <p className="text-gray-400 text-sm leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </AnimatedSection>

          <div className="text-center mt-6 sm:mt-8">
            <Link
              href="/case-study/dont-come-looking"
              className="inline-flex items-center gap-2 text-red-400 hover:text-red-300 transition text-sm group"
            >
              View Full Case Study
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32 bg-gradient-to-b from-black to-gray-950/50 relative overflow-hidden">
        <FloatingElement
          delay={2}
          duration={14}
          className="absolute top-1/2 right-0 w-[600px] h-[600px] bg-red-900/5 rounded-full blur-[180px]"
        />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <div className="grid lg:grid-cols-2 gap-8 sm:gap-12 items-center">
            <AnimatedSection>
              <h2 className="font-cinematic text-3xl sm:text-4xl md:text-5xl lg:text-6xl tracking-wider uppercase mb-4 sm:mb-6 leading-[0.95]">
                With You From <span className="text-red-500">Day One</span>
                <br />
                to <span className="text-red-500">Day Done</span>
              </h2>
              <p className="text-base sm:text-lg lg:text-xl text-gray-400 mb-6 sm:mb-8 font-light">
                Most marketing tools help after you've finished your film. FLMLNK is different—we're your partner from buzz to premiere and beyond.
              </p>

              <StaggerContainer className="space-y-4 sm:space-y-6">
                {[
                  { icon: Film, title: "Pre-Production", description: "Build anticipation with BTS content, casting announcements, and location reveals." },
                  { icon: Play, title: "Production", description: "Keep momentum with set photos, daily clips, and crew spotlights." },
                  { icon: Rocket, title: "Post-Production", description: "Launch your trailer with clips, email campaigns, and paid amplification ready." },
                  { icon: Mail, title: "Distribution & Beyond", description: "Nurture your audience for screenings, VOD releases, and your next project." },
                ].map(({ icon: Icon, title, description }) => (
                  <StaggerItem key={title}>
                    <div className="flex gap-4 transition-transform duration-200 hover:translate-x-1">
                      <div className="w-10 h-10 sm:w-12 sm:h-12 bg-red-600/10 rounded-xl flex items-center justify-center flex-shrink-0 border border-red-500/10">
                        <Icon className="w-5 h-5 sm:w-6 sm:h-6 text-red-500" />
                      </div>
                      <div>
                        <h3 className="font-cinematic text-base sm:text-lg tracking-wide uppercase mb-1">{title}</h3>
                        <p className="text-gray-400 text-sm leading-relaxed">{description}</p>
                      </div>
                    </div>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            </AnimatedSection>

            <AnimatedSection delay={0.2}>
              <div className="relative">
                <div className="absolute -inset-4 bg-gradient-to-r from-red-600/10 to-red-900/10 rounded-3xl blur-2xl" />
                <div className="relative bg-gray-950/80 border border-white/5 rounded-2xl p-6 sm:p-8 backdrop-blur-sm">
                  <Image
                    src="/white_flmlnk.png"
                    alt="FLMLNK"
                    width={200}
                    height={80}
                    className="h-12 w-auto sm:h-16 mx-auto mb-6 sm:mb-8 opacity-80"
                  />
                  <blockquote className="text-lg sm:text-xl text-gray-300 text-center italic mb-4 sm:mb-6 font-light leading-relaxed">
                    "Independent films can reach massive audiences with automated marketing. No Hollywood budget required—just smart automation."
                  </blockquote>
                  <div className="text-center text-gray-500 text-sm tracking-wide">— The FLMLNK Philosophy</div>
                </div>
              </div>
            </AnimatedSection>
          </div>
        </div>
      </section>

      <section className="py-16 sm:py-24 lg:py-32 bg-black relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-t from-red-900/10 via-transparent to-transparent" />
        <FloatingElement
          delay={0}
          duration={16}
          className="absolute bottom-0 left-1/3 w-[700px] h-[700px] bg-red-900/10 rounded-full blur-[200px]"
        />

        <AnimatedSection className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-12 text-center">
          <h2 className="font-cinematic text-3xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl tracking-wider uppercase mb-4 sm:mb-6 leading-[0.95]">
            Your Film Deserves
            <br />
            to Be <span className="text-red-500">Seen</span>
          </h2>
          <p className="text-base sm:text-lg lg:text-xl text-gray-400 mb-6 sm:mb-8 max-w-2xl mx-auto font-light">
            Join thousands of filmmakers using FLMLNK to automate their marketing. Start free—no credit card required.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <button
              onClick={scrollToSignup}
              className="w-full sm:w-auto bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition flex items-center justify-center gap-2 shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95"
            >
              Start Your Free Trial
              <ArrowRight className="w-5 h-5" />
            </button>
            <Link
              href="/how-it-works"
              className="w-full sm:w-auto border border-white/10 hover:border-white/20 hover:bg-white/5 text-white px-6 sm:px-8 py-3 sm:py-4 rounded-xl font-semibold text-base sm:text-lg transition text-center"
            >
              See How It Works
            </Link>
          </div>

          <p className="text-gray-600 text-xs sm:text-sm mt-6">
            Free tier available • Upgrade anytime • Cancel anytime
          </p>
        </AnimatedSection>
      </section>

      <footer className="bg-gray-950/50 border-t border-white/5 py-8 sm:py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-12">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4 sm:gap-6">
            <Image
              src="/white_flmlnk.png"
              alt="FLMLNK"
              width={160}
              height={64}
              className="h-6 w-auto sm:h-8 opacity-60"
            />
            <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-gray-500 text-xs sm:text-sm">
              <Link href="/how-it-works" className="hover:text-white transition">
                How It Works
              </Link>
              <Link href="/case-study/dont-come-looking" className="hover:text-white transition">
                Case Study
              </Link>
              <Link href="/terms" className="hover:text-white transition">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white transition">
                Privacy
              </Link>
            </div>
            <p className="text-gray-600 text-xs sm:text-sm">© {new Date().getFullYear()} FLMLNK</p>
          </div>
        </div>
      </footer>

      {/* Sticky Mobile CTA Bar - Only visible on mobile */}
      <div className="fixed bottom-0 left-0 right-0 z-50 lg:hidden bg-black/95 backdrop-blur-xl border-t border-white/10 px-4 py-3 safe-area-bottom">
        <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
          <div className="flex-1 min-w-0">
            <p className="text-white text-sm font-medium truncate">Start your free trial</p>
            <p className="text-gray-400 text-xs truncate">No credit card required</p>
          </div>
          <button
            onClick={() => setIsGetStartedModalOpen(true)}
            className="flex-shrink-0 bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition shadow-lg shadow-red-900/30 hover:scale-[1.02] active:scale-95"
          >
            Get Started
          </button>
        </div>
      </div>

      {/* Get Started Modal for Mobile */}
      <GetStartedModal
        isOpen={isGetStartedModalOpen}
        onClose={() => setIsGetStartedModalOpen(false)}
      />
    </div>
  );
}
