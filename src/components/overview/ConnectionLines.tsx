"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useOverview } from "./OverviewContext";
import { connectionLineVariants } from "./animations";
import type { RefObject } from "react";

interface ConnectionLinesProps {
  containerRef: RefObject<HTMLDivElement>;
}

interface LinePosition {
  id: string;
  path: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export function ConnectionLines({ containerRef }: ConnectionLinesProps) {
  const {
    hoveredAsset,
    hoveredDate,
    reducedMotion,
  } = useOverview();

  const [lines, setLines] = useState<LinePosition[]>([]);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const rafRef = useRef<number | null>(null);

  // Don't render on mobile or if reduced motion is preferred
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Calculate line positions based on DOM elements
  const calculateLines = useCallback(() => {
    if (!containerRef.current || isMobile || reducedMotion) {
      setLines([]);
      return;
    }

    const containerRect = containerRef.current.getBoundingClientRect();
    setDimensions({
      width: containerRect.width,
      height: containerRect.height,
    });

    const newLines: LinePosition[] = [];

    // If hovering an asset, draw line to chart
    if (hoveredAsset) {
      const assetEl = document.getElementById(`asset-${hoveredAsset.id}`);
      const chartEl = document.getElementById("bento-chart");

      if (assetEl && chartEl) {
        const assetRect = assetEl.getBoundingClientRect();
        const chartRect = chartEl.getBoundingClientRect();

        const fromX = assetRect.left + assetRect.width / 2 - containerRect.left;
        const fromY = assetRect.top + assetRect.height / 2 - containerRect.top;
        const toX = chartRect.left + chartRect.width / 2 - containerRect.left;
        const toY = chartRect.top + chartRect.height / 2 - containerRect.top;

        // Create curved path
        const midX = (fromX + toX) / 2;
        const midY = Math.min(fromY, toY) - 30;
        const path = `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`;

        newLines.push({
          id: `asset-chart-${hoveredAsset.id}`,
          path,
          fromX,
          fromY,
          toX,
          toY,
        });
      }
    }

    // If hovering a date on chart, draw lines to matching assets
    if (hoveredDate) {
      const chartEl = document.getElementById("bento-chart");
      if (chartEl) {
        const chartRect = chartEl.getBoundingClientRect();
        const chartX = chartRect.left + chartRect.width / 2 - containerRect.left;
        const chartY = chartRect.top + chartRect.height / 2 - containerRect.top;

        // Find all assets with matching date
        const assetElements = document.querySelectorAll('[id^="asset-"]');
        assetElements.forEach((el) => {
          const assetRect = el.getBoundingClientRect();
          const fromX = chartX;
          const fromY = chartY;
          const toX = assetRect.left + assetRect.width / 2 - containerRect.left;
          const toY = assetRect.top + assetRect.height / 2 - containerRect.top;

          // Only draw if we're actually highlighting this element
          // (the parent component handles the highlighting logic)
          const midX = (fromX + toX) / 2;
          const midY = Math.min(fromY, toY) - 20;
          const path = `M ${fromX} ${fromY} Q ${midX} ${midY} ${toX} ${toY}`;

          newLines.push({
            id: `chart-${el.id}`,
            path,
            fromX,
            fromY,
            toX,
            toY,
          });
        });
      }
    }

    setLines(newLines);
  }, [containerRef, hoveredAsset, hoveredDate, isMobile, reducedMotion]);

  // Throttled calculation on hover changes
  useEffect(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    rafRef.current = requestAnimationFrame(calculateLines);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [calculateLines]);

  // Don't render if mobile, reduced motion, or no lines to draw
  if (isMobile || reducedMotion || lines.length === 0) {
    return null;
  }

  return (
    <svg
      className="pointer-events-none absolute inset-0 z-50 overflow-visible"
      width={dimensions.width}
      height={dimensions.height}
      style={{ left: 0, top: 0 }}
    >
      <defs>
        {/* Gradient for lines */}
        <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#dc2626" stopOpacity="0.2" />
          <stop offset="50%" stopColor="#dc2626" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#dc2626" stopOpacity="0.2" />
        </linearGradient>

        {/* Glow filter */}
        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="3" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        {/* Animated dash pattern */}
        <pattern
          id="dashPattern"
          patternUnits="userSpaceOnUse"
          width="10"
          height="1"
        >
          <rect width="6" height="1" fill="#dc2626" opacity="0.6" />
        </pattern>
      </defs>

      <AnimatePresence>
        {lines.slice(0, 5).map((line) => (
          <motion.g key={line.id}>
            {/* Main line with glow */}
            <motion.path
              d={line.path}
              fill="none"
              stroke="url(#connectionGradient)"
              strokeWidth="2"
              strokeLinecap="round"
              filter="url(#glow)"
              variants={connectionLineVariants}
              initial="hidden"
              animate="visible"
              exit="exit"
            />

            {/* Animated particles along path */}
            <motion.circle
              r="3"
              fill="#dc2626"
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0, 1, 0],
                offsetDistance: ["0%", "100%"],
              }}
              transition={{
                duration: 1.5,
                repeat: Infinity,
                ease: "linear",
              }}
              style={{
                offsetPath: `path("${line.path}")`,
              }}
            />

            {/* Start point pulse */}
            <motion.circle
              cx={line.fromX}
              cy={line.fromY}
              r="4"
              fill="#dc2626"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.8, 0.4, 0.8],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />

            {/* End point pulse */}
            <motion.circle
              cx={line.toX}
              cy={line.toY}
              r="4"
              fill="#dc2626"
              initial={{ scale: 0, opacity: 0 }}
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.8, 0.4, 0.8],
              }}
              transition={{
                duration: 1,
                repeat: Infinity,
                ease: "easeInOut",
                delay: 0.5,
              }}
            />
          </motion.g>
        ))}
      </AnimatePresence>
    </svg>
  );
}
