import type { FC, SVGProps, ReactNode } from "react";

const SocialIcon = ({
  children,
  ...props
}: SVGProps<SVGSVGElement> & { children: ReactNode }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="currentColor"
    viewBox="0 0 24 24"
    aria-hidden
    {...props}
  >
    {children}
  </svg>
);

const Linkedin = (props: SVGProps<SVGSVGElement>) => (
  <SocialIcon {...props}>
    <path d="M4.983 3.5c0 1.381-1.11 2.5-2.491 2.5C1.11 6 0 4.881 0 3.5S1.11 1 2.492 1C3.873 1 4.983 2.119 4.983 3.5z" />
    <path d="M.25 8.25h4.5V24h-4.5zM8.785 8.25H13.1v2.138h.062c.602-1.14 2.076-2.343 4.273-2.343C22.9 8.045 24 11.055 24 14.973V24h-4.5v-7.844c0-1.872-.033-4.282-2.608-4.282-2.61 0-3.01 2.037-3.01 4.147V24h-4.5z" />
  </SocialIcon>
);

const Facebook = (props: SVGProps<SVGSVGElement>) => (
  <SocialIcon {...props}>
    <path d="M22.675 0H1.325C.593 0 0 .593 0 1.326v21.348C0 23.407.593 24 1.325 24h11.495v-9.294H9.691v-3.622h3.129V8.413c0-3.1 1.893-4.788 4.659-4.788 1.325 0 2.463.099 2.794.143v3.24l-1.918.001c-1.504 0-1.796.715-1.796 1.764v2.313h3.587l-.467 3.622h-3.12V24h6.116C23.407 24 24 23.407 24 22.674V1.326C24 .593 23.407 0 22.675 0z" />
  </SocialIcon>
);

const Youtube = (props: SVGProps<SVGSVGElement>) => (
  <SocialIcon {...props}>
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" fillRule="evenodd" />
  </SocialIcon>
);

const Instagram = (props: SVGProps<SVGSVGElement>) => (
  <SocialIcon {...props}>
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </SocialIcon>
);

export const Footer: FC = () => {
  return (
    <footer className="bg-black text-gray-400 py-12 px-6 md:px-12 lg:px-16 border-t border-gray-900">
      <div className="max-w-7xl mx-auto">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <a
            href="https://flmlnk.com"
            target="_blank"
            rel="noopener noreferrer"
            className="block hover:opacity-80 transition-opacity"
          >
            <img
              src="/white_flmlnk.png"
              alt="FLMLNK"
              className="h-48 md:h-60 w-auto"
            />
          </a>
          <p className="text-gray-400 italic mt-2">Building your indie audience!</p>
        </div>

        {/* Social Links */}
        <div className="flex justify-center gap-8 mb-8">
          <a
            href="https://www.linkedin.com/company/flmlnk-inc/?viewAsMember=true"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            <Linkedin className="w-10 h-10" />
          </a>
          <a
            href="https://www.facebook.com/profile.php?viewas=100000686899395&id=61582944630409"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            <Facebook className="w-10 h-10" />
          </a>
          <a
            href="https://www.youtube.com/@FlmLnk"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            <Youtube className="w-10 h-10" />
          </a>
          <a
            href="https://x.com/FlmLnk93717"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            <svg className="w-10 h-10" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
          <a
            href="https://www.instagram.com/flmlnk/"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors"
          >
            <Instagram className="w-10 h-10" />
          </a>
        </div>

        {/* Legal */}
        <div className="border-t border-gray-900 pt-8">
          <div className="flex flex-wrap justify-center items-center gap-4 text-sm">
            <a href="/terms" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="/privacy" className="hover:text-white transition-colors">Privacy Policy</a>
            <span>© 2025 FLMLNK. All rights reserved.</span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
