"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Film, Sparkles, ImageIcon, Clapperboard } from "lucide-react";
import { useOverview } from "./OverviewContext";
import {
  fabMenuVariants,
  fabItemVariants,
  fabRotateVariants,
} from "./animations";
import type { AssetType } from "./types";

interface FloatingCreateButtonProps {
  slug: string;
  onNavigateToGenerator?: (type: AssetType) => void;
}

const CREATE_OPTIONS: {
  type: AssetType;
  label: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
}[] = [
  {
    type: "clip",
    label: "Create Clip",
    icon: Film,
    color: "#dc2626",
    bgColor: "bg-red-500",
  },
  {
    type: "meme",
    label: "Create Meme",
    icon: Sparkles,
    color: "#ea580c",
    bgColor: "bg-orange-500",
  },
  {
    type: "gif",
    label: "Create GIF",
    icon: ImageIcon,
    color: "#9333ea",
    bgColor: "bg-purple-500",
  },
  {
    type: "trailer",
    label: "Create Trailer",
    icon: Clapperboard,
    color: "#6366f1",
    bgColor: "bg-indigo-500",
  },
];

export function FloatingCreateButton({
  slug: _slug,
  onNavigateToGenerator,
}: FloatingCreateButtonProps) {
  const { fabExpanded, setFabExpanded, reducedMotion } = useOverview();

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setFabExpanded(!fabExpanded);
  };

  const handleOptionClick = (type: AssetType) => {
    setFabExpanded(false);
    onNavigateToGenerator?.(type);
  };

  return (
    <div
      className="fixed bottom-6 right-6 z-50"
      data-fab-menu
    >
      {/* Menu options */}
      <AnimatePresence>
        {fabExpanded && (
          <motion.div
            variants={reducedMotion ? undefined : fabMenuVariants}
            initial="closed"
            animate="open"
            exit="closed"
            className="absolute bottom-16 right-0 flex flex-col items-end gap-2"
          >
            {CREATE_OPTIONS.map((option, index) => (
              <motion.button
                key={option.type}
                type="button"
                variants={reducedMotion ? undefined : fabItemVariants}
                onClick={() => handleOptionClick(option.type)}
                className="group flex items-center gap-3"
                style={{ originX: 1 }}
              >
                {/* Label */}
                <motion.span
                  initial={{ opacity: 0, x: 10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 10 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white shadow-lg dark:bg-slate-800"
                >
                  {option.label}
                </motion.span>

                {/* Icon button */}
                <motion.div
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                  className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-lg transition-shadow ${option.bgColor} hover:shadow-xl`}
                  style={{
                    boxShadow: `0 4px 14px ${option.color}40`,
                  }}
                >
                  <option.icon className="h-5 w-5" />
                </motion.div>
              </motion.button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main FAB button */}
      <motion.button
        type="button"
        onClick={handleToggle}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-red-500 to-red-600 text-white shadow-lg shadow-red-500/40 transition-shadow hover:shadow-xl hover:shadow-red-500/50"
      >
        {/* Pulse ring when closed */}
        {!fabExpanded && (
          <motion.div
            className="absolute inset-0 rounded-full bg-red-500"
            initial={{ scale: 1, opacity: 0.5 }}
            animate={{
              scale: [1, 1.3, 1.3],
              opacity: [0.5, 0, 0],
            }}
            transition={{
              duration: 2,
              repeat: Infinity,
              ease: "easeOut",
            }}
          />
        )}

        {/* Icon with rotation */}
        <motion.div
          variants={reducedMotion ? undefined : fabRotateVariants}
          initial="closed"
          animate={fabExpanded ? "open" : "closed"}
        >
          <Plus className="h-6 w-6" />
        </motion.div>
      </motion.button>

      {/* Backdrop when expanded */}
      <AnimatePresence>
        {fabExpanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 -z-10 bg-black/10 backdrop-blur-[1px]"
            onClick={() => setFabExpanded(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
