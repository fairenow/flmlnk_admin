"use client";

import type { FC } from "react";
import { useCallback, useRef, useEffect } from "react";
import { Film, BookOpen, MessageSquare, Mail, Play } from "lucide-react";

export type TabKey = "about" | "comments" | "films" | "clips" | "contact";

type Tab = {
  key: TabKey;
  label: string;
  icon: typeof Film;
};

const TABS: Tab[] = [
  { key: "about", label: "About", icon: BookOpen },
  { key: "comments", label: "Comments", icon: MessageSquare },
  { key: "films", label: "Films", icon: Film },
  { key: "clips", label: "Clips & Reels", icon: Play },
  { key: "contact", label: "Contact", icon: Mail },
];

type TabNavigationProps = {
  activeTab: TabKey;
  onTabChange: (_tab: TabKey) => void;
  primaryColor?: string;
  commentCount?: number;
};

export const TabNavigation: FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
  primaryColor = "#FF1744",
  commentCount = 0,
}) => {
  const tabsRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);

  // Scroll active tab into view on mobile
  useEffect(() => {
    if (activeTabRef.current && tabsRef.current) {
      const container = tabsRef.current;
      const tab = activeTabRef.current;
      const containerRect = container.getBoundingClientRect();
      const tabRect = tab.getBoundingClientRect();

      // Center the active tab in the container
      const scrollLeft =
        tab.offsetLeft - containerRect.width / 2 + tabRect.width / 2;
      container.scrollTo({ left: scrollLeft, behavior: "smooth" });
    }
  }, [activeTab]);

  const handleTabClick = useCallback(
    (key: TabKey) => {
      onTabChange(key);
    },
    [onTabChange]
  );

  return (
    <nav className="sticky top-0 z-40 border-b border-gray-800 bg-black/95 backdrop-blur-md">
      <div className="mx-auto max-w-7xl px-4 md:px-6 lg:px-12">
        <div
          ref={tabsRef}
          className="flex overflow-x-auto scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0"
          style={{
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.key;
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                ref={isActive ? activeTabRef : null}
                type="button"
                onClick={() => handleTabClick(tab.key)}
                className={`
                  relative flex items-center gap-2 flex-shrink-0 px-4 md:px-8 py-3 md:py-4
                  text-sm md:text-base font-semibold whitespace-nowrap transition-all
                  focus:outline-none
                  ${
                    isActive
                      ? "text-white border-b-4"
                      : "text-gray-400 hover:text-white border-b-4 border-transparent"
                  }
                `}
                style={{
                  borderBottomColor: isActive ? primaryColor : 'transparent',
                }}
              >
                <Icon className="w-4 h-4 md:w-5 md:h-5" />
                <span>{tab.label}</span>
                {tab.key === "comments" && commentCount > 0 && (
                  <span
                    className="inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-xs font-semibold"
                    style={{
                      backgroundColor: isActive
                        ? primaryColor
                        : "rgba(255,255,255,0.1)",
                      color: isActive ? "white" : "rgba(255,255,255,0.6)",
                    }}
                  >
                    {commentCount > 99 ? "99+" : commentCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
};

export default TabNavigation;
