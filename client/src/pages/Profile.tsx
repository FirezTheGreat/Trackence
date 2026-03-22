import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  User,
  Mail,
  Shield,
  Building2,
  Calendar,
  Clock,
  TrendingUp,
  LogOut,
  ChevronRight,
  Pencil,
} from "lucide-react";
import { useAuthStore } from "../stores/auth.store";
import { apiGet } from "../services/api";
import { authAPI } from "../services/auth.service";
import { Badge, Button } from "../components/ui";
import { Skeleton } from "../components/ui/Skeleton";

interface AttendanceStats {
  totalAttended: number;
  totalSessions: number;
  attendanceRate: number;
  recent: Array<{
    historyId: string;
    attendanceId: string;
    sessionId: string;
    markedAt: string;
    status: "attended" | "absent" | "excused";
    reason?: string | null;
    sessionDuration?: number;
  }>;
}

interface OrgInfo {
  organizationId: string;
  name: string;
  code: string;
}

const ROLE_CONFIG: Record<string, { label: string; variant: "info" | "warning" | "accent" }> = {
  faculty: { label: "Faculty", variant: "info" },
  admin: { label: "Administrator", variant: "warning" },
};

export default function Profile() {
  const { user, logout, setUser } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState<AttendanceStats | null>(null);
  const [orgs, setOrgs] = useState<OrgInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [nameModal, setNameModal] = useState<{ show: boolean; value: string }>({
    show: false,
    value: "",
  });
  const [nameSaving, setNameSaving] = useState(false);
  const [nameMessage, setNameMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [statsData, orgsData] = await Promise.all([
          apiGet<AttendanceStats>("/api/attendance/my-stats").catch(() => null),
          apiGet<{ organizations: OrgInfo[] }>("/api/auth/organizations", { skipAuth: true }).catch(() => ({ organizations: [] })),
        ]);
        if (statsData) setStats(statsData);

        // Filter to only orgs the user belongs to
        if (orgsData?.organizations && user?.organizationIds) {
          const memberOrgs = orgsData.organizations.filter((org) =>
            user.organizationIds.includes(org.organizationId)
          );
          setOrgs(memberOrgs);
        }
      } catch {
        // Silent
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [user?.organizationIds, user?.currentOrganizationId]);

  const handleLogout = async () => {
    await logout();
    navigate("/auth/login");
  };

  const beginEditName = () => {
    setNameModal({ show: true, value: user?.name || "" });
    setNameMessage(null);
  };

  const cancelEditName = () => {
    setNameModal({ show: false, value: user?.name || "" });
    setNameMessage(null);
  };

  const saveName = async () => {
    if (!user) return;
    setNameSaving(true);
    setNameMessage(null);
    try {
      const normalizedName = nameModal.value.trim().replace(/\s+/g, " ");
      if (normalizedName.length < 2 || normalizedName.length > 80) {
        setNameMessage({ type: "error", text: "Name must be between 2 and 80 characters." });
        setNameSaving(false);
        return;
      }
      const response = await authAPI.updateMyName(normalizedName);
      setUser({
        ...user,
        name: response.user.name,
      });
      setNameModal({ show: false, value: response.user.name });
      setNameMessage({ type: "success", text: response.message || "Name updated successfully." });
    } catch (error: any) {
      setNameMessage({ type: "error", text: error?.message || "Failed to update name." });
    } finally {
      setNameSaving(false);
    }
  };

  if (!user) return null;

  const role = ROLE_CONFIG[user.role] || ROLE_CONFIG.faculty;
  const adminOrgCount = user.orgAdmins?.length || 0;
  const accessScopeLabel =
    adminOrgCount > 0
      ? `Faculty + Org Admin (${adminOrgCount} org${adminOrgCount === 1 ? "" : "s"})`
      : "Faculty";

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

  return (
    <>
      <div className="px-4 sm:px-8 md:px-16 pt-6 sm:pt-10 flex flex-col gap-6 sm:gap-8 pb-16 animate-fade-in-up">
        {/* ── Header Card ─────────────────── */}
        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 sm:px-8 py-6 sm:py-8 shadow-lg shadow-black/10">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-6">
            {/* Avatar */}
            <div className="relative">
              <div className="w-20 h-20 rounded-full bg-linear-to-br from-accent/60 to-accent/20 border-2 border-accent/40 flex items-center justify-center text-3xl font-bold text-white font-satoshi select-none">
                {user.name?.charAt(0)?.toUpperCase() || "?"}
              </div>
              <span className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-green-500 border-2 border-primary" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-center gap-2 mt-1">
                <h1 className="text-2xl font-bold text-white font-satoshi tracking-tight truncate max-w-full">{user.name}</h1>
                <button
                  onClick={beginEditName}
                  className="p-1.5 rounded-md text-white/40 hover:text-white/80 hover:bg-white/10 transition-colors cursor-pointer"
                  title="Edit Name"
                >
                  <Pencil className="w-4 h-4" />
                </button>
              </div>
              <p className="text-white/50 text-sm flex items-center gap-2 mt-1">
                <Mail className="w-4 h-4 shrink-0" />
                <span className="truncate">{user.email}</span>
              </p>
              {nameMessage && (
                <p
                  className={`text-xs mt-2 ${
                    nameMessage.type === "success" ? "text-green-400" : "text-red-400"
                  }`}
                >
                  {nameMessage.text}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <Badge variant={role.variant} size="md" dot>
                  {role.label}
                </Badge>
              </div>
            </div>

            {/* Actions */}
            <Button
              onClick={handleLogout}
              variant="secondary"
              size="sm"
              className="cursor-pointer flex items-center gap-2 shrink-0"
            >
              <LogOut className="w-4 h-4" />
              Log Out
            </Button>
          </div>
        </section>

        {/* ── Stats Cards ───────────────────── */}
        <section>
          <h2 className="text-lg text-white/70 font-semibold mb-3 tracking-wide">Attendance Overview (Active Organization)</h2>
          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {[0, 1, 2].map((i) => (
                <div key={i} className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-2xl p-6 shadow-lg shadow-black/10">
                  <Skeleton height="14px" className="w-1/2 mb-3" />
                  <Skeleton height="32px" className="w-2/3" />
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <StatCard
                icon={<Calendar className="w-5 h-5 text-blue-400" />}
                label="Sessions Attended"
                value={stats?.totalAttended ?? 0}
              />
              <StatCard
                icon={<Clock className="w-5 h-5 text-amber-400" />}
                label="Total Sessions"
                value={stats?.totalSessions ?? 0}
              />
              <StatCard
                icon={<TrendingUp className="w-5 h-5 text-green-400" />}
                label="Attendance Rate"
                value={`${stats?.attendanceRate ?? 0}%`}
                highlight={
                  (stats?.attendanceRate ?? 0) >= 75
                    ? "text-green-400"
                    : (stats?.attendanceRate ?? 0) >= 50
                    ? "text-amber-400"
                    : "text-red-400"
                }
              />
            </div>
          )}
        </section>

        {/* ── Organizations ─────────────────── */}
        <section>
          <h2 className="text-lg text-white/70 font-semibold mb-3 tracking-wide flex items-center gap-2">
            <Building2 className="w-5 h-5" />
            My Organizations
          </h2>
          {loading ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="flex items-center gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
                  <Skeleton circle width="40px" height="40px" />
                  <div className="flex-1 space-y-2">
                    <Skeleton height="16px" className="w-1/2" />
                    <Skeleton height="12px" className="w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : orgs.length === 0 ? (
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-10 shadow-lg shadow-black/10 text-center">
              <p className="text-white/50">No organizations yet.</p>
              <Button
                onClick={() => navigate("/organizations")}
                variant="primary"
                size="sm"
                className="mt-4 cursor-pointer"
              >
                Browse Organizations
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {orgs.map((org) => (
                <div
                  key={org.organizationId}
                  className="flex items-center gap-4 p-4 backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-xl shadow-md hover:bg-secondary/60 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center text-accent font-bold text-sm">
                    {org.code?.slice(0, 2)?.toUpperCase() || "ORG"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-medium truncate">{org.name}</p>
                    <p className="text-white/40 text-xs font-geist-mono">{org.code}</p>
                  </div>
                  {user.currentOrganizationId === org.organizationId && (
                    <Badge variant="success" size="sm" dot pulse>
                      Active
                    </Badge>
                  )}
                  {user.orgAdmins?.includes(org.organizationId) ? (
                    <Badge variant="warning" size="sm">
                      Admin
                    </Badge>
                  ) : (
                    <Badge variant="info" size="sm">
                      Faculty
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Recent Activity ───────────────── */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg text-white/70 font-semibold tracking-wide">Recent Activity</h2>
            <button
              onClick={() => navigate("/my-attendance")}
              className="text-accent text-sm font-medium hover:underline flex items-center gap-1 cursor-pointer"
            >
              View All
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
                  <Skeleton circle width="32px" height="32px" />
                  <div className="flex-1 space-y-1.5">
                    <Skeleton height="14px" className="w-2/3" />
                    <Skeleton height="11px" className="w-1/3" />
                  </div>
                </div>
              ))}
            </div>
          ) : !stats?.recent?.length ? (
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-10 shadow-lg shadow-black/10 text-center">
              <p className="text-white/50">No attendance records yet.</p>
            </div>
          ) : (
            <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl shadow-lg shadow-black/10 divide-y divide-white/10 overflow-hidden">
              {stats.recent.map((record) => (
                <div
                  key={record.historyId}
                  className="flex items-center gap-4 px-5 py-4 hover:bg-white/5 transition-colors"
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm shrink-0 ${
                    record.status === "attended"
                      ? "bg-green-500/20 text-green-400"
                      : record.status === "excused"
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-red-500/20 text-red-400"
                  }`}>
                    {record.status === "attended" ? "✓" : record.status === "excused" ? "!" : "✕"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">
                      {record.status === "attended" ? "Attended Session" : record.status === "excused" ? "Excused Absence" : "Marked Absent"}
                    </p>
                    <p className="text-white/40 text-xs font-geist-mono truncate">
                      {record.sessionId}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-white/60 text-xs">{formatDate(record.markedAt)}</p>
                    {record.sessionDuration && (
                      <p className="text-white/30 text-[11px]">{record.sessionDuration} min session</p>
                    )}
                    {record.reason && record.status !== "attended" && (
                      <p className="text-white/30 text-[11px] truncate max-w-48">{record.reason}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Account Details ───────────────── */}
        <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 py-6 shadow-lg shadow-black/10">
          <h2 className="text-lg text-white/70 font-semibold mb-4 tracking-wide flex items-center gap-2">
            <Shield className="w-5 h-5" />
            Account Details
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DetailRow icon={<User className="w-4 h-4" />} label="User ID" value={user.userId} mono />
            <DetailRow icon={<Mail className="w-4 h-4" />} label="Email" value={user.email} />
            <DetailRow icon={<Shield className="w-4 h-4" />} label="Access Scope" value={accessScopeLabel} />
            <DetailRow
              icon={<Building2 className="w-4 h-4" />}
              label="Organizations"
              value={`${user.organizationIds?.length || 0} joined`}
            />
          </div>
        </section>
      </div>

      {nameModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm bg-black/40">
          <div className="backdrop-blur-2xl bg-secondary/60 border border-white/20 rounded-2xl p-8 max-w-md w-full mx-4 shadow-2xl">
            <h3 className="text-xl text-white font-semibold mb-4">✏️ Edit Name</h3>
            <input
              type="text"
              value={nameModal.value}
              onChange={(e) =>
                setNameModal((prev) => ({
                  ...prev,
                  value: e.target.value,
                }))
              }
              maxLength={80}
              className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20 text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
              placeholder="Enter your name"
            />
            {nameMessage && (
              <p
                className={`text-xs mt-2 ${
                  nameMessage.type === "success" ? "text-green-400" : "text-red-400"
                }`}
              >
                {nameMessage.text}
              </p>
            )}
            <div className="flex gap-3 mt-6">
              <button
                onClick={saveName}
                disabled={nameSaving}
                className="flex-1 px-4 py-2 rounded-lg bg-accent/20 border border-accent/40 text-accent font-semibold text-sm hover:bg-accent/30 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {nameSaving ? "Saving..." : "Save"}
              </button>
              <button
                onClick={cancelEditName}
                disabled={nameSaving}
                className="flex-1 px-4 py-2 rounded-lg border border-white/15 text-white/60 text-sm hover:text-white transition cursor-pointer disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/* ─── Sub-components ────────────────────── */

function StatCard({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  highlight?: string;
}) {
  return (
    <div className="backdrop-blur-2xl bg-secondary/45 border border-white/20 rounded-2xl p-6 shadow-lg shadow-black/10 hover:border-white/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-300">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-white/50 text-sm">{label}</span>
      </div>
      <p className={`text-3xl font-bold ${highlight || "text-white"} font-satoshi`}>{value}</p>
    </div>
  );
}

function DetailRow({
  icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3 p-3 bg-white/5 rounded-lg border border-white/10">
      <div className="text-white/40 mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-white/40 text-xs uppercase tracking-wider">{label}</p>
        <p className={`text-white text-sm truncate ${mono ? "font-geist-mono" : ""}`}>{value}</p>
      </div>
    </div>
  );
}
