import { Request, Response } from "express";
import AbsenceService from "../services/absence.service";
import { logAudit } from "../services/audit.service";
import Session from "../models/Session.model";
import Absence from "../models/Absence.model";
import User from "../models/User.model";

const getActiveOrganizationId = (req: Request): string | null => {
	return req.user?.currentOrganizationId || req.user?.organizationIds?.[0] || null;
};

const ensureSessionInActiveOrg = async (req: Request, sessionId: string): Promise<boolean> => {
	const organizationId = getActiveOrganizationId(req);
	if (!organizationId) return false;
	const session = await Session.findOne({ sessionId, organizationId }).select("sessionId").lean();
	return !!session;
};

const ensureAbsenceInActiveOrg = async (req: Request, absenceId: string): Promise<boolean> => {
	const organizationId = getActiveOrganizationId(req);
	if (!organizationId) return false;
	const absence = await Absence.findById(absenceId).select("sessionId").lean();
	if (!absence?.sessionId) return false;
	const session = await Session.findOne({ sessionId: absence.sessionId, organizationId }).select("sessionId").lean();
	return !!session;
};

// Detect absences for a session
export const detectAbsences = async (req: Request, res: Response) => {
	try {
		const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
		if (!(await ensureSessionInActiveOrg(req, sessionId))) {
			return res.status(403).json({ error: "Forbidden: session is outside current organization." });
		}
		const result = await AbsenceService.detectAbsences(sessionId);

		return res.json(result);
	} catch (error: any) {
		return res.status(500).json({ error: error.message });
	}
};
// Get all absences for a session (paginated)
export const getSessionAbsences = async (req: Request, res: Response) => {
	try {
		const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
		if (!(await ensureSessionInActiveOrg(req, sessionId))) {
			return res.status(403).json({ error: "Forbidden: session is outside current organization." });
		}
		const page = Math.max(1, Number(req.query.page) || 1);
		const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
		const result = await AbsenceService.getSessionAbsences(sessionId, page, limit);
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Get all pending absences (paginated)
export const getPendingAbsences = async (req: Request, res: Response) => {
	try {
		const { department, limit, page } = req.query;
		const organizationId = getActiveOrganizationId(req);
		if (!organizationId) {
			return res.status(400).json({ error: "No active organization selected." });
		}
		const filter: any = {};
		if (department) filter.department = String(department);
		if (limit) filter.limit = Number(limit);
		if (page) filter.page = Number(page);
		filter.organizationId = organizationId;
		const result = await AbsenceService.getPendingAbsences(filter);
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Mark absence as excused
export const markAsExcused = async (req: Request, res: Response) => {
	try {
		const absenceId = Array.isArray(req.params.absenceId) ? req.params.absenceId[0] : req.params.absenceId;
		if (!(await ensureAbsenceInActiveOrg(req, absenceId))) {
			return res.status(403).json({ error: "Forbidden: absence is outside current organization." });
		}
		const { reason } = req.body;
		const excusedBy = req.user?.userId;
		const existingAbsence = await Absence.findById(absenceId).select("isExcused sessionId memberName memberEmail").lean();
		if (!existingAbsence) {
			return res.status(404).json({ error: "Absence not found." });
		}
		if (existingAbsence.isExcused) {
			return res.status(409).json({ error: "Absence already excused." });
		}
		const result = await AbsenceService.markAsExcused(absenceId, excusedBy, reason);
		
		// Get organizationId and admin details for audit log
		if (excusedBy) {
			const [session, adminUser] = await Promise.all([
				Session.findOne({ sessionId: existingAbsence.sessionId }).select("organizationId").lean(),
				User.findOne({ userId: excusedBy }).select("name email").lean(),
			]);
			if (session) {
				await logAudit({
					action: "absence_excused",
					performedBy: excusedBy,
					performedByName: adminUser?.name,
					performedByEmail: adminUser?.email,
					targetId: absenceId,
					targetResourceType: "absence",
					targetResourceName: `Absence for ${existingAbsence.memberName}`,
					organizationId: session.organizationId,
					metadata: { reason },
					details: {
						changesSummary: `Excused absence for ${existingAbsence.memberName} (${existingAbsence.memberEmail})`,
						reason: reason || "Not provided",
						result: "success",
					},
				});
			}
		}
		
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Bulk mark absences as excused
export const bulkMarkAsExcused = async (req: Request, res: Response) => {
	try {
		const { absenceIds, reason } = req.body;
		if (!Array.isArray(absenceIds) || absenceIds.length === 0) {
			return res.status(400).json({ error: "absenceIds must be a non-empty array." });
		}
		for (const absenceId of absenceIds) {
			if (!(await ensureAbsenceInActiveOrg(req, absenceId))) {
				return res.status(403).json({ error: "Forbidden: one or more absences are outside current organization." });
			}
		}
		const excusedBy = req.user?.userId;
		const result = await AbsenceService.bulkMarkAsExcused(absenceIds, excusedBy, reason);
		
		// Get organizationId for audit log
		if (excusedBy && Array.isArray(absenceIds) && absenceIds.length > 0) {
			const absence = await Absence.findOne({ _id: absenceIds[0] }).select("sessionId").lean();
			if (absence) {
				const session = await Session.findOne({ sessionId: absence.sessionId }).select("organizationId").lean();
				if (session) {
					await logAudit("absence_excused", excusedBy, undefined, { reason, bulk: true, count: absenceIds.length }, session.organizationId);
				}
			}
		}
		
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Manually mark attendance for absent member
export const markAttendanceManually = async (req: Request, res: Response) => {
	try {
		const absenceId = Array.isArray(req.params.absenceId) ? req.params.absenceId[0] : req.params.absenceId;
		if (!(await ensureAbsenceInActiveOrg(req, absenceId))) {
			return res.status(403).json({ error: "Forbidden: absence is outside current organization." });
		}

		const absence = await Absence.findById(absenceId).select("sessionId memberId memberName memberEmail").lean();
		if (!absence) {
			return res.status(404).json({ error: "Absence not found." });
		}

		const performedBy = req.user?.userId;
		const result = await AbsenceService.markAttendanceManually(absenceId, performedBy);
		
		// Get organizationId for audit log
		if (performedBy) {
			const [session, adminUser] = await Promise.all([
				Session.findOne({ sessionId: absence.sessionId }).select("organizationId").lean(),
				User.findOne({ userId: performedBy }).select("name email").lean(),
			]);
			if (session) {
				await logAudit({
					action: "manual_attendance_override",
					performedBy,
					performedByName: adminUser?.name,
					performedByEmail: adminUser?.email,
					targetId: absenceId,
					targetResourceType: "absence",
					targetResourceName: `Manual attendance override for ${absence.memberName}`,
					organizationId: session.organizationId,
					metadata: {
						sessionId: absence.sessionId,
						memberId: absence.memberId,
						memberEmail: absence.memberEmail,
					},
					details: {
						changesSummary: `Manually marked attendance for ${absence.memberName} (${absence.memberEmail})`,
						result: "success",
					},
				});
			}
		}
		
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Generate absence summary for a session
export const generateSessionSummary = async (req: Request, res: Response) => {
	try {
		const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
		if (!(await ensureSessionInActiveOrg(req, sessionId))) {
			return res.status(403).json({ error: "Forbidden: session is outside current organization." });
		}
		const result = await AbsenceService.generateSessionSummary(sessionId);
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Get absence statistics by department
export const getAbsenceStats = async (req: Request, res: Response) => {
	try {
		const sessionId = Array.isArray(req.params.sessionId) ? req.params.sessionId[0] : req.params.sessionId;
		if (!(await ensureSessionInActiveOrg(req, sessionId))) {
			return res.status(403).json({ error: "Forbidden: session is outside current organization." });
		}
		const result = await AbsenceService.getAbsenceStatsByDepartment(sessionId);
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};

// Cleanup old absence records
export const cleanupOldRecords = async (req: Request, res: Response) => {
	try {
		const { daysToKeep } = req.query;
		const result = await AbsenceService.cleanupOldRecords(Number(daysToKeep) || 90);
		return res.json(result);
	} catch (error) {
		return res.status(500).json({ error: error.message });
	}
};