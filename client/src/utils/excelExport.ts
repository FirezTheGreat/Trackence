/**
 * Excel Export Utility — generates proper .xlsx files using ExcelJS.
 * No compatibility warnings, styled headers, auto-fit columns.
 */
import ExcelJS from "exceljs";
import { APP_NAME } from "../config/app";

/* ─── Colour palette ─── */
const ACCENT = "F97316"; // orange-500 — session header
const DANGER = "DC2626"; // red-600   — absence header
const DARK = "1C1C22"; // dark bg   — table header
const GREY_BG = "F5F5F5"; // light grey — info label
const EVEN_BG = "F9F9F9"; // zebra stripe
const GREEN = "16A34A";
const RED = "DC2626";

/* ─── Helpers ─── */
const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};
const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};
const fmtDateTime = (iso: string) => `${fmtDate(iso)} ${fmtTime(iso)}`;
const formatMinutes = (minutes: number) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
};

const borderThin: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: "FFCCCCCC" } },
    left: { style: "thin", color: { argb: "FFCCCCCC" } },
    bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
    right: { style: "thin", color: { argb: "FFCCCCCC" } },
};

/** Add a key-value info row */
function addInfoRow(ws: ExcelJS.Worksheet, label: string, value: string, colSpan: number) {
    const row = ws.addRow([label, value]);
    row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREY_BG}` } };
    row.getCell(1).font = { bold: true, color: { argb: "FF333333" }, name: "Calibri", size: 11 };
    row.getCell(1).border = borderThin;
    row.getCell(2).font = { color: { argb: "FF111111" }, name: "Calibri", size: 11 };
    row.getCell(2).border = borderThin;
    if (colSpan > 2) ws.mergeCells(row.number, 2, row.number, colSpan);
}

/** Add a coloured stat info row */
function addStatRow(
    ws: ExcelJS.Worksheet,
    pairs: { label: string; value: string; color?: string }[],
    totalCols: number,
) {
    const cells: string[] = [];
    pairs.forEach((p) => { cells.push(p.label, p.value); });
    // pad to totalCols
    while (cells.length < totalCols) cells.push("");
    const row = ws.addRow(cells);

    pairs.forEach((p, i) => {
        const labelCell = row.getCell(i * 2 + 1);
        const valueCell = row.getCell(i * 2 + 2);
        labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREY_BG}` } };
        labelCell.font = { bold: true, color: { argb: "FF333333" }, name: "Calibri", size: 11 };
        labelCell.border = borderThin;
        valueCell.font = {
            bold: true,
            color: { argb: `FF${p.color || "111111"}` },
            name: "Calibri",
            size: 11,
        };
        valueCell.border = borderThin;
    });
}

