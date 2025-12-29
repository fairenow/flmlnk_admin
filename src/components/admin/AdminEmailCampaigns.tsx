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
      <div className="overflow-hidden rounded-3xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-500 p-6 text-white shadow-lg">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-indigo-100">Admin Email Campaigns</p>
            <h2 className="text-2xl font-semibold tracking-tight">Target All Filmmakers</h2>
            <p className="mt-1 text-sm text-indigo-100/90">
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
            className="rounded-lg border border-indigo-500/30 bg-white/10 px-4 py-2 text-sm font-medium text-white outline-none dark:bg-slate-800"
          >
            <option value="all" className="text-slate-900">All Users</option>
            <option value="with_profiles" className="text-slate-900">With Profiles</option>
            <option value="without_profiles" className="text-slate-900">Without Profiles</option>
            <option value="inactive" className="text-slate-900">Inactive</option>
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
              className="w-full rounded-lg border border-white/20 bg-white/10 py-2 pl-9 pr-3 text-sm text-white placeholder-slate-400 outline-none focus:border-indigo-400 sm:w-64 dark:bg-slate-800"
            />
          </div>
          <button
            onClick={exportSelectedEmails}
            disabled={selectedUsers.size === 0}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="h-4 w-4" />
            Export ({selectedUsers.size})
          </button>
        </div>
      </div>

      {/* Users List */}
      <div
        className="rounded-2xl border border-indigo-500/20 bg-white/5 overflow-hidden cursor-pointer"
        onClick={() => toggleSection("users")}
      >
        <div className="flex items-center justify-between p-4 border-b border-indigo-500/10">
          <h3 className="font-semibold text-white flex items-center gap-2">
            <Mail className="h-5 w-5 text-indigo-400" />
            User List ({filteredUsers.length})
          </h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <button
                onClick={selectAll}
                className="text-xs text-indigo-400 hover:text-indigo-300"
              >
                Select All
              </button>
              <span className="text-slate-500">|</span>
              <button
                onClick={deselectAll}
                className="text-xs text-indigo-400 hover:text-indigo-300"
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
                  <tr className="text-left text-xs uppercase tracking-wider text-slate-400 border-b border-white/10">
                    <th className="pb-3 pr-2 w-10">
                      <input
                        type="checkbox"
                        checked={selectedUsers.size === filteredUsers.length && filteredUsers.length > 0}
                        onChange={(e) => (e.target.checked ? selectAll() : deselectAll())}
                        className="rounded border-slate-600"
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
                <tbody className="divide-y divide-white/5">
                  {filteredUsers.map((user: UserRecord) => (
                    <tr
                      key={user._id}
                      className="hover:bg-white/5"
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
                          className="rounded border-slate-600"
                          onClick={(e) => e.stopPropagation()}
                        />
                      </td>
                      <td className="py-3 pr-4">
                        <p className="font-medium text-white">{user.name}</p>
                      </td>
                      <td className="py-3 px-2 text-slate-300">{user.email}</td>
                      <td className="py-3 px-2">
                        {user.hasProfile ? (
                          <span className="text-indigo-400">/{user.profileSlug}</span>
                        ) : (
                          <span className="text-slate-500">No profile</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-center">
                        {user.hasProfile ? (
                          user.isActive ? (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-1 text-xs text-emerald-400">
                              Active
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/20 px-2 py-1 text-xs text-amber-400">
                              Inactive
                            </span>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-500/20 px-2 py-1 text-xs text-slate-400">
                            Onboarding
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-2 text-right text-slate-400 text-xs">
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
    default: "text-indigo-400",
    warning: "text-amber-400",
    success: "text-emerald-400",
  };

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4">
      <Icon className={`h-6 w-6 ${colors[variant]} mb-2`} />
      <p className="text-2xl font-bold text-white">{value.toLocaleString()}</p>
      <p className="text-sm font-medium text-white">{label}</p>
      <p className="text-xs text-slate-400">{subtext}</p>
    </div>
  );
}
