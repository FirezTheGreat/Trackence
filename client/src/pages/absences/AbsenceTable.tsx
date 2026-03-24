import { memo } from "react";
import type { AbsenceRecord } from "../../types/absences.types";

interface Props {
    absenceData: { records?: AbsenceRecord[] } | null;
    loadingAbsences: boolean;
    filter: "all" | "pending" | "excused";
    filteredAbsences: AbsenceRecord[];
    pendingAbsences: AbsenceRecord[];
    selectedAbsences: Set<string>;
    onFilterChange: (filter: "all" | "pending" | "excused") => void;
    onSelectAllPending: (checked: boolean) => void;
    onToggleAbsence: (absenceId: string) => void;
}

const AbsenceTable = ({
    absenceData,
    loadingAbsences,
    filter,
    filteredAbsences,
    pendingAbsences,
    selectedAbsences,
    onFilterChange,
    onSelectAllPending,
    onToggleAbsence,
}: Props) => {
    if (!absenceData || loadingAbsences) return null;

    return (
        <div className="backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 p-6 shadow-lg shadow-black/10">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-semibold text-white">
                    Absences ({filteredAbsences.length})
                </h2>
                <div className="flex gap-2">
                    {(["all", "pending", "excused"] as const).map((f) => (
                        <button
                            key={f}
                            onClick={() => onFilterChange(f)}
                            className={`px-4 py-2 rounded-lg text-sm transition cursor-pointer ${filter === f
                                ? "bg-accent text-white"
                                : "bg-white/10 text-white/60 hover:bg-white/20"
                                }`}
                        >
                            {f === "all" && "All"}
                            {f === "pending" && "Pending"}
                            {f === "excused" && "Excused"}
                        </button>
                    ))}
                </div>
            </div>

            {filteredAbsences.length === 0 ? (
                <p className="text-white/60 text-center py-8">No absences found</p>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-white/10">
                                <th className="text-left py-3 px-4 text-white/60 text-sm">
                                    <input
                                        type="checkbox"
                                        onChange={(e) => onSelectAllPending(e.target.checked)}
                                        disabled={pendingAbsences.length === 0}
                                        className={`w-4 h-4 ${pendingAbsences.length === 0 ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
                                    />
                                </th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Name</th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Email</th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Member ID</th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Reason</th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Recorded</th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Status</th>
                                <th className="text-left py-3 px-4 text-white/60 text-sm">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAbsences.map((absence) => {
                                const isSelected = selectedAbsences.has(absence._id);
                                return (
                                    <AbsenceRow
                                        key={absence._id}
                                        absence={absence}
                                        isSelected={isSelected}
                                        onToggleAbsence={onToggleAbsence}
                                    />
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

type AbsenceRowProps = {
    absence: AbsenceRecord;
    isSelected: boolean;
    onToggleAbsence: (absenceId: string) => void;
};

const AbsenceRow = memo(({ absence, isSelected, onToggleAbsence }: AbsenceRowProps) => (
    <tr className="border-b border-white/5 hover:bg-white/5 transition">
        <td className="py-3 px-4">
            <input
                type="checkbox"
                checked={isSelected}
                onChange={() => onToggleAbsence(absence._id)}
                disabled={absence.isExcused || absence.markedManually}
                className={`w-4 h-4 ${absence.isExcused || absence.markedManually ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
            />
        </td>
        <td className="py-3 px-4">
            <p className="text-white font-medium">{absence.memberName}</p>
        </td>
        <td className="py-3 px-4">
            <p className="text-white/60 text-sm">{absence.memberEmail}</p>
        </td>
        <td className="py-3 px-4">
            <span className="text-white/60 text-sm">{absence.memberId}</span>
        </td>
        <td className="py-3 px-4">
            <span className="text-white/60 text-sm">{absence.reason || "Not Provided"}</span>
        </td>
        <td className="py-3 px-4">
            <span className="text-white/60 text-sm">
                {new Date(absence.createdAt).toLocaleString()}
            </span>
        </td>
        <td className="py-3 px-4">
            <span
                className={`px-3 py-1 rounded-full text-xs font-semibold ${absence.isExcused
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                    }`}
            >
                {absence.markedManually ? "Marked Attended" : absence.isExcused ? "Excused" : "Pending"}
            </span>
        </td>
        <td className="py-3 px-4">
            {absence.isExcused || absence.markedManually ? (
                <span className="text-xs text-white/40">N/A</span>
            ) : (
                <button
                    onClick={() => onToggleAbsence(absence._id)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition cursor-pointer ${
                        isSelected
                            ? "bg-accent/20 border-accent/40 text-accent"
                            : "bg-white/5 border-white/15 text-white/70 hover:bg-white/10 hover:text-white"
                    }`}
                >
                    {isSelected ? "Selected" : "Excuse"}
                </button>
            )}
        </td>
    </tr>
));

export default memo(AbsenceTable);
