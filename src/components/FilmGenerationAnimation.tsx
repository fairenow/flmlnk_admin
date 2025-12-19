'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Film, Clapperboard, Play, Sparkles } from 'lucide-react';

interface FilmGenerationAnimationProps {
  onComplete: () => void;
}

const FilmGenerationAnimation: React.FC<FilmGenerationAnimationProps> = ({ onComplete }) => {
  const [currentPhase, setCurrentPhase] = useState(0);
  const [progress, setProgress] = useState(0);

  const phases = useMemo(() => [
    { text: "Assembling your footage...", duration: 1000 },
    { text: "Adding your details...", duration: 1000 },
    { text: "Creating your cinematic experience...", duration: 1000 },
    { text: "And... Action!", duration: 500 }
  ], []);

  // SSR-safe screen width
  const screenWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;

  // Generate stable random positions for particles
  const particlePositions = useMemo(() => {
    return [...Array(20)].map(() => ({
      left: Math.random() * 100,
      top: Math.random() * 100,
      delay: Math.random() * 2
    }));
  }, []);

  useEffect(() => {
    let phaseTimeout: ReturnType<typeof setTimeout>;
    let progressInterval: ReturnType<typeof setInterval>;

    const startPhase = (phaseIndex: number) => {
      if (phaseIndex >= phases.length) {
        setTimeout(() => onComplete(), 500);
        return;
      }

      setCurrentPhase(phaseIndex);
      setProgress(0);

      const duration = phases[phaseIndex].duration;
      const steps = 100;
      const stepDuration = duration / steps;

      progressInterval = setInterval(() => {
        setProgress(prev => {
          if (prev >= 100) {
            clearInterval(progressInterval);
            return 100;
          }
          return prev + (100 / steps);
        });
      }, stepDuration);

      phaseTimeout = setTimeout(() => {
        clearInterval(progressInterval);
        startPhase(phaseIndex + 1);
      }, duration);
    };

    startPhase(0);

    const fallbackTimeout = setTimeout(() => onComplete(), 5000);

    return () => {
      clearTimeout(phaseTimeout);
      clearInterval(progressInterval);
      clearTimeout(fallbackTimeout);
    };
  }, [onComplete, phases]);

  return (
    <div className="fixed inset-0 bg-black z-50 flex items-center justify-center overflow-hidden">
      {/* Film grain overlay */}
      <div className="absolute inset-0 opacity-20 bg-noise"></div>

      {/* Spotlight effect */}
      <motion.div
        className="absolute inset-0"
        style={{
          background: 'radial-gradient(circle at center, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.8) 70%)'
        }}
        animate={{
          scale: currentPhase === 3 ? [1, 1.2] : 1,
          opacity: currentPhase === 3 ? [0.8, 1] : 0.8
        }}
        transition={{ duration: 0.5 }}
      />

      {/* Main content */}
      <div className="relative z-10 text-center text-white">

        {/* Phase 0: Film Reel */}
        {currentPhase === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1, rotate: 360 }}
            transition={{
              opacity: { duration: 0.3 },
              scale: { duration: 0.3 },
              rotate: { duration: 2, repeat: Infinity, ease: "linear" }
            }}
            className="mb-8"
          >
            <Film size={80} className="mx-auto text-carpet-red-500" />
          </motion.div>
        )}

        {/* Phase 1: Clapperboard */}
        {currentPhase === 1 && (
          <motion.div
            initial={{ opacity: 0, y: -50 }}
            animate={{
              opacity: 1,
              y: 0,
              rotateX: [0, -15, 0]
            }}
            transition={{
              opacity: { duration: 0.3 },
              y: { duration: 0.3 },
              rotateX: { duration: 0.6, times: [0, 0.5, 1] }
            }}
            className="mb-8"
          >
            <Clapperboard size={80} className="mx-auto text-yellow-400" />
          </motion.div>
        )}

        {/* Phase 2: Film Strips */}
        {currentPhase === 2 && (
          <div className="mb-8 relative h-20">
            {[...Array(3)].map((_, i) => (
              <motion.div
                key={i}
                initial={{ x: -100, opacity: 0 }}
                animate={{
                  x: [screenWidth * -0.1, screenWidth * 1.1],
                  opacity: [0, 1, 1, 0]
                }}
                transition={{
                  duration: 2,
                  delay: i * 0.2,
                  times: [0, 0.1, 0.9, 1]
                }}
                className="absolute left-0"
                style={{ top: i * 24 }}
              >
                <div className="flex items-center gap-2">
                  <div className="w-12 h-8 bg-gray-700 rounded flex items-center justify-center">
                    <Play size={16} className="text-white" />
                  </div>
                  <div className="w-2 h-2 bg-carpet-red-500 rounded-full" />
                  <div className="w-2 h-2 bg-carpet-red-500 rounded-full" />
                  <div className="w-2 h-2 bg-carpet-red-500 rounded-full" />
                </div>
              </motion.div>
            ))}
            <Film size={80} className="mx-auto text-carpet-red-500 opacity-30" />
          </div>
        )}

        {/* Phase 3: Spotlight/Action */}
        {currentPhase === 3 && (
          <motion.div
            initial={{ opacity: 0, scale: 0 }}
            animate={{
              opacity: 1,
              scale: [0, 1.2, 1],
            }}
            transition={{
              duration: 0.8,
              times: [0, 0.6, 1]
            }}
            className="mb-8"
          >
            <div className="relative">
              <Sparkles size={80} className="mx-auto text-yellow-400" />
              <motion.div
                animate={{
                  scale: [1, 1.5, 1],
                  opacity: [0.8, 0.3, 0.8]
                }}
                transition={{
                  duration: 1,
                  repeat: Infinity,
                  ease: "easeInOut"
                }}
                className="absolute inset-0 bg-yellow-400 rounded-full blur-xl opacity-30"
              />
            </div>
          </motion.div>
        )}

        {/* Text */}
        <motion.h2
          key={currentPhase}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -20 }}
          transition={{ duration: 0.5 }}
          className="text-2xl lg:text-3xl font-bold mb-8"
        >
          {phases[currentPhase]?.text}
        </motion.h2>

        {/* Progress Bar */}
        <div className="max-w-md mx-auto">
          <div className="w-full bg-gray-800 rounded-full h-2 mb-4">
            <motion.div
              className="bg-gradient-to-r from-carpet-red-500 to-pink-500 h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${progress}%` }}
              transition={{ duration: 0.1 }}
            />
          </div>
          <p className="text-gray-400 text-sm">
            {Math.round(progress)}% complete
          </p>
        </div>

        {/* Floating particles */}
        <div className="absolute inset-0 pointer-events-none">
          {particlePositions.map((particle, i) => (
            <motion.div
              key={i}
              className="absolute w-1 h-1 bg-carpet-red-500 rounded-full"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
              }}
              animate={{
                y: [0, -100],
                opacity: [0, 1, 0],
                scale: [0, 1, 0]
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                delay: particle.delay,
                ease: "easeOut"
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default FilmGenerationAnimation;
