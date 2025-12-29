"use client";

import React, { ReactNode } from "react";
import { motion } from "framer-motion";
import { useOverview } from "./OverviewContext";
import { bentoCardVariants, softSpringTransition } from "./animations";
import type { FocusedComponent } from "./types";

interface BentoCardProps {
  id: string;
  componentType: FocusedComponent;
  children: ReactNode;
  className?: string;
  gridArea?: string;
  expandable?: boolean;
  noPadding?: boolean;
}

export function BentoCard({
  id,
  componentType,
  children,
  className = "",
  gridArea,
  expandable = true,
  noPadding = false,
}: BentoCardProps) {
  const { focusedComponent, setFocusedComponent, reducedMotion } = useOverview();

  const isExpanded = focusedComponent === componentType;
  const isOtherExpanded =
    focusedComponent !== "none" && focusedComponent !== componentType;

  const handleClick = () => {
    if (!expandable) return;
    setFocusedComponent(componentType);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!expandable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setFocusedComponent(componentType);
    }
    if (e.key === "Escape" && isExpanded) {
      setFocusedComponent("none");
    }
  };

  return (
    <motion.div
      id={id}
      layout={!reducedMotion}
      layoutId={reducedMotion ? undefined : id}
      variants={bentoCardVariants}
      initial="collapsed"
      animate={isExpanded ? "focused" : isOtherExpanded ? "collapsed" : "expanded"}
      transition={softSpringTransition}
      onClick={expandable ? handleClick : undefined}
      onKeyDown={expandable ? handleKeyDown : undefined}
      tabIndex={expandable ? 0 : undefined}
      role={expandable ? "button" : undefined}
      aria-expanded={expandable ? isExpanded : undefined}
      aria-label={expandable ? `${componentType} card, click to ${isExpanded ? "collapse" : "expand"}` : undefined}
      style={{ gridArea }}
      className={`
        relative overflow-hidden rounded-2xl
        border border-red-300 dark:border-red-900/40
        bg-white dark:bg-[#11141b]
        shadow-sm shadow-red-200/50 dark:shadow-red-950/30
        transition-colors duration-200
        ${expandable ? "cursor-pointer" : ""}
        ${isExpanded ? "ring-2 ring-red-500/30 dark:ring-red-500/20" : ""}
        ${isOtherExpanded ? "opacity-90" : ""}
        ${!noPadding ? "p-4" : ""}
        ${className}
      `}
    >
      {/* Subtle gradient overlay on hover */}
      {expandable && (
        <motion.div
          className="pointer-events-none absolute inset-0 bg-gradient-to-br from-red-500/0 to-red-500/0"
          whileHover={{
            background: "linear-gradient(to bottom right, rgba(220, 38, 38, 0.02), rgba(220, 38, 38, 0.05))"
          }}
          transition={{ duration: 0.2 }}
        />
      )}

      {/* Content */}
      <div className="relative z-10 h-full">{children}</div>

      {/* Expand indicator */}
      {expandable && !isExpanded && (
        <motion.div
          className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 opacity-0 dark:bg-red-900/40 dark:text-red-300"
          initial={{ opacity: 0, scale: 0.8 }}
          whileHover={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.15 }}
        >
          <svg
            className="h-3 w-3"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </motion.div>
      )}

      {/* Collapse indicator when expanded (skip for boost which has its own close button) */}
      {expandable && isExpanded && componentType !== "boost" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow-lg"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </motion.div>
      )}
    </motion.div>
  );
}
