import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Loader2 } from "lucide-react";
import ExcelJS from "exceljs";
import {
    adminMonitoringAPI,
} from "../services/admin-monitoring.service";
import type { AuditLogRecord } from "../services/admin-monitoring.service";
import { useAuthStore } from "../stores/auth.store";
import { APP_NAME } from "../config/app";

const ACTION_OPTIONS = [
    "admin_approval",
    "admin_rejection",
    "session_created",
    "session_updated",
    "session_deleted",
    "session_permanently_deleted",
    "attendance_marked",
    "absence_excused",
    "manual_attendance_override",
    "organization_created",
    "organization_updated",
    "user_added_to_org",
    "user_removed_from_org",
    "org_join_approved",
    "org_join_rejected",
    "member_promoted_to_admin",
    "member_demoted_from_admin",
    "member_left_org",
    "org_ownership_transferred",
    "org_deleted_by_owner",
    "org_deleted",
];

const PAGE_SIZE = 10;

const EXPORT_FETCH_LIMIT = 100;
type ExportScope = "all" | "page";
type ExportFormat = "csv" | "xlsx";

const formatActionLabel = (actionValue: string) =>
    actionValue
        .split("_")
        .map((chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase())
        .join(" ");

const DAY_LABELS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const toYmd = (value: Date) => {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
};

const parseYmd = (value: string) => {
    if (!value) return null;
    const [yy, mm, dd] = value.split("-").map(Number);
    if (!yy || !mm || !dd) return null;
    const date = new Date(yy, mm - 1, dd);
    if (Number.isNaN(date.getTime())) return null;
    return date;
};

const getMonthGrid = (monthDate: Date) => {
    const year = monthDate.getFullYear();
    const month = monthDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const totalDays = new Date(year, month + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < firstDay; i += 1) cells.push(null);
    for (let day = 1; day <= totalDays; day += 1) cells.push(new Date(year, month, day));
    return cells;
};

const formatDisplayDate = (value: string) => {
    const parsed = parseYmd(value);
    if (!parsed) return "Select date";
    return parsed.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
    });
};

const getActionBadgeClass = (actionValue: string) => {
    const value = actionValue.toLowerCase();

    if (/(delete|removed|rejected|demoted|left)/.test(value)) {
        return "text-red-300 border-red-400/35 bg-red-500/12";
    }

    if (/(create|added|approved|promoted|excused|marked)/.test(value)) {
        return "text-emerald-300 border-emerald-400/35 bg-emerald-500/12";
    }

    if (/(updated|override|transfer)/.test(value)) {
        return "text-amber-300 border-amber-400/35 bg-amber-500/12";
    }

    return "text-accent border-accent/35 bg-accent/10";
};

