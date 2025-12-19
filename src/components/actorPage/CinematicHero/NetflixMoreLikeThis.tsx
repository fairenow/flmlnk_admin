'use client';

import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Play, Share2, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useNetflix } from './NetflixContext';

type Clip = {
  id: string;
  title: string;
  description?: string;
  thumbnail?: string;
  youtubeUrl?: string;
  duration?: string;
};

// Extend Window interface for GTM dataLayer
declare global {
  interface Window {
    dataLayer: any[];
  }
}

const NetflixMoreLikeThis: React.FC = () => {
  const { data } = useNetflix();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [activeClipId, setActiveClipId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  // Use episodes from context as clips
  const clips: Clip[] = data.episodes.map((episode) => ({
    id: episode.id,
    title: episode.title,
    thumbnail: episode.thumbnail || `https://img.youtube.com/vi/${episode.id}/hqdefault.jpg`,
    youtubeUrl: `https://www.youtube.com/watch?v=${episode.id}`,
  }));

  // Check for clip hash on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.startsWith('#clip-')) {
        const clipId = hash.replace('#clip-', '');
        const matchingClip = clips.find(c => c.id === clipId);
        if (matchingClip) {
          setActiveClipId(clipId);
          // Scroll to clip after a short delay
          setTimeout(() => {
            const clipElement = document.getElementById(`clip-${clipId}`);
            if (clipElement) {
              clipElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
          }, 300);
        }
      }
    }
  }, [clips]);

  const checkScroll = useCallback(() => {
    if (scrollContainerRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  }, []);

  useEffect(() => {
    checkScroll();
    window.addEventListener('resize', checkScroll);
    return () => window.removeEventListener('resize', checkScroll);
  }, [checkScroll]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollContainerRef.current) {
      const scrollAmount = scrollContainerRef.current.clientWidth * 0.8;
      scrollContainerRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth'
      });
      setTimeout(checkScroll, 300);
    }
  };

  const handlePlay = (clipId: string) => {
    setPlayingId(clipId);
    setActiveClipId(clipId);

    // Track clip play in GTM
    if (typeof window !== 'undefined') {
      window.dataLayer = window.dataLayer || [];
      window.dataLayer.push({
        event: 'clip_played',
        film_title: data.hero.title,
        clip_id: clipId,
      });
    }
  };

  const handleShare = async (clip: Clip, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const shareUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${window.location.pathname}#clip-${clip.id}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(clip.id);
      setTimeout(() => setCopiedId(null), 2000);

      // Track share in GTM
      if (typeof window !== 'undefined') {
        window.dataLayer = window.dataLayer || [];
        window.dataLayer.push({
          event: 'clip_shared',
          film_title: data.hero.title,
          clip_id: clip.id,
          clip_title: clip.title,
        });
      }
    } catch {
      // Fallback for older browsers
      const input = document.createElement('input');
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopiedId(clip.id);
      setTimeout(() => setCopiedId(null), 2000);
    }
  };

  if (clips.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="text-gray-400">No clips available yet.</p>
      </div>
    );
  }

  return (
    <div className="py-8 md:py-12">
      <div className="max-w-7xl mx-auto px-4 md:px-6 lg:px-12">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl md:text-3xl font-bold text-white">Clips & Shorts</h2>
          <span className="text-sm text-gray-500">
            {clips.length} clip{clips.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Scrollable Container with Navigation */}
        <div className="relative group">
          {/* Left Arrow */}
          {canScrollLeft && (
            <button
              onClick={() => scroll('left')}
              className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-black/80 hover:bg-black rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity -ml-4"
              aria-label="Scroll left"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
          )}

          {/* Right Arrow */}
          {canScrollRight && (
            <button
              onClick={() => scroll('right')}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-12 h-12 bg-black/80 hover:bg-black rounded-full flex items-center justify-center text-white opacity-0 group-hover:opacity-100 transition-opacity -mr-4"
              aria-label="Scroll right"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          )}

          {/* Clips Row */}
          <div
            ref={scrollContainerRef}
            onScroll={checkScroll}
            className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide"
            style={{
              scrollBehavior: 'smooth',
              scrollbarWidth: 'none',
              msOverflowStyle: 'none',
            }}
          >
            {clips.map((clip) => {
              const isPlaying = playingId === clip.id;
              const isCopied = copiedId === clip.id;
              const isActive = activeClipId === clip.id;

              return (
                <div
                  key={clip.id}
                  id={`clip-${clip.id}`}
                  className={`relative group/card flex-shrink-0 w-72 md:w-80 lg:w-96 rounded-xl overflow-hidden border transition-all duration-300 ${
                    isActive
                      ? 'border-carpet-red-500 ring-2 ring-carpet-red-500/50'
                      : 'border-gray-800 hover:border-gray-700'
                  }`}
                >
                  {/* Video/Thumbnail */}
                  <div className="relative aspect-video bg-gray-900">
                    {isPlaying ? (
                      <iframe
                        src={`https://www.youtube-nocookie.com/embed/${clip.id}?autoplay=1&enablejsapi=1&origin=${typeof window !== 'undefined' ? encodeURIComponent(window.location.origin) : ''}`}
                        title={clip.title}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="absolute inset-0 w-full h-full"
                      />
                    ) : (
                      <>
                        <img
                          src={clip.thumbnail}
                          alt={clip.title}
                          className="w-full h-full object-cover transition-transform duration-500 group-hover/card:scale-105"
                        />
                        {/* Play Button Overlay */}
                        <button
                          onClick={() => handlePlay(clip.id)}
                          className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover/card:opacity-100 transition-opacity"
                        >
                          <div className="w-16 h-16 bg-carpet-red-500 rounded-full flex items-center justify-center hover:bg-carpet-red-600 transition-colors hover:scale-110 duration-200">
                            <Play className="w-7 h-7 text-white ml-1" fill="currentColor" />
                          </div>
                        </button>
                        {/* Duration Badge */}
                        {clip.duration && (
                          <div className="absolute bottom-2 right-2 bg-black/80 px-1.5 py-0.5 rounded text-xs font-medium text-white">
                            {clip.duration}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Info */}
                  <div className="p-4 bg-gray-900/80">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-white line-clamp-1">
                          {clip.title}
                        </h3>
                        {clip.description && (
                          <p className="mt-1 text-sm text-gray-400 line-clamp-2">
                            {clip.description}
                          </p>
                        )}
                      </div>

                      {/* Share Button */}
                      <button
                        onClick={(e) => handleShare(clip, e)}
                        className={`flex-shrink-0 w-9 h-9 rounded-full border flex items-center justify-center transition-all ${
                          isCopied
                            ? 'border-green-500/50 bg-green-500/10 text-green-400'
                            : 'border-gray-700 bg-gray-800 text-gray-400 hover:text-white hover:border-gray-600'
                        }`}
                        title={isCopied ? 'Link copied!' : 'Share clip'}
                      >
                        {isCopied ? (
                          <Check className="w-4 h-4" />
                        ) : (
                          <Share2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <style jsx>{`
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
      `}</style>
    </div>
  );
};

export default NetflixMoreLikeThis;
