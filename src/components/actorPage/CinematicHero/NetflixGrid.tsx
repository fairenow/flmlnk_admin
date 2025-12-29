'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Film,
  BookOpen,
  Play,
  Video,
  Briefcase,
  CheckCircle,
  Theater,
  Tv,
  Send,
  Linkedin,
  Instagram,
  Twitter,
  Clapperboard,
  ExternalLink,
  Mail,
  MessageSquare
} from 'lucide-react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '@convex/_generated/api';
import type { Id, Doc } from '@convex/_generated/dataModel';
import { useNetflix } from './NetflixContext';
import NetflixMoreLikeThis from './NetflixMoreLikeThis';
import { CommentCard } from '../CommentCard';
import { CommentEmailModal } from '../CommentEmailModal';

// Extend Window interface for GTM dataLayer
declare global {
  interface Window {
    dataLayer: any[];
  }
}

type TabType = 'about' | 'comments' | 'shorts' | 'contact';

type Comment = Doc<"comments"> & {
  replies: Doc<"comments">[];
};

type NetflixGridProps = {
  actorProfileId: Id<"actor_profiles">;
  actorName: string;
  primaryColor?: string;
};

const NetflixGrid: React.FC<NetflixGridProps> = ({
  actorProfileId,
  actorName,
  primaryColor = "#FF1744",
}) => {
  const { data, setShowEmailModal } = useNetflix();
  const [activeTab, setActiveTab] = useState<TabType>('comments');
  const [showCommentModal, setShowCommentModal] = useState(false);
  const [replyingTo, setReplyingTo] = useState<{ id: Id<"comments">; name: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [inquiryFeedback, setInquiryFeedback] = useState<
    { type: 'success' | 'error' | 'info'; message: string } | null
  >(null);

  // Convex queries and mutations
  const comments = useQuery(api.comments.getByActorProfile, { actorProfileId });
  const submitComment = useMutation(api.comments.submit);
  const likeComment = useMutation(api.comments.like);

  const socialLinks: Array<{
    name: string;
    handle: string;
    href: string;
    icon: React.ElementType;
  }> = [
    {
      name: 'LinkedIn',
      handle: actorName,
      href: `https://www.linkedin.com/search/results/all/?keywords=${encodeURIComponent(actorName)}`,
      icon: Linkedin
    },
    {
      name: 'X (Twitter)',
      handle: '@profile',
      href: 'https://x.com',
      icon: Twitter
    },
    {
      name: 'IMDb',
      handle: actorName,
      href: 'https://www.imdb.com',
      icon: Clapperboard
    },
    {
      name: 'Instagram',
      handle: '@profile',
      href: 'https://www.instagram.com',
      icon: Instagram
    }
  ];

  // Check for clip hash on mount and switch to shorts tab if needed
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash;
      if (hash.startsWith('#clip-')) {
        setActiveTab('shorts');
      }
    }
  }, []);

  const handleOpenCommentModal = useCallback(() => {
    setReplyingTo(null);
    setShowCommentModal(true);
  }, []);

  const handleCloseCommentModal = useCallback(() => {
    setShowCommentModal(false);
    setReplyingTo(null);
  }, []);

  const handleReply = useCallback((commentId: Id<"comments">, replyToName: string) => {
    setReplyingTo({ id: commentId, name: replyToName });
    setShowCommentModal(true);
  }, []);

  const handleLike = useCallback(
    async (commentId: Id<"comments">) => {
      try {
        await likeComment({ commentId });

        // Track like event in GTM
        if (typeof window !== 'undefined') {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: 'comment_liked',
            film_title: data.hero.title,
            comment_id: commentId
          });
        }
      } catch (error) {
        console.error("Failed to like comment:", error);
      }
    },
    [likeComment, data.hero.title]
  );

  const handleSubmitComment = useCallback(
    async (formData: { name: string; email: string; message: string }) => {
      setIsSubmitting(true);
      try {
        await submitComment({
          actorProfileId,
          name: formData.name,
          email: formData.email,
          message: formData.message,
          parentId: replyingTo?.id,
        });
        handleCloseCommentModal();

        // Track comment submission in GTM
        if (typeof window !== 'undefined') {
          window.dataLayer = window.dataLayer || [];
          window.dataLayer.push({
            event: replyingTo ? 'reply_posted' : 'comment_posted',
            film_title: data.hero.title,
            user_name: formData.name,
            comment_length: formData.message.length
          });
        }
      } catch (error) {
        console.error("Failed to submit comment:", error);
      } finally {
        setIsSubmitting(false);
      }
    },
    [submitComment, actorProfileId, replyingTo, handleCloseCommentModal, data.hero.title]
  );

  const handleSubmitInquiry = useCallback(() => {
    setInquiryFeedback({
      type: 'info',
      message: 'Please sign up to submit an inquiry.'
    });
    setShowEmailModal(true);
  }, [setShowEmailModal]);

  // Calculate actor response statistics
  const actorResponseStats = useMemo(() => {
    if (!comments || comments.length === 0) {
      return { totalTopLevelComments: 0, respondedCount: 0, responseRate: 0 };
    }

    const totalTopLevelComments = comments.length;
    let respondedCount = 0;

    comments.forEach((comment: Comment) => {
      // Check if actor has replied (simple heuristic - name matches actor name)
      const hasActorReply = comment.replies.some(
        (reply) => reply.name.toLowerCase() === actorName.toLowerCase()
      );
      if (hasActorReply) {
        respondedCount++;
      }
    });

    const responseRate = totalTopLevelComments > 0
      ? (respondedCount / totalTopLevelComments) * 100
      : 0;

    return { totalTopLevelComments, respondedCount, responseRate };
  }, [comments, actorName]);

  const formattedActorResponseRate = useMemo(() => {
    if (!actorResponseStats.totalTopLevelComments) {
      return '0%';
    }
    const decimals = actorResponseStats.responseRate % 1 === 0 ? 0 : 1;
    return `${actorResponseStats.responseRate.toFixed(decimals)}%`;
  }, [actorResponseStats]);

  const tabs = [
    { id: 'about' as TabType, label: 'About the Actor', icon: BookOpen },
    { id: 'shorts' as TabType, label: 'Clips', icon: Play },
    { id: 'comments' as TabType, label: 'Comments', icon: MessageSquare },
    { id: 'contact' as TabType, label: 'Contact Me', icon: Mail }
  ];

  const isLoading = comments === undefined;

  return (
    <section className="bg-black text-white py-8 md:py-16 px-4 md:px-6 lg:px-12">
      <div className="max-w-7xl mx-auto">

        {/* Tab Navigation */}
        <div className="sticky top-0 z-30 -mx-4 px-4 bg-black/95 backdrop-blur shadow-lg shadow-black/30 md:static md:z-auto md:-mx-0 md:px-0 md:bg-transparent md:shadow-none">
          <div className="flex border-b border-gray-800 mb-8 md:mb-12 overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);

                    // Track tab change in GTM
                    if (typeof window !== 'undefined') {
                      window.dataLayer = window.dataLayer || [];
                      window.dataLayer.push({
                        event: 'tab_changed',
                        film_title: data.hero.title,
                        tab_name: tab.label,
                        tab_id: tab.id
                      });
                    }
                  }}
                  className={`flex items-center gap-2 px-4 md:px-8 py-3 md:py-4 font-semibold text-sm md:text-base transition-all whitespace-nowrap ${
                    activeTab === tab.id
                      ? 'text-white border-b-4'
                      : 'text-gray-400 hover:text-white'
                  }`}
                  style={activeTab === tab.id ? { borderBottomColor: primaryColor } : {}}
                >
                  <Icon className="w-4 h-4 md:w-5 md:h-5" />
                  {tab.label}
                  {tab.id === 'comments' && comments && comments.length > 0 && (
                    <span
                      className="ml-1 px-1.5 py-0.5 text-xs rounded-full"
                      style={{ backgroundColor: primaryColor }}
                    >
                      {comments.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* About the Actor Tab */}
        {activeTab === 'about' && (
          <div className="animate-fadeIn">
            <div className="space-y-8">
              <div className="grid md:grid-cols-2 gap-8">
                {/* Personal Story */}
                <div>
                  {/* Actor Photo */}
                  <div className="mb-6">
                    <div className="relative group inline-block">
                      <div
                        className="absolute -inset-0.5 rounded-full blur opacity-50 group-hover:opacity-75 transition duration-1000"
                        style={{ background: `linear-gradient(to right, ${primaryColor}, #db2777)` }}
                      />
                      <img
                        src={data.profile.actor.profileImage}
                        alt={data.profile.actor.name}
                        className="relative w-24 h-24 md:w-32 md:h-32 rounded-full object-cover border-4 border-black"
                      />
                    </div>
                  </div>

                  <h3 className="text-2xl font-bold text-white mb-4">About {data.profile.actor.name}</h3>
                  <div className="space-y-4 text-gray-300">
                    {data.profile.actor.bio.map((paragraph, index) => (
                      <p key={index}>{paragraph}</p>
                    ))}
                  </div>

                  {data.profile.actor.philosophy && (
                    <div className="mt-6">
                      <h4 className="text-lg font-semibold text-white mb-3">Acting Philosophy</h4>
                      <p className="text-gray-300 italic">
                        &quot;{data.profile.actor.philosophy}&quot;
                      </p>
                    </div>
                  )}
                </div>

                {/* Career Highlights & Stats */}
                <div>
                  <h3 className="text-2xl font-bold text-white mb-4">Career Highlights</h3>
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ background: `linear-gradient(to bottom right, ${primaryColor}, #db2777)` }}
                      >
                        <Film className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold">Film & Theater Productions</h4>
                        <p className="text-gray-400 text-sm">Dynamic range across genres</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ background: `linear-gradient(to bottom right, ${primaryColor}, #db2777)` }}
                      >
                        <Video className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold">Content Creator</h4>
                        <p className="text-gray-400 text-sm">Developing bold, independent content</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div
                        className="w-16 h-16 rounded-full flex items-center justify-center"
                        style={{ background: `linear-gradient(to bottom right, ${primaryColor}, #db2777)` }}
                      >
                        <Briefcase className="w-8 h-8 text-white" />
                      </div>
                      <div>
                        <h4 className="text-white font-semibold">Entrepreneur</h4>
                        <p className="text-gray-400 text-sm">Business ventures & consulting</p>
                      </div>
                    </div>
                  </div>

                  <div className="mt-8 bg-slate-900/50 rounded-lg p-4">
                    <h4 className="text-lg font-semibold text-white mb-3">Quick Stats</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-400">Comment Reply Rate:</span>
                        <span className="text-white ml-2">
                          {formattedActorResponseRate}
                          {actorResponseStats.totalTopLevelComments > 0 && (
                            <span className="ml-2 text-xs text-gray-500">
                              ({actorResponseStats.respondedCount}/{actorResponseStats.totalTopLevelComments})
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Projects Carousel */}
              {data.profile.pastProjects && data.profile.pastProjects.length > 0 && (
                <div className="mt-12">
                  <h3 className="text-2xl font-bold text-white mb-6">Notable Projects</h3>
                  <div className="relative">
                    <div
                      className="flex gap-4 overflow-x-auto pb-4"
                      style={{
                        scrollBehavior: 'smooth',
                        scrollbarWidth: 'none',
                        msOverflowStyle: 'none'
                      }}
                    >
                      {data.profile.pastProjects.map((project) => (
                        <a
                          key={project.id}
                          href={project.tubiUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="relative group flex-shrink-0 cursor-pointer"
                        >
                          <div className="relative">
                            <div
                              className="absolute -inset-0.5 rounded-full opacity-0 group-hover:opacity-100 transition duration-300"
                              style={{ background: `linear-gradient(to right, ${primaryColor}80, #db277780)` }}
                            />
                            <img
                              src={project.imageUrl}
                              alt={project.title}
                              className="relative w-28 h-28 md:w-32 md:h-32 rounded-full object-cover border-2 group-hover:border-opacity-100 transition-all duration-300"
                              style={{ borderColor: `${primaryColor}4D` }}
                            />
                            <div
                              className="absolute bottom-0 right-0 w-8 h-8 bg-black rounded-full flex items-center justify-center border-2"
                              style={{ borderColor: primaryColor }}
                            >
                              {project.type === 'film' && <Film className="w-4 h-4 text-white" />}
                              {project.type === 'television' && <Tv className="w-4 h-4 text-white" />}
                              {project.type === 'theater' && <Theater className="w-4 h-4 text-white" />}
                            </div>
                          </div>
                          <div className="absolute inset-0 rounded-full bg-black/80 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col items-center justify-center p-2 text-center">
                            <h4 className="text-white font-semibold text-xs md:text-sm mb-1 line-clamp-2">{project.title}</h4>
                            <p className="text-red-400 text-xs">{project.year}</p>
                            <p className="text-gray-400 text-xs line-clamp-1">{project.role}</p>
                            {project.tubiUrl && (
                              <p style={{ color: primaryColor }} className="text-xs mt-1">Watch on Tubi</p>
                            )}
                          </div>
                        </a>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Comments Tab */}
        {activeTab === 'comments' && (
          <div className="animate-fadeIn max-w-4xl mx-auto">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold">Comments</h2>
                <p className="mt-1 text-sm text-slate-400">
                  Share your thoughts about {actorName}&apos;s work
                </p>
              </div>
              <button
                type="button"
                onClick={handleOpenCommentModal}
                className="rounded-full px-5 py-2.5 text-sm font-semibold text-white transition hover:scale-105"
                style={{ backgroundColor: primaryColor }}
              >
                Leave a Comment
              </button>
            </div>

            {/* Comments List */}
            {isLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="flex items-center gap-3 text-slate-400">
                  <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span>Loading comments...</span>
                </div>
              </div>
            ) : comments.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-slate-500" />
                </div>
                <h3 className="text-lg font-medium text-white mb-2">No comments yet</h3>
                <p className="text-sm text-slate-400 mb-6 max-w-sm">
                  Be the first to share your thoughts about {actorName}&apos;s work!
                </p>
                <button
                  type="button"
                  onClick={handleOpenCommentModal}
                  className="rounded-full px-6 py-2.5 text-sm font-semibold text-white transition hover:scale-105"
                  style={{ backgroundColor: primaryColor }}
                >
                  Write the First Comment
                </button>
              </div>
            ) : (
              <div className="space-y-6">
                {comments.map((comment: Comment) => (
                  <CommentCard
                    key={comment._id}
                    id={comment._id}
                    name={comment.name}
                    message={comment.message}
                    createdAt={comment.createdAt}
                    likes={comment.likes}
                    replies={comment.replies}
                    primaryColor={primaryColor}
                    onLike={handleLike}
                    onReply={handleReply}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Shorts/Clips Tab */}
        {activeTab === 'shorts' && (
          <div className="animate-fadeIn">
            <NetflixMoreLikeThis />
          </div>
        )}

        {/* Contact Me Tab */}
        {activeTab === 'contact' && (
          <div className="animate-fadeIn">
            <div className="max-w-3xl">
              <h2 className="text-2xl font-bold text-white mb-3">Connect with {actorName}</h2>
              <p className="text-gray-300">
                {actorName} is actively booking new projects and welcomes conversations about film, television, commercial work, and brand collaborations.
              </p>
            </div>

            <div className="grid lg:grid-cols-3 gap-8 mt-8">
              <div className="lg:col-span-2 space-y-6">
                <div className="bg-slate-900/60 rounded-xl border border-white/5 p-6 md:p-8 shadow-lg shadow-black/20">
                  <div className="flex flex-col gap-6">
                    <div>
                      <h3 className="text-xl font-semibold text-white">Direct Booking & Inquiries</h3>
                      <p className="text-sm text-gray-400 mt-2">
                        Submit a request to connect with {actorName} directly.
                      </p>
                    </div>

                    <div className="grid gap-6 sm:grid-cols-2">
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                          <div>
                            <p className="text-white font-medium">Direct connection</p>
                            <p className="text-sm text-gray-400">Your details are delivered securely.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                          <div>
                            <p className="text-white font-medium">Fast response</p>
                            <p className="text-sm text-gray-400">Expect a review within 24-48 hours.</p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                          <div>
                            <p className="text-white font-medium">Available for work</p>
                            <p className="text-sm text-gray-400">Open to roles across genres.</p>
                          </div>
                        </div>
                        <div className="flex items-start gap-3">
                          <CheckCircle className="w-5 h-5 text-green-500 mt-1" />
                          <div>
                            <p className="text-white font-medium">Collaboration focused</p>
                            <p className="text-sm text-gray-400">Let&apos;s create something great together.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {inquiryFeedback && (
                      <div
                        className={`rounded-lg border px-4 py-3 text-sm ${
                          inquiryFeedback.type === 'success'
                            ? 'border-green-500/60 bg-green-500/10 text-green-300'
                            : inquiryFeedback.type === 'error'
                            ? 'border-red-500/60 bg-red-500/10 text-red-300'
                            : 'border-blue-500/60 bg-blue-500/10 text-blue-200'
                        }`}
                      >
                        {inquiryFeedback.message}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={handleSubmitInquiry}
                      className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                      style={{ backgroundColor: primaryColor }}
                    >
                      <Send className="w-4 h-4" />
                      Submit Inquiry
                    </button>
                  </div>
                </div>

                <div className="bg-slate-900/40 rounded-xl border border-white/5 p-6 md:p-8">
                  <h3 className="text-lg font-semibold text-white">What to include in your message</h3>
                  <ul className="mt-4 space-y-3 text-sm text-gray-300">
                    <li className="flex gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 text-green-500" />
                      Project overview, role details, and timeline
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 text-green-500" />
                      Production location or remote requirements
                    </li>
                    <li className="flex gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 text-green-500" />
                      Point of contact for follow-up conversations
                    </li>
                  </ul>
                </div>
              </div>

              <div className="space-y-6">
                <div className="bg-slate-900/60 rounded-xl border border-white/5 p-6 md:p-8 shadow-lg shadow-black/20">
                  <h3 className="text-lg font-semibold text-white">Follow the Journey</h3>
                  <p className="text-sm text-gray-400 mt-2">
                    Explore behind-the-scenes moments and project announcements.
                  </p>
                  <div className="mt-6 space-y-3">
                    {socialLinks.map((social) => {
                      const Icon = social.icon;
                      return (
                        <a
                          key={social.name}
                          href={social.href}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center justify-between rounded-lg border border-white/5 bg-black/30 px-4 py-3 transition-all hover:bg-black/50"
                          style={{ '--hover-border-color': `${primaryColor}99` } as React.CSSProperties}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.borderColor = `${primaryColor}99`;
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.borderColor = 'rgba(255,255,255,0.05)';
                          }}
                        >
                          <div className="flex items-center gap-3">
                            <Icon className="h-5 w-5" style={{ color: primaryColor }} />
                            <div>
                              <p className="text-sm font-semibold text-white">{social.name}</p>
                              <p className="text-xs text-gray-400">{social.handle}</p>
                            </div>
                          </div>
                          <ExternalLink className="h-4 w-4 text-gray-500" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div
              className="mt-12 rounded-lg border p-8"
              style={{
                borderColor: `${primaryColor}33`,
                background: `linear-gradient(to right, ${primaryColor}1A, #db277720)`
              }}
            >
              <div className="max-w-2xl mx-auto text-center space-y-4">
                <h3 className="text-2xl font-bold text-white">Bring {actorName} into your next story</h3>
                <p className="text-gray-300">
                  Share your project vision and let&apos;s create something unforgettable together.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-4">
                  <button
                    type="button"
                    onClick={handleSubmitInquiry}
                    className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
                    style={{ backgroundColor: primaryColor }}
                  >
                    <Send className="h-4 w-4" />
                    Submit Inquiry
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Comment Modal */}
      <CommentEmailModal
        isOpen={showCommentModal}
        onClose={handleCloseCommentModal}
        onSubmit={handleSubmitComment}
        primaryColor={primaryColor}
        isSubmitting={isSubmitting}
        replyingTo={replyingTo?.name}
      />

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </section>
  );
};

export default NetflixGrid;