const AuditLogs = () => {
    const { user } = useAuthStore();
    const [logs, setLogs] = useState<AuditLogRecord[]>([]);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const [exporting, setExporting] = useState<`${ExportScope}-${ExportFormat}` | null>(null);
    const [exportModalOpen, setExportModalOpen] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [action, setAction] = useState("");
    const [from, setFrom] = useState("");
    const [to, setTo] = useState("");
    const [activeCalendar, setActiveCalendar] = useState<"from" | "to" | null>(null);
    const [fromMonth, setFromMonth] = useState<Date>(parseYmd(from) || new Date());
    const [toMonth, setToMonth] = useState<Date>(parseYmd(to) || new Date());
    const calendarWrapperRef = useRef<HTMLDivElement | null>(null);

    // Only superAdmin and org admins can access
    const isOrgAdmin = user?.userOrgRoles?.some((r: any) => r.role === "admin");
    if (user?.platformRole !== "superAdmin" && user?.platformRole !== "platform_owner" && !isOrgAdmin) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <div className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-6 shadow-lg shadow-black/10 max-w-md">
                    <p className="text-white text-xl font-semibold mb-2">Access Denied</p>
                    <p className="text-white/60">Audit logs are only accessible to Super Administrators and Organization Admins.</p>
                </div>
            </div>
        );
    }

    const canGoPrev = page > 1;
    const canGoNext = page < totalPages;

    const query = useMemo(
        () => ({
            page,
            limit: PAGE_SIZE,
            action: action || undefined,
            from: from || undefined,
            to: to || undefined,
        }),
        [page, action, from, to]
    );

    useEffect(() => {
        const loadAuditLogs = async () => {
            setLoading(true);
            setError(null);
            try {
                const response = await adminMonitoringAPI.getAuditLogs(query);
                setLogs(response.logs);
                setTotal(response.pagination.total);
                setTotalPages(response.pagination.totalPages);
            } catch (loadError) {
                setError(loadError instanceof Error ? loadError.message : "Failed to fetch audit logs.");
            } finally {
                setLoading(false);
            }
        };

        loadAuditLogs();
    }, [query]);

    useEffect(() => {
        const onDocClick = (event: MouseEvent) => {
            if (!calendarWrapperRef.current) return;
            if (!calendarWrapperRef.current.contains(event.target as Node)) {
                setActiveCalendar(null);
            }
        };

        if (activeCalendar) {
            document.addEventListener("mousedown", onDocClick);
        }

        return () => document.removeEventListener("mousedown", onDocClick);
    }, [activeCalendar]);

    const handleApplyFilters = () => {
        setPage(1);
    };

    const handleResetFilters = () => {
        setAction("");
        setFrom("");
        setTo("");
        setPage(1);
    };

    const openExportModal = () => {
        if (loading || exporting !== null) return;
        setExportModalOpen(true);
    };

    const renderCalendar = (
        field: "from" | "to",
        selectedValue: string,
        displayedMonth: Date,
        setDisplayedMonth: (value: Date | ((prev: Date) => Date)) => void,
        onSelect: (next: string) => void
    ) => {
        const selectedDate = parseYmd(selectedValue);
        const today = new Date();
        const monthLabel = displayedMonth.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
        const cells = getMonthGrid(displayedMonth);

        return (
            <div className="relative">
                <button
                    type="button"
                    onClick={() => {
                        const parsed = parseYmd(selectedValue);
                        if (parsed) {
                            setDisplayedMonth(new Date(parsed.getFullYear(), parsed.getMonth(), 1));
                        }
                        setActiveCalendar((prev) => (prev === field ? null : field));
                    }}
                    className="w-full h-10.5 px-4 rounded-xl bg-secondary/60 border border-white/20 text-white/85 text-xs font-light uppercase tracking-widest focus:outline-none focus:border-accent/50 transition hover:border-white/30 hover:bg-secondary/70 focus:bg-secondary/80 text-left inline-flex items-center justify-between"
                >
                    <span className={selectedValue ? "text-white" : "text-white/40"}>{formatDisplayDate(selectedValue)}</span>
                    <Calendar className="w-4 h-4 text-white/50" />
                </button>

                {activeCalendar === field && (
                    <div className="absolute z-120 mt-2 w-full min-w-70 backdrop-blur-2xl bg-secondary/95 border border-white/15 rounded-xl p-3 shadow-2xl">
                        <div className="flex items-center justify-between mb-3">
                            <button
                                type="button"
                                onClick={() => setDisplayedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                                className="w-8 h-8 rounded-lg border border-white/15 text-white/60 hover:text-white hover:bg-white/8 transition flex items-center justify-center"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <p className="text-sm font-semibold text-white">{monthLabel}</p>
                            <button
                                type="button"
                                onClick={() => setDisplayedMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                                className="w-8 h-8 rounded-lg border border-white/15 text-white/60 hover:text-white hover:bg-white/8 transition flex items-center justify-center"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>

                        <div className="grid grid-cols-7 gap-1 mb-1">
                            {DAY_LABELS.map((label) => (
                                <span key={label} className="text-[10px] text-white/35 text-center py-1 font-medium">{label}</span>
                            ))}
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {cells.map((dateCell, index) => {
                                if (!dateCell) {
                                    return <span key={`empty-${index}`} className="h-8" />;
                                }

                                const ymd = toYmd(dateCell);
                                const isSelected = selectedDate ? toYmd(selectedDate) === ymd : false;
                                const isToday = toYmd(today) === ymd;

                                return (
                                    <button
                                        key={ymd}
                                        type="button"
                                        onClick={() => {
                                            onSelect(ymd);
                                            setActiveCalendar(null);
                                        }}
                                        className={`h-8 rounded-lg text-xs transition ${isSelected
                                            ? "bg-accent text-white font-semibold"
                                            : isToday
                                            ? "border border-accent/40 text-accent bg-accent/8"
                                            : "text-white/75 hover:bg-white/10"
                                        }`}
                                    >
                                        {dateCell.getDate()}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-white/10">
                            <button
                                type="button"
                                onClick={() => {
                                    onSelect("");
                                    setActiveCalendar(null);
                                }}
                                className="text-xs text-white/55 hover:text-white transition"
                            >
                                Clear
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    const todayYmd = toYmd(new Date());
                                    onSelect(todayYmd);
                                    setDisplayedMonth(new Date());
                                    setActiveCalendar(null);
                                }}
                                className="text-xs text-accent hover:text-accent/80 transition"
                            >
                                Today
                            </button>
                        </div>
                    </div>
                )}
            </div>
        );
    };

    const handleExport = async (scope: ExportScope, format: ExportFormat) => {
        if (exporting) return;

        const escapeCsv = (value: unknown): string => {
            const raw = String(value ?? "");
            return `"${raw.replace(/"/g, '""')}"`;
        };

        const downloadBlob = (blob: Blob, filename: string) => {
            const url = URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
        };

        try {
            setExporting(`${scope}-${format}`);
            setExportModalOpen(false);
            setError(null);

            const collectedLogs: AuditLogRecord[] = [];

            if (scope === "page") {
                collectedLogs.push(...logs);
            } else {
                let exportPage = 1;
                let exportTotalPages = 1;

                do {
                    const response = await adminMonitoringAPI.getAuditLogs({
                        page: exportPage,
                        limit: EXPORT_FETCH_LIMIT,
                        action: action || undefined,
                        from: from || undefined,
                        to: to || undefined,
                    });

                    collectedLogs.push(...response.logs);
                    exportTotalPages = response.pagination.totalPages;
                    exportPage += 1;
                } while (exportPage <= exportTotalPages);
            }

            if (!collectedLogs.length) {
                setError("No logs available to export for the selected filters.");
                return;
            }

            const timestampValues = collectedLogs
                .map((log) => new Date(log.timestamp).getTime())
                .filter((value) => Number.isFinite(value));

            const minTimestamp = timestampValues.length ? new Date(Math.min(...timestampValues)) : null;
            const maxTimestamp = timestampValues.length ? new Date(Math.max(...timestampValues)) : null;

            const generatedAt = new Date();
            const exportScopeLabel = scope === "all" ? "All matching records" : `Current page only (${page})`;
            const exportedTimeSpan = minTimestamp && maxTimestamp
                ? `${minTimestamp.toLocaleString()} → ${maxTimestamp.toLocaleString()}`
                : "N/A";

            const headers = [
                "#",
                "Audit ID",
                "Timestamp (ISO)",
                "Date",
                "Time",
                "Action",
                "Performed By Name",
                "Performed By ID",
                "Performed By Email",
                "Organization Name",
                "Organization ID",
                "Target Resource Type",
                "Target Resource Name",
                "Target ID",
                "Result",
                "Reason",
                "Change Summary",
                "Affected Users Count",
                "Affected Users",
                "IP Address",
                "User Agent",
                "Metadata",
                "Export Generated At",
                "Export Generated By",
                "Export Scope",
                "Filter Action",
                "Filter From",
                "Filter To",
                "Total Exported Records",
                "Exported Time Span",
            ];

            const dataRows: Array<Array<string | number>> = collectedLogs.map((log, index) => {
                const dateObj = new Date(log.timestamp);
                return [
                    index + 1,
                    log.auditId,
                    log.timestamp,
                    Number.isNaN(dateObj.getTime()) ? "" : dateObj.toLocaleDateString(),
                    Number.isNaN(dateObj.getTime()) ? "" : dateObj.toLocaleTimeString(),
                    formatActionLabel(log.action),
                    log.performedByName || "",
                    log.performedBy || "",
                    log.performedByEmail || "",
                    log.organizationName || "",
                    log.organizationId || "",
                    log.targetResourceType || "",
                    log.targetResourceName || "",
                    log.targetId || "",
                    log.details?.result || "",
                    log.details?.reason || "",
                    log.details?.changesSummary || "",
                    log.details?.affectedUsersCount ?? "",
                    log.details?.affectedUsers?.join("; ") || "",
                    log.ipAddress || "",
                    log.userAgent || "",
                    log.metadata ? JSON.stringify(log.metadata) : "",
                    generatedAt.toISOString(),
                    `${user?.name || "Unknown"} (${user?.email || "N/A"})`,
                    exportScopeLabel,
                    action ? formatActionLabel(action) : "All",
                    from || "Not set",
                    to || "Not set",
                    String(collectedLogs.length),
                    exportedTimeSpan,
                ];
            });

            const yyyyMMdd = generatedAt.toISOString().slice(0, 10);

            if (format === "csv") {
                const csvContent = `\uFEFF${[headers, ...dataRows]
                    .map((row) => row.map(escapeCsv).join(","))
                    .join("\n")}`;

                const csvBlob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
                const csvName = scope === "all"
                    ? `audit-logs-full-report-${yyyyMMdd}.csv`
                    : `audit-logs-page-${page}-${yyyyMMdd}.csv`;
                downloadBlob(csvBlob, csvName);
                return;
            }

            const workbook = new ExcelJS.Workbook();
            workbook.creator = APP_NAME;
            workbook.created = new Date();
            const worksheet = workbook.addWorksheet("Audit Logs");

            worksheet.addRow(headers);
            dataRows.forEach((row) => worksheet.addRow(row));
            worksheet.views = [{ state: "frozen", ySplit: 1 }];

            worksheet.columns = headers.map((header, idx) => {
                const widthMap: Record<number, number> = {
                    0: 6, 1: 18, 2: 24, 3: 14, 4: 12, 5: 24, 6: 24, 7: 16, 8: 28,
                    9: 24, 10: 18, 11: 20, 12: 24, 13: 18, 14: 12, 15: 28, 16: 36,
                    17: 12, 18: 26, 19: 16, 20: 34, 21: 46, 22: 24, 23: 30, 24: 24,
                    25: 20, 26: 14, 27: 14, 28: 14, 29: 30,
                };
                return { header, key: `c${idx + 1}`, width: widthMap[idx] ?? 18 };
            });

            const headerRow = worksheet.getRow(1);
            headerRow.eachCell((cell) => {
                cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1C1C22" } };
                cell.alignment = { horizontal: "center", vertical: "middle", wrapText: true };
                cell.border = {
                    top: { style: "thin", color: { argb: "33FFFFFF" } },
                    left: { style: "thin", color: { argb: "33FFFFFF" } },
                    bottom: { style: "thin", color: { argb: "33FFFFFF" } },
                    right: { style: "thin", color: { argb: "33FFFFFF" } },
                };
            });

            worksheet.eachRow((row, rowNumber) => {
                if (rowNumber === 1) return;
                row.eachCell((cell, colNumber) => {
                    const centerCols = new Set([1, 4, 5, 18, 29]);
                    const wrapCols = new Set([16, 17, 19, 21, 22, 30]);
                    cell.font = { name: "Calibri", size: 10, color: { argb: "FF111111" } };
                    cell.alignment = {
                        horizontal: centerCols.has(colNumber) ? "center" : "left",
                        vertical: "top",
                        wrapText: wrapCols.has(colNumber),
                    };
                    cell.border = {
                        top: { style: "thin", color: { argb: "FFDADADA" } },
                        left: { style: "thin", color: { argb: "FFDADADA" } },
                        bottom: { style: "thin", color: { argb: "FFDADADA" } },
                        right: { style: "thin", color: { argb: "FFDADADA" } },
                    };
                });
            });

            const xlsxBuffer = await workbook.xlsx.writeBuffer();
            const xlsxBlob = new Blob([xlsxBuffer], {
                type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            });
            const xlsxName = scope === "all"
                ? `audit-logs-full-report-${yyyyMMdd}.xlsx`
                : `audit-logs-page-${page}-${yyyyMMdd}.xlsx`;
            downloadBlob(xlsxBlob, xlsxName);
        } catch (exportError) {
            setError(exportError instanceof Error ? exportError.message : "Failed to export audit logs.");
        } finally {
            setExporting(null);
        }
    };

    return (
        <>
            <div className="px-4 sm:px-8 md:px-16 pt-8 md:pt-10 flex flex-col gap-6 md:gap-8 pb-16 animate-fade-in-up md:max-w-none">
                {/* Header */}
                <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-6 md:px-8 py-6 shadow-lg shadow-black/10">
                <h1 className="text-2xl md:text-3xl font-bold text-white font-satoshi tracking-tight">Audit Logs</h1>
                <p className="text-white/40 text-sm mt-1">Track critical admin and system actions.</p>
            </section>

            {error && (
                <div className="p-4 bg-red-500/20 border border-red-500/50 rounded-lg text-red-300 flex items-center justify-between gap-4">
                    <span>{error}</span>
                    <button
                        onClick={() => setPage((prev) => prev)}
                        className="px-3 py-1.5 rounded-lg bg-secondary/70 border border-white/20 text-white text-xs hover:bg-secondary/90 transition cursor-pointer"
                    >
                        Retry
                    </button>
                </div>
            )}

            <section
                ref={calendarWrapperRef}
                className="relative z-40 backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-6 md:px-8 py-6 md:py-8 shadow-lg shadow-black/10"
            >
                <h2 className="text-lg text-white font-semibold mb-6">Filters</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 md:gap-5">
                    {/* Action Dropdown */}
                    <div className="relative group">
                        <label className="block text-white/70 text-sm mb-3 font-medium uppercase tracking-wider">
                            Action
                        </label>
                        <div className="relative">
                            <select
                                value={action}
                                onChange={(e) => setAction(e.target.value)}
                                className="w-full h-10.5 px-4 rounded-xl bg-secondary/60 border border-white/20 text-white/95 text-xs font-light uppercase tracking-widest placeholder-white/30 focus:outline-none focus:border-accent/50 appearance-none cursor-pointer transition hover:border-white/30 hover:bg-secondary/70 focus:bg-secondary/80"
                            >
                                <option className="bg-[#1c1c21] text-white" value="">All actions</option>
                                {ACTION_OPTIONS.map((option) => (
                                    <option className="bg-[#1c1c21] text-white" key={option} value={option}>
                                        {formatActionLabel(option)}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/40 pointer-events-none transition group-hover:text-white/60" />
                        </div>
                    </div>

                    {/* From Date */}
                    <div>
                        <label className="block text-white/70 text-sm mb-3 font-medium uppercase tracking-wider">
                            From
                        </label>
                        {renderCalendar("from", from, fromMonth, setFromMonth, setFrom)}
                    </div>

                    {/* To Date */}
                    <div>
                        <label className="block text-white/70 text-sm mb-3 font-medium uppercase tracking-wider">
                            To
                        </label>
                        {renderCalendar("to", to, toMonth, setToMonth, setTo)}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-col gap-2 sm:col-span-2 md:col-span-1 md:flex-row md:items-end md:gap-3">
                        <button
                            onClick={handleApplyFilters}
                            className="px-6 h-10.5 rounded-xl bg-linear-to-r from-accent/20 to-accent/10 border border-accent/40 text-accent hover:from-accent/30 hover:to-accent/20 hover:border-accent/60 transition cursor-pointer font-semibold text-sm"
                        >
                            ✓ Apply
                        </button>
                        <button
                            onClick={handleResetFilters}
                            className="px-6 h-10.5 rounded-xl bg-white/10 border border-white/20 text-white/70 hover:bg-white/15 hover:text-white hover:border-white/30 transition cursor-pointer font-medium text-sm"
                        >
                            ↻ Reset
                        </button>
                        <button
                            onClick={openExportModal}
                            disabled={exporting !== null || loading || logs.length === 0}
                            className="px-6 h-10.5 rounded-xl bg-linear-to-r from-emerald-500/20 to-accent/20 border border-emerald-400/45 text-emerald-300 hover:from-emerald-500/30 hover:to-accent/30 hover:border-emerald-300/60 transition cursor-pointer font-semibold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                        >
                            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                            {exporting ? "Exporting..." : "Export"}
                        </button>
                    </div>
                </div>
                <p className="text-xs text-white/40 mt-4">
                    Export opens options for current/full scope and CSV/Excel formats.
                </p>
            </section>

            <section className="relative z-10 backdrop-blur-2xl bg-secondary/50 rounded-2xl border border-white/10 px-4 md:px-8 py-6 shadow-lg shadow-black/10 overflow-x-auto w-full max-w-full">
                {loading ? (
                    <p className="text-white/60">Loading audit logs...</p>
                ) : logs.length === 0 ? (
                    <p className="text-white/60">No audit logs found.</p>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-white/10 bg-secondary/20">
                        <table className="w-full text-left text-xs md:text-sm text-white/90 border-collapse">
                            <thead>
                                <tr className="border-b border-white/10 text-white/50 bg-white/5 backdrop-blur-md font-medium uppercase tracking-wider text-[11px]">
                                    <th className="py-4 px-4">Action</th>
                                    <th className="py-4 px-4">User</th>
                                    <th className="py-4 px-4">Resource</th>
                                    <th className="py-4 px-4">Details</th>
                                    <th className="py-4 px-4">Timestamp</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                                {logs.map((log) => (
                                    <tr key={log.auditId} className="group hover:bg-white/5 transition-all duration-300 align-top">
                                        {/* Action */}
                                        <td className="py-4 px-4">
                                            <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium border ${getActionBadgeClass(log.action)}`}>
                                                {formatActionLabel(log.action)}
                                            </span>
                                        </td>

                                        {/* Performed By (Name + Email) */}
                                        <td className="py-4 px-4">
                                            <div className="flex flex-col gap-0.5">
                                                <span className="text-white font-medium">
                                                    {log.performedByName || log.performedBy}
                                                </span>
                                                {log.performedByEmail && (
                                                    <span className="text-white/40 text-xs">{log.performedByEmail}</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Target Resource */}
                                        <td className="py-4 px-4">
                                            <div className="flex flex-col gap-0.5">
                                                {log.targetResourceName ? (
                                                    <>
                                                        <span className="text-white/80">{log.targetResourceName}</span>
                                                        <span className="text-white/40 text-xs">{log.targetId || "-"}</span>
                                                    </>
                                                ) : (
                                                    <span className="text-white/60">{log.targetId || "-"}</span>
                                                )}
                                            </div>
                                        </td>

                                        {/* Details & Metadata */}
                                        <td className="py-4 px-4 max-w-xs">
                                            <details className="text-xs">
                                                <summary className="cursor-pointer text-accent hover:text-accent/80 font-medium">
                                                    {log.details?.changesSummary
                                                        ? log.details.changesSummary.substring(0, 40) + "..."
                                                        : log.details?.reason
                                                        ? log.details.reason.substring(0, 40) + "..."
                                                        : "View details"}
                                                </summary>
                                                <div className="mt-2 bg-white/5 border border-white/10 rounded-md p-2 space-y-2 max-h-48 overflow-y-auto">
                                                    {log.details?.changesSummary && (
                                                        <div>
                                                            <p className="text-white/40 font-medium">Summary</p>
                                                            <p className="text-white/70">{log.details.changesSummary}</p>
                                                        </div>
                                                    )}
                                                    {log.details?.reason && (
                                                        <div>
                                                            <p className="text-white/40 font-medium">Reason</p>
                                                            <p className="text-white/70">{log.details.reason}</p>
                                                        </div>
                                                    )}
                                                    {log.details?.result && (
                                                        <div>
                                                            <p className="text-white/40 font-medium">Result</p>
                                                            <p className={`text-sm font-medium ${log.details.result === "success" ? "text-emerald-400" : "text-red-400"}`}>
                                                                {log.details.result}
                                                            </p>
                                                        </div>
                                                    )}
                                                    {log.details?.affectedUsersCount && (
                                                        <div>
                                                            <p className="text-white/40 font-medium">Affected Users</p>
                                                            <p className="text-white/70">{log.details.affectedUsersCount}</p>
                                                        </div>
                                                    )}
                                                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                                                        <div>
                                                            <p className="text-white/40 font-medium">Metadata</p>
                                                            <pre className="text-white/60 text-xs whitespace-pre-wrap break-all font-mono">
                                                                {JSON.stringify(log.metadata, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                        </td>

                                        {/* Timestamp */}
                                        <td className="py-4 px-4 whitespace-nowrap text-white/60">
                                            <div className="flex flex-col gap-0.5">
                                                <span>{new Date(log.timestamp).toLocaleDateString()}</span>
                                                <span className="text-xs">{new Date(log.timestamp).toLocaleTimeString()}</span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <p className="text-white/60 text-sm">Total: {total}</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                            disabled={!canGoPrev || loading}
                            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 cursor-pointer"
                        >
                            Prev
                        </button>
                        <span className="text-white/80 text-sm">
                            Page {page} of {totalPages}
                        </span>
                        <button
                            onClick={() => setPage((prev) => prev + 1)}
                            disabled={!canGoNext || loading}
                            className="px-3 py-1 rounded-md bg-white/10 hover:bg-white/20 disabled:opacity-50 cursor-pointer"
                        >
                            Next
                        </button>
                    </div>
                </div>
            </section>

            {exportModalOpen && createPortal(
                <div className="fixed inset-0 z-200 flex items-center justify-center backdrop-blur-sm bg-black/45">
                    <div className="backdrop-blur-2xl bg-secondary/80 border border-white/20 rounded-2xl p-7 max-w-md w-full mx-4 shadow-2xl animate-fade-in-up">
                        <h3 className="text-lg text-white font-semibold tracking-tight">Export Audit Report</h3>
                        <p className="text-white/55 text-sm mt-2 mb-5">
                            Select scope to export to Excel (.xlsx).
                        </p>

                        <div className="space-y-3">
                            <button
                                onClick={() => handleExport("page", "xlsx")}
                                disabled={exporting !== null || logs.length === 0}
                                className="w-full text-left px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-white font-medium text-sm group-hover:text-blue-300 transition-colors">Current Page</p>
                                        <p className="text-white/45 text-xs mt-0.5 group-hover:text-blue-200/70 transition-colors">Only records visible on page {page}</p>
                                    </div>
                                    <Download className="w-4 h-4 text-white/40 group-hover:text-blue-300" />
                                </div>
                            </button>

                            <button
                                onClick={() => handleExport("all", "xlsx")}
                                disabled={exporting !== null}
                                className="w-full text-left px-4 py-3 rounded-xl border border-white/20 bg-white/5 hover:bg-white/10 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed group"
                            >
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="text-white font-medium text-sm group-hover:text-emerald-300 transition-colors">Full Report (All Matches)</p>
                                        <p className="text-white/45 text-xs mt-0.5 group-hover:text-emerald-200/70 transition-colors">All records that match active filters</p>
                                    </div>
                                    <Download className="w-4 h-4 text-white/40 group-hover:text-emerald-300" />
                                </div>
                            </button>
                        </div>

                        <div className="flex justify-end mt-6">
                            <button
                                onClick={() => setExportModalOpen(false)}
                                disabled={exporting !== null}
                                className="px-4 py-2 rounded-lg border border-white/20 text-white/65 text-sm hover:text-white hover:bg-white/8 transition cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
            </div>
        </>
    );
};

export default AuditLogs;