/** Style header row for data table */
function styleTableHeader(row: ExcelJS.Row, colCount: number) {
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (colNumber > colCount) return;
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${DARK}` } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
        cell.border = borderThin;
        cell.alignment = { horizontal: "left", vertical: "middle" };
    });
}

/** Auto-fit column widths based on content (rough estimate) */
function autoFitColumns(ws: ExcelJS.Worksheet, minWidth = 12, maxWidth = 40) {
    ws.columns.forEach((col) => {
        let max = minWidth;
        col.eachCell?.({ includeEmpty: false }, (cell) => {
            const len = String(cell.value ?? "").length + 2;
            if (len > max) max = len;
        });
        col.width = Math.min(max, maxWidth);
    });
}

/** Trigger browser download of buffer */
function downloadBuffer(buffer: ExcelJS.Buffer, filename: string) {
    const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

/* ════════════════════════════════════════════════════════════════
   1.  Session Attendance Report
   ════════════════════════════════════════════════════════════════ */

export interface SessionReportData {
    sessionId: string;
    startTime: string;
    endTime?: string;
    duration: number;
    isActive: boolean;
    createdByName?: string | null;
    createdByEmail?: string | null;
    orgName: string;
    totalFaculty: number;
    checkedIn: number;
    attendanceRecords: {
        userId: string;
        name?: string;
        email?: string;
        markedAt: string;
    }[];
    formatDuration: (minutes: number) => string;
}

export async function exportSessionReport(data: SessionReportData) {
    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    wb.created = new Date();

    const ws = wb.addWorksheet("Attendance Report");

    const COLS = 6; // Sr No, Name, Email, User ID, Date, Time

    /* ── Title row ── */
    const titleRow = ws.addRow(["Session Attendance Report"]);
    ws.mergeCells(titleRow.number, 1, titleRow.number, COLS);
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT}` } };
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    titleRow.height = 30;

    ws.addRow([]); // spacer

    /* ── Session info ── */
    addInfoRow(ws, "Session ID", data.sessionId, COLS);
    addInfoRow(ws, "Organization", data.orgName || "N/A", COLS);
    addInfoRow(ws, "Status", data.isActive ? "Active" : "Ended", COLS);
    addInfoRow(ws, "Started", fmtDateTime(data.startTime), COLS);
    addInfoRow(ws, "Ended", data.endTime ? fmtDateTime(data.endTime) : "N/A", COLS);
    addInfoRow(ws, "Duration", data.formatDuration(data.duration), COLS);
    const creatorStr = (data.createdByName || "N/A") + (data.createdByEmail ? ` (${data.createdByEmail})` : "");
    addInfoRow(ws, "Created By", creatorStr, COLS);

    ws.addRow([]); // spacer

    /* ── Summary stats ── */
    const absent = Math.max(0, data.totalFaculty - data.checkedIn);
    const rate = data.totalFaculty > 0 ? Math.round((data.checkedIn / data.totalFaculty) * 100) : 0;
    addStatRow(ws, [
        { label: "Total Members", value: String(data.totalFaculty), color: GREEN },
        { label: "Checked In", value: String(data.checkedIn), color: GREEN },
        { label: "Absent", value: String(absent), color: RED },
    ], COLS);
    addStatRow(ws, [
        { label: "Attendance Rate", value: `${rate}%`, color: GREEN },
    ], COLS);

    ws.addRow([]); // spacer

    /* ── Data table header ── */
    const headerRow = ws.addRow(["Sr No", "Name", "Email", "User ID", "Check-in Date", "Check-in Time"]);
    styleTableHeader(headerRow, COLS);

    /* ── Data rows ── */
    data.attendanceRecords.forEach((rec, idx) => {
        const row = ws.addRow([
            idx + 1,
            rec.name || "Unknown",
            rec.email || "Unknown",
            rec.userId,
            fmtDate(rec.markedAt),
            fmtTime(rec.markedAt),
        ]);

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber > COLS) return;
            cell.font = { name: "Calibri", size: 11, color: { argb: "FF111111" } };
            cell.border = borderThin;
            cell.alignment = { horizontal: "left", vertical: "middle" };
            // Zebra stripe
            if (idx % 2 === 1) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${EVEN_BG}` } };
            }
        });
    });

    autoFitColumns(ws);

    /* ── Download ── */
    const buffer = await wb.xlsx.writeBuffer();
    downloadBuffer(buffer, `session-report-${data.sessionId}.xlsx`);
}

/* ════════════════════════════════════════════════════════════════
   2.  Absence Report
   ════════════════════════════════════════════════════════════════ */

export interface AbsenceReportData {
    sessionId: string;
    orgName: string;
    sessionStartTime?: string;
    sessionEndTime?: string;
    duration?: number;
    formatDuration?: (minutes: number) => string;
    createdByName?: string | null;
    createdByEmail?: string | null;
    summary?: {
        total: number;
        attended: number;
        attendancePercentage: number;
        absent: number;
        absencePercentage: number;
        excused: number;
    } | null;
    records: {
        facultyName: string;
        facultyEmail: string;
        facultyId: string;
        reason: string;
        isExcused: boolean;
        createdAt: string;
    }[];
}

export async function exportAbsenceReport(data: AbsenceReportData) {
    const wb = new ExcelJS.Workbook();
    wb.creator = APP_NAME;
    wb.created = new Date();

    const ws = wb.addWorksheet("Absence Report");

    const COLS = 7; // Sr No, Name, Email, Faculty ID, Reason, Status, Recorded At

    /* ── Title row ── */
    const titleRow = ws.addRow(["Absence Report"]);
    ws.mergeCells(titleRow.number, 1, titleRow.number, COLS);
    titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${DANGER}` } };
    titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
    titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
    titleRow.height = 30;

    ws.addRow([]); // spacer

    /* ── Session info ── */
    addInfoRow(ws, "Session ID", data.sessionId || "N/A", COLS);
    addInfoRow(ws, "Organization", data.orgName || "N/A", COLS);
    if (data.sessionStartTime) {
        addInfoRow(ws, "Session Started", fmtDateTime(data.sessionStartTime), COLS);
    }
    if (data.sessionEndTime) {
        addInfoRow(ws, "Session Ended", fmtDateTime(data.sessionEndTime), COLS);
    }
    if (typeof data.duration === "number") {
        const formatter = data.formatDuration || formatMinutes;
        addInfoRow(ws, "Duration", formatter(data.duration), COLS);
    }
    const creator = `${data.createdByName || "N/A"}${data.createdByEmail ? ` (${data.createdByEmail})` : ""}`;
    addInfoRow(ws, "Created By", creator, COLS);

    /* ── Summary stats (if available) ── */
    if (data.summary) {
        ws.addRow([]);
        addStatRow(ws, [
            { label: "Total Members", value: String(data.summary.total) },
            { label: "Attended", value: `${data.summary.attended} (${data.summary.attendancePercentage}%)`, color: GREEN },
            { label: "Absent", value: `${data.summary.absent} (${data.summary.absencePercentage}%)`, color: RED },
        ], COLS);
        addStatRow(ws, [
            { label: "Excused", value: String(data.summary.excused) },
            { label: "Pending", value: String(Math.max(0, data.summary.absent - data.summary.excused)), color: RED },
        ], COLS);
    }

    ws.addRow([]); // spacer

    /* ── Data table header ── */
    const headerRow = ws.addRow(["Sr No", "Faculty Name", "Email", "Faculty ID", "Reason", "Status", "Recorded At"]);
    styleTableHeader(headerRow, COLS);

    /* ── Data rows ── */
    data.records.forEach((rec, idx) => {
        const statusText = rec.isExcused ? "Excused" : "Pending";
        const row = ws.addRow([
            idx + 1,
            rec.facultyName,
            rec.facultyEmail,
            rec.facultyId,
            rec.reason || "Not Provided",
            statusText,
            fmtDateTime(rec.createdAt),
        ]);

        row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
            if (colNumber > COLS) return;
            cell.font = { name: "Calibri", size: 11, color: { argb: "FF111111" } };
            cell.border = borderThin;
            cell.alignment = { horizontal: "left", vertical: "middle" };
            // Zebra stripe
            if (idx % 2 === 1) {
                cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${EVEN_BG}` } };
            }
        });

        // Color the status cell
        const statusCell = row.getCell(6);
        statusCell.font = {
            bold: true,
            name: "Calibri",
            size: 11,
            color: { argb: `FF${rec.isExcused ? "CA8A04" : RED}` },
        };
    });

    autoFitColumns(ws);

    /* ── Download ── */
    const buffer = await wb.xlsx.writeBuffer();
    downloadBuffer(buffer, `absence-report-${data.sessionId}_${new Date().toISOString().split("T")[0]}.xlsx`);
}
