import type { SessionItem } from "../../types/adminSessions.types";

interface Props {
  editingSession: SessionItem | null;
  editDuration: number | "";
  editRefreshInterval: number | "";
  editLoading: boolean;
  onClose: () => void;
  onSave: () => void;
  onDurationChange: (value: number | "") => void;
  onRefreshIntervalChange: (value: number | "") => void;
}

const EditSessionModal = ({
  editingSession,
  editDuration,
  editRefreshInterval,
  editLoading,
  onClose,
  onSave,
  onDurationChange,
  onRefreshIntervalChange,
}: Props) => {
  if (!editingSession) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div
        className="backdrop-blur-2xl bg-secondary/90 border border-white/10 rounded-2xl p-8 shadow-2xl shadow-black/30 w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold text-white mb-1">Edit Session</h2>
        <p className="text-white/50 text-sm mb-6 font-geist-mono">{editingSession.sessionId}</p>

        <div className="space-y-4">
          <div>
            <label className="block text-white/80 mb-2 text-sm font-medium">
              Duration (minutes)
            </label>
            <input
              type="number"
              min="1"
              max="120"
              value={editDuration}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : parseInt(e.target.value);
                if (val === "" || !isNaN(val)) onDurationChange(val === "" ? "" : val);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-[#ad431a] transition"
            />
            <p className="text-white/40 text-xs mt-1">Maximum 120 minutes (2 hours).</p>
            {editingSession.isActive && editDuration && (
              <p className="text-white/40 text-xs mt-1">
                New end time: {new Date(new Date(editingSession.startTime || editingSession.createdAt).getTime() + Number(editDuration) * 60 * 1000).toLocaleString()}
              </p>
            )}
          </div>

          <div>
            <label className="block text-white/80 mb-2 text-sm font-medium">
              QR Refresh Interval (seconds)
            </label>
            <input
              type="number"
              min="5"
              max="60"
              value={editRefreshInterval}
              onChange={(e) => {
                const val = e.target.value === "" ? "" : parseInt(e.target.value);
                if (val === "" || !isNaN(val)) onRefreshIntervalChange(val === "" ? "" : val);
              }}
              onWheel={(e) => e.currentTarget.blur()}
              className="w-full px-4 py-2.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/50 focus:outline-none focus:border-[#ad431a] transition"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={onSave}
              disabled={editLoading}
              className="flex-1 px-4 py-2.5 bg-[#ad431a] hover:bg-[#8a331a] text-white font-bold rounded-xl transition disabled:opacity-50 cursor-pointer"
            >
              {editLoading ? "Saving..." : "Save Changes"}
            </button>
            <button
              onClick={onClose}
              className="px-6 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditSessionModal;
