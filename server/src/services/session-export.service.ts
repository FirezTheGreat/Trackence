import Attendance from "../models/Attendance.model";
import Absence from "../models/Absence.model";
import ExcelJS from "exceljs";
import { APP_NAME } from "../config/env";
import Organization from "../models/Organization.model";
import Session from "../models/Session.model";
import User from "../models/User.model";

export const buildSessionAttendanceCsv = async (sessionId: string): Promise<string> => {
  const attendanceRecords = await Attendance.find({ sessionId })
    .sort({ markedAt: 1 })
    .lean();

  const userIds = attendanceRecords.map((record: any) => record.userId);
  const users = await User.find({ userId: { $in: userIds } }).lean();
  const userMap = new Map((users as any[]).map((u: any) => [u.userId, u]));

  const bom = "\uFEFF";
  const csvHeader = "Sr No,Name,Email,User ID,Date,Time\n";
  const csvRows = attendanceRecords
    .map((record: any, idx: number) => {
      const user = userMap.get(record.userId);
      const markedAt = new Date(record.markedAt);
      const day = String(markedAt.getDate()).padStart(2, "0");
      const month = String(markedAt.getMonth() + 1).padStart(2, "0");
      const year = markedAt.getFullYear();
      const hours = String(markedAt.getHours()).padStart(2, "0");
      const minutes = String(markedAt.getMinutes()).padStart(2, "0");
      const seconds = String(markedAt.getSeconds()).padStart(2, "0");
      const dateStr = `${day}/${month}/${year}`;
      const timeStr = `${hours}:${minutes}:${seconds}`;
      const name = String((user as any)?.name || "Unknown").replace(/,/g, " ");
      const email = String((user as any)?.email || "Unknown").replace(/,/g, " ");
      return `${idx + 1},${name},${email},${record.userId},${dateStr},${timeStr}`;
    })
    .join("\n");

  return bom + csvHeader + csvRows;
};

const ACCENT = "F97316";
const DARK = "1C1C22";
const GREY_BG = "F5F5F5";
const EVEN_BG = "F9F9F9";
const GREEN = "16A34A";
const RED = "DC2626";
const DANGER = "DC2626";

const fmtDate = (iso: string | Date) => {
  const d = new Date(iso);
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
};

const fmtTime = (iso: string | Date) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
};

const fmtDateTime = (iso: string | Date) => `${fmtDate(iso)} ${fmtTime(iso)}`;

const formatDuration = (minutes: number) => {
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

const addInfoRow = (ws: ExcelJS.Worksheet, label: string, value: string, colSpan: number) => {
  const row = ws.addRow([label, value]);
  row.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREY_BG}` } };
  row.getCell(1).font = { bold: true, color: { argb: "FF333333" }, name: "Calibri", size: 11 };
  row.getCell(1).border = borderThin;
  row.getCell(2).font = { color: { argb: "FF111111" }, name: "Calibri", size: 11 };
  row.getCell(2).border = borderThin;
  if (colSpan > 2) ws.mergeCells(row.number, 2, row.number, colSpan);
};

const addStatRow = (
  ws: ExcelJS.Worksheet,
  pairs: Array<{ label: string; value: string; color?: string }>,
  totalCols: number
) => {
  const cells: string[] = [];
  pairs.forEach((pair) => {
    cells.push(pair.label, pair.value);
  });

  while (cells.length < totalCols) cells.push("");
  const row = ws.addRow(cells);

  pairs.forEach((pair, index) => {
    const labelCell = row.getCell(index * 2 + 1);
    const valueCell = row.getCell(index * 2 + 2);
    labelCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${GREY_BG}` } };
    labelCell.font = { bold: true, color: { argb: "FF333333" }, name: "Calibri", size: 11 };
    labelCell.border = borderThin;
    valueCell.font = {
      bold: true,
      color: { argb: `FF${pair.color || "111111"}` },
      name: "Calibri",
      size: 11,
    };
    valueCell.border = borderThin;
  });
};

