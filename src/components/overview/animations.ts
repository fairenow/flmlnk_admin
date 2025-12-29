import type { Variants, Transition } from "framer-motion";

// Spring physics for natural feel
export const springTransition: Transition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

export const softSpringTransition: Transition = {
  type: "spring",
  stiffness: 200,
  damping: 25,
};

export const gentleSpringTransition: Transition = {
  type: "spring",
  stiffness: 150,
  damping: 20,
};

// Bento card expansion variants
export const bentoCardVariants: Variants = {
  collapsed: {
    scale: 1,
    zIndex: 1,
  },
  expanded: {
    scale: 1,
    zIndex: 10,
  },
  focused: {
    scale: 1.01,
    zIndex: 20,
    boxShadow: "0 20px 40px rgba(220, 38, 38, 0.15)",
  },
};

// Staggered children animation
export const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.08,
      delayChildren: 0.1,
    },
  },
};

export const staggerItem: Variants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: springTransition,
  },
};

// Pulse/glow effect for connected elements
export const pulseGlow: Variants = {
  idle: {
    boxShadow: "0 0 0 0 rgba(220, 38, 38, 0)",
  },
  active: {
    boxShadow: [
      "0 0 0 0 rgba(220, 38, 38, 0.4)",
      "0 0 0 8px rgba(220, 38, 38, 0)",
    ],
    transition: {
      duration: 1,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Highlight glow for connected elements
export const highlightGlow: Variants = {
  idle: {
    boxShadow: "0 0 0 0 rgba(220, 38, 38, 0)",
    borderColor: "rgba(220, 38, 38, 0.2)",
  },
  active: {
    boxShadow: "0 0 20px 4px rgba(220, 38, 38, 0.3)",
    borderColor: "rgba(220, 38, 38, 0.6)",
    transition: {
      duration: 0.3,
    },
  },
};

// FAB expand animation
export const fabMenuVariants: Variants = {
  closed: {
    scale: 0,
    opacity: 0,
    y: 20,
  },
  open: {
    scale: 1,
    opacity: 1,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
      staggerChildren: 0.05,
    },
  },
};

export const fabItemVariants: Variants = {
  closed: {
    scale: 0,
    opacity: 0,
    x: 20,
  },
  open: {
    scale: 1,
    opacity: 1,
    x: 0,
    transition: {
      type: "spring",
      stiffness: 500,
      damping: 30
    },
  },
};

// FAB button rotation
export const fabRotateVariants: Variants = {
  closed: { rotate: 0 },
  open: {
    rotate: 45,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
};

// New asset "fly in" animation
export const flyInVariants: Variants = {
  initial: {
    scale: 0.3,
    opacity: 0,
    x: 100,
    y: 100,
  },
  animate: {
    scale: 1,
    opacity: 1,
    x: 0,
    y: 0,
    transition: {
      type: "spring",
      stiffness: 100,
      damping: 15,
      duration: 0.8,
    },
  },
  exit: {
    scale: 0.8,
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Ripple effect for grid landing
export const rippleVariants: Variants = {
  initial: {
    scale: 0,
    opacity: 0.6,
  },
  animate: {
    scale: 2.5,
    opacity: 0,
    transition: {
      duration: 0.6,
      ease: "easeOut",
    },
  },
};

// Connection line draw animation
export const connectionLineVariants: Variants = {
  hidden: {
    pathLength: 0,
    opacity: 0,
  },
  visible: {
    pathLength: 1,
    opacity: 0.6,
    transition: {
      pathLength: { duration: 0.4, ease: "easeInOut" },
      opacity: { duration: 0.2 },
    },
  },
  exit: {
    pathLength: 0,
    opacity: 0,
    transition: {
      duration: 0.2,
    },
  },
};

// Card hover effect
export const cardHoverVariants: Variants = {
  idle: {
    y: 0,
    boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
  },
  hover: {
    y: -4,
    boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.1)",
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
};

// Reduced motion alternatives
export const reducedMotionVariants: Variants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.15 }
  },
};

// Chart tooltip fade
export const tooltipVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
    y: 5,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      duration: 0.15,
    },
  },
};

// Time range button variants
export const timeRangeVariants: Variants = {
  inactive: {
    backgroundColor: "rgba(241, 245, 249, 1)", // slate-100
    color: "rgba(71, 85, 105, 1)", // slate-600
  },
  active: {
    backgroundColor: "rgba(220, 38, 38, 1)", // red-600
    color: "rgba(255, 255, 255, 1)",
  },
};

// Metric card variants for MetricsSummary
export const metricCardVariants: Variants = {
  idle: {
    scale: 1,
    borderColor: "rgba(252, 165, 165, 0.3)", // red-300/30
  },
  hover: {
    scale: 1.02,
    borderColor: "rgba(220, 38, 38, 0.5)", // red-600/50
    transition: springTransition,
  },
  active: {
    scale: 1,
    borderColor: "rgba(220, 38, 38, 0.8)", // red-600/80
    boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.2)",
  },
};

// YouTube thumbnail hover
export const youtubeThumbnailVariants: Variants = {
  idle: {
    scale: 1,
  },
  hover: {
    scale: 1.03,
    transition: softSpringTransition,
  },
};

// Play button pulse
export const playButtonVariants: Variants = {
  idle: {
    scale: 1,
    opacity: 0,
  },
  hover: {
    scale: 1,
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
  pulse: {
    scale: [1, 1.1, 1],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

// Asset grid item variants
export const assetGridItemVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: springTransition,
  },
  hover: {
    scale: 1.05,
    zIndex: 10,
    transition: {
      type: "spring",
      stiffness: 400,
      damping: 25,
    },
  },
  highlighted: {
    scale: 1.05,
    boxShadow: "0 0 20px 4px rgba(220, 38, 38, 0.4)",
    borderColor: "rgba(220, 38, 38, 0.8)",
  },
};

// Overlay fade variants
export const overlayVariants: Variants = {
  hidden: {
    opacity: 0,
  },
  visible: {
    opacity: 1,
    transition: {
      duration: 0.2,
    },
  },
};
