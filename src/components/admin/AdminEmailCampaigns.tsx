"use client";

import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import {
  Mail,
  Users,
  UserX,
  UserCheck,
  Clock,
  Filter,
  Download,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { useState, useMemo } from "react";

interface AdminEmailCampaignsProps {
  adminEmail: string;
}

type FilterType = "all" | "with_profiles" | "without_profiles" | "inactive";

type UserRecord = {
  _id: string;
  name: string;
  email: string;
  createdAt: number;
  hasProfile: boolean;
  profileSlug?: string;
  profileDisplayName?: string;
  isActive: boolean;
};

export function AdminEmailCampaigns({ adminEmail }: AdminEmailCampaignsProps) {
  const [filter, setFilter] = useState<FilterType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedSection, setExpandedSection] = useState<string | null>("users");
  const [selectedUsers, setSelectedUsers] = useState<Set<string>>(new Set());

  const usersData = useQuery(api.adminPortal.getAllUsersForCampaigns, {
    adminEmail,
    filter,
  });

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const filteredUsers = useMemo((): UserRecord[] => {
    if (!usersData?.users) return [];
    if (!searchTerm.trim()) return usersData.users as UserRecord[];

    const term = searchTerm.toLowerCase();
    return (usersData.users as UserRecord[]).filter(
      (user: UserRecord) =>
        user.name.toLowerCase().includes(term) ||
        user.email.toLowerCase().includes(term) ||
        (user.profileSlug && user.profileSlug.toLowerCase().includes(term))
    );
  }, [usersData?.users, searchTerm]);

  const toggleUserSelection = (userId: string) => {
    setSelectedUsers((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (!filteredUsers) return;
    setSelectedUsers(new Set(filteredUsers.map((u: UserRecord) => u._id)));
  };

  const deselectAll = () => {
    setSelectedUsers(new Set());
  };

  const exportSelectedEmails = () => {
    if (!usersData?.users) return;

    const selectedEmails = (usersData.users as UserRecord[])
      .filter((u: UserRecord) => selectedUsers.has(u._id))
      .map((u: UserRecord) => `${u.name},${u.email}`)
      .join("\n");

    const csv = `Name,Email\n${selectedEmails}`;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `filmmakers-${filter}-${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!usersData) {
    return (
      <div className="flex items-center justify-center p-12">
        <div className="flex items-center gap-3 text-slate-400">
          <Mail className="h-5 w-5 animate-pulse" />
          <span>Loading email campaigns...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-carpet-red-800 via-carpet-red-600 to-red-500 p-6 text-white shadow-lg shadow-red-950/40">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-red-100">Admin Email Campaigns</p>
            <h2 className="text-2xl font-semibold tracking-tight">Target All Filmmakers</h2>
            <p className="mt-1 text-sm text-red-100/90">
              Send campaigns to all users, including those without published profiles
            </p>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={Users}
          label="Total Users"
          value={usersData.total}
          subtext="All registered users"
        />
        <StatCard
          icon={UserCheck}
          label="With Profiles"
          value={usersData.withProfiles}
          subtext="Published filmmakers"
          variant="success"
        />
        <StatCard
          icon={UserX}
          label="Without Profiles"
          value={usersData.withoutProfiles}
          subtext="Incomplete onboarding"
          variant="warning"
        />
        <StatCard
          icon={Clock}
          label="Inactive (30d)"
          value={usersData.inactive}
          subtext="No recent activity"
        />
      </div>

      {/* Filter and Search */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-slate-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterType)}
            className="rounded-lg border border-red-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 outline-none dark:border-red-900/50 dark:bg-slate-800 dark:text-white"
          >
            <option value="all">All Users</option>
            <option value="with_profiles">With Profiles</option>
            <option value="without_profiles">Without Profiles</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full rounded-lg border border-red-300 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-red-500 sm:w-64 dark:border-red-900/50 dark:bg-slate-800 dark:text-white"
            />
          </div>
          <button
            onClick={exportSelectedEmails}
            disabled={selectedUsers.size === 0}
            className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-red-500 disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-red-950/30"
          >
            <Download className="h-4 w-4" />
            Export ({selectedUsers.size})
          </button>
        </div>
      </div>

      {/* Users List */}
      <div
        className="rounded-2xl border border-red-300 bg-white dark:border-red-900/50 dark:bg-[#0f1219] overflow-hidden cursor-pointer shadow-lg shadow-red-200/50 dark:shadow-red-950/30"
        onClick={() => toggleSection("users")}
      >
        <div className="flex items-center justify-between p-4 border-b border-red-200 dark:border-red-900/50">
          <h3 className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-red-500" />
            User List ({filteredUsers.length})
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={selectAll}
                className="text-xs text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
              >
                Select All
              </button>
              <span className="text-slate-400">|</span>
              <button
                onClick={deselectAll}
                className="text-xs text-red-600 hover:text-red-500 dark:text-red-400 dark:hover:text-red-300"
              >
                Deselect All
              </button>
            </div>
            {expandedSection === "users" ? (
              <ChevronUp className="h-5 w-5 text-slate-400" />
            ) : (
              <ChevronDown className="h-5 w-5 text-slate-400" />
            )}
          </div>
        </div>
        {expandedSection === "users" && (
          <div className="p-4">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-500 dark:text-slate-400 border-b border-red-200 dark:border-white/10">
                    <th className="pb-3 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                        onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                        className="rounded border-slate-300 dark:border-slate-600"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </th>
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 px-2">Email</th>
                    <th className="pb-3 px-2">Profile</th>
                    <th className="pb-3 px-2 text-center">Status</th>
                    <th className="pb-3 pl-2 text-right">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-red-100 dark:divide-white/5">
                  {filteredUsers.map((user: UserRecord) => (
                    <tr
                      key={user._id}
                      className="hover:bg-red-50 dark:hover:bg-white/5"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleUserSelection(user._id);
                      }}
                    >
                      <td className="py-3 pr-2">
                        <input
                          type="checkbox"
                          checked={selectedUsers.has(user._id)}
                          onChange={() => toggleUserSelection(user._id)}
                          className="rounded border-slate-300 dark:border-slate-600"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-slate-900 dark:text-white">{user.name}</p>
                      </td>
                      <td className="py-3 px-2 text-slate-600 dark:text-slate-300">{user.email}</td>
                      <td className="py-3 px-2">
                        {user.hasProfile ? (
                          <span className="text-red-600 dark:text-red-400">/{user.profileSlug}</span>
                        ) : (
                          <span className="text-slate-400 dark:text-slate-500">No profile</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {user.hasProfile ? (
                          user.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 dark:bg-emerald-500/20 px-2 py-1 text-xs text-emerald-700 dark:text-emerald-400">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-500/20 px-2 py-1 text-xs text-amber-700 dark:text-amber-400">
                              Inactive
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-500/20 px-2 py-1 text-xs text-slate-600 dark:text-slate-400">
                            Onboarding
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-2 text-right text-slate-500 dark:text-slate-400 text-xs">
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  variant = "default",
}: {
  icon: typeof Users;
  label: string;
  value: number;
  subtext: string;
  variant?: "default" | "warning" | "success";
}) {
  const colors = {
    default: "text-red-500",
    warning: "text-amber-500",
    success: "text-emerald-500",
  };

  return (
    <div className="rounded-xl border border-red-200 dark:border-white/10 bg-red-50 dark:bg-white/5 p-4">
      <Icon className={`h-6 w-6 ${colors[variant]} mb-2`} />
      <p className="text-2xl font-bold text-slate-900 dark:text-white">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-slate-700 dark:text-white">{label}</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">{subtext}</p>
    </div>
  );
}