const styleTableHeader = (row: ExcelJS.Row, colCount: number) => {
  row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    if (colNumber > colCount) return;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${DARK}` } };
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Calibri", size: 11 };
    cell.border = borderThin;
    cell.alignment = { horizontal: "left", vertical: "middle" };
  });
};

const autoFitColumns = (ws: ExcelJS.Worksheet, minWidth = 12, maxWidth = 80) => {
  ws.columns.forEach((col) => {
    let max = minWidth;
    col.eachCell?.({ includeEmpty: false }, (cell) => {
      const len = String(cell.value ?? "").length + 2;
      if (len > max) max = len;
    });
    col.width = Math.min(max, maxWidth);
  });
};

export const buildSessionAttendanceReportXlsx = async (sessionId: string): Promise<Buffer> => {
  const session = await Session.findOne({ sessionId }).lean();
  if (!session) {
    throw new Error("Session not found.");
  }

  const attendanceRecords = await Attendance.find({ sessionId })
    .sort({ markedAt: 1 })
    .lean();

  const userIds = Array.from(new Set(attendanceRecords.map((record: any) => record.userId)));
  const creatorId = String((session as any).createdBy || "").trim();
  const peopleIds = creatorId ? Array.from(new Set([...userIds, creatorId])) : userIds;

  const [users, organization, totalFacultyCount] = await Promise.all([
    peopleIds.length ? User.find({ userId: { $in: peopleIds } }).select("userId name email").lean() : [],
    Organization.findOne({ organizationId: (session as any).organizationId }).select("name").lean(),
    User.countDocuments({ organizationIds: (session as any).organizationId }),
  ]);

  const userMap = new Map((users as any[]).map((user: any) => [user.userId, user]));
  const creator = creatorId ? userMap.get(creatorId) : null;
  const totalFaculty = Number((session as any).memberCountAtStart || totalFacultyCount || 0);
  const checkedIn = attendanceRecords.length;
  const absent = Math.max(0, totalFaculty - checkedIn);
  const rate = totalFaculty > 0 ? Math.round((checkedIn / totalFaculty) * 100) : 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet("Attendance Report");
  const COLS = 6;

  const titleRow = ws.addRow(["Session Attendance Report"]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, COLS);
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${ACCENT}` } };
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 30;

  ws.addRow([]);

  addInfoRow(ws, "Session ID", String((session as any).sessionId || "N/A"), COLS);
  addInfoRow(ws, "Organization", String((organization as any)?.name || "N/A"), COLS);
  addInfoRow(ws, "Status", (session as any).isActive ? "Active" : "Ended", COLS);
  addInfoRow(ws, "Started", fmtDateTime((session as any).startTime), COLS);
  addInfoRow(
    ws,
    "Ended",
    (session as any).endTime ? fmtDateTime((session as any).endTime) : "N/A",
    COLS
  );
  addInfoRow(ws, "Duration", formatDuration(Number((session as any).duration || 0)), COLS);
  const creatorText = `${String((creator as any)?.name || "N/A")}${
    (creator as any)?.email ? ` (${String((creator as any).email)})` : ""
  }`;
  addInfoRow(ws, "Created By", creatorText, COLS);

  ws.addRow([]);

  addStatRow(
    ws,
    [
      { label: "Total Members", value: String(totalFaculty), color: GREEN },
      { label: "Checked In", value: String(checkedIn), color: GREEN },
      { label: "Absent", value: String(absent), color: RED },
    ],
    COLS
  );
  addStatRow(ws, [{ label: "Attendance Rate", value: `${rate}%`, color: GREEN }], COLS);

  ws.addRow([]);

  const headerRow = ws.addRow(["Sr No", "Name", "Email", "User ID", "Check-in Date", "Check-in Time"]);
  styleTableHeader(headerRow, COLS);

  attendanceRecords.forEach((record: any, idx: number) => {
    const user = userMap.get(record.userId);
    const row = ws.addRow([
      idx + 1,
      String((user as any)?.name || "Unknown"),
      String((user as any)?.email || "Unknown"),
      String(record.userId || "Unknown"),
      fmtDate(record.markedAt),
      fmtTime(record.markedAt),
    ]);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > COLS) return;
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF111111" } };
      cell.border = borderThin;
      cell.alignment = { horizontal: "left", vertical: "middle" };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${EVEN_BG}` } };
      }
    });
  });

  autoFitColumns(ws);

  const content = await wb.xlsx.writeBuffer();
  return Buffer.from(content as ArrayBuffer);
};

export const buildSessionAbsenceReportXlsx = async (sessionId: string): Promise<Buffer> => {
  const session = await Session.findOne({ sessionId }).lean();
  if (!session) {
    throw new Error("Session not found.");
  }

  const creatorId = String((session as any).createdBy || "").trim();

  const [organization, records] = await Promise.all([
    Organization.findOne({ organizationId: (session as any).organizationId }).select("name").lean(),
    Absence.find({ sessionId }).sort({ createdAt: 1 }).lean(),
  ]);

  const attendanceRecords = await Attendance.find({ sessionId }).select("userId").lean();
  const attendedUserIds = new Set(attendanceRecords.map((record: any) => String(record.userId)));

  const totalMembersAtOrg = await User.countDocuments({
    organizationIds: (session as any).organizationId,
  });
  const creator = creatorId
    ? await User.findOne({ userId: creatorId }).select("name email").lean()
    : null;
  const total = Number((session as any).memberCountAtStart || totalMembersAtOrg || 0);
  const attended = attendedUserIds.size;
  const absent = Math.max(0, records.length);
  const excused = records.filter((record: any) => Boolean(record.isExcused)).length;
  const attendancePercentage = total > 0 ? Math.round((attended / total) * 100) : 0;
  const absencePercentage = total > 0 ? Math.round((absent / total) * 100) : 0;

  const wb = new ExcelJS.Workbook();
  wb.creator = APP_NAME;
  wb.created = new Date();

  const ws = wb.addWorksheet("Absence Report");
  const COLS = 7;

  const titleRow = ws.addRow(["Absence Report"]);
  ws.mergeCells(titleRow.number, 1, titleRow.number, COLS);
  titleRow.getCell(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${DANGER}` } };
  titleRow.getCell(1).font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Calibri" };
  titleRow.getCell(1).alignment = { horizontal: "center", vertical: "middle" };
  titleRow.height = 30;

  ws.addRow([]);

  addInfoRow(ws, "Session ID", String((session as any).sessionId || "N/A"), COLS);
  addInfoRow(ws, "Organization", String((organization as any)?.name || "N/A"), COLS);
  if ((session as any).startTime) {
    addInfoRow(ws, "Session Started", fmtDateTime((session as any).startTime), COLS);
  }
  if ((session as any).endTime) {
    addInfoRow(ws, "Session Ended", fmtDateTime((session as any).endTime), COLS);
  }
  addInfoRow(ws, "Duration", formatDuration(Number((session as any).duration || 0)), COLS);
  const creatorText = `${String((creator as any)?.name || "N/A")}${
    (creator as any)?.email ? ` (${String((creator as any).email)})` : ""
  }`;
  addInfoRow(ws, "Created By", creatorText, COLS);

  ws.addRow([]);

  addStatRow(
    ws,
    [
      { label: "Total Members", value: String(total) },
      { label: "Attended", value: `${attended} (${attendancePercentage}%)`, color: GREEN },
      { label: "Absent", value: `${absent} (${absencePercentage}%)`, color: RED },
    ],
    COLS
  );
  addStatRow(
    ws,
    [
      { label: "Excused", value: String(excused) },
      { label: "Pending", value: String(Math.max(0, absent - excused)), color: RED },
    ],
    COLS
  );

  ws.addRow([]);

  const headerRow = ws.addRow(["Sr No", "Faculty Name", "Email", "Faculty ID", "Reason", "Status", "Recorded At"]);
  styleTableHeader(headerRow, COLS);

  records.forEach((record: any, idx: number) => {
    const row = ws.addRow([
      idx + 1,
      String(record.facultyName || "Unknown"),
      String(record.facultyEmail || "Unknown"),
      String(record.facultyId || "Unknown"),
      String(record.reason || "Not Provided"),
      record.isExcused ? "Excused" : "Pending",
      record.createdAt ? fmtDateTime(record.createdAt) : "N/A",
    ]);

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      if (colNumber > COLS) return;
      cell.font = { name: "Calibri", size: 11, color: { argb: "FF111111" } };
      cell.border = borderThin;
      cell.alignment = { horizontal: "left", vertical: "middle" };
      if (idx % 2 === 1) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: `FF${EVEN_BG}` } };
      }
    });

    const statusCell = row.getCell(6);
    statusCell.font = {
      bold: true,
      name: "Calibri",
      size: 11,
      color: { argb: `FF${record.isExcused ? "CA8A04" : RED}` },
    };
  });

  autoFitColumns(ws);
  const content = await wb.xlsx.writeBuffer();
  return Buffer.from(content as ArrayBuffer);
};
