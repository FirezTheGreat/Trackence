import Absence from "../models/Absence.model";
import Attendance from "../models/Attendance.model";
import Session from "../models/Session.model";
import User from "../models/User.model";
import { generateAttendanceId } from "../utils/id.utils";

class AbsenceService {
  /**
   * Detect absences for a session
   * Identifies faculty who should have marked but didn't
   */
  async detectAbsences(sessionId: string) {
    try {
      // Get session details
      const session = await Session.findOne({ sessionId });
      if (!session) {
        throw new Error("Session not found");
      }

      // Get all members in the organization
      const allMembers = await User.find({
        organizationIds: session.organizationId,
      }).select("userId name email");

      // Get all who marked attendance in this session
      const attendanceRecords = await Attendance.find({ sessionId }).select(
        "userId"
      );
      const attendedFacultyIds = new Set(
        attendanceRecords.map((record) => String(record.userId))
      );

      // Find faculty who didn't mark attendance
      const absentFaculty = allMembers.filter(
        (faculty: any) => !attendedFacultyIds.has(String(faculty.userId))
      );

      // Create absence records for those who didn't attend
      const absenceRecords = await Promise.all(
        absentFaculty.map((faculty) =>
          Absence.findOneAndUpdate(
            { sessionId, facultyId: String((faculty as any).userId) },
            {
              $setOnInsert: {
                sessionId,
                facultyId: String((faculty as any).userId),
                facultyName: faculty.name,
                facultyEmail: faculty.email,
                isExcused: false,
                reason: "Not Provided",
              },
            },
            { upsert: true, returnDocument: "after" }
          )
        )
      );

      return {
        success: true,
        totalFaculty: allMembers.length,
        attended: attendedFacultyIds.size,
        absent: absentFaculty.length,
        absenceRecords,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all absences for a specific session (paginated)
   */
  async getSessionAbsences(
    sessionId: string,
    page: number = 1,
    limit: number = 50
  ) {
    try {
      const skip = (page - 1) * limit;
      const [records, total] = await Promise.all([
        Absence.find({ sessionId })
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit)
          .lean(),
        Absence.countDocuments({ sessionId }),
      ]);
      const excused = await Absence.countDocuments({
        sessionId,
        isExcused: true,
      });
      const pending = total - excused;

      return {
        total,
        excused,
        pending,
        page,
        limit,
        records,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get all pending absences (not excused, paginated)
   */
  async getPendingAbsences(filter?: {
    department?: string;
    limit?: number;
    page?: number;
    organizationId?: string;
  }) {
    try {
      const query: any = { isExcused: false };
      if (filter?.department) {
        query.department = filter.department;
      }
      if (filter?.organizationId) {
        const sessions = await Session.find({ organizationId: filter.organizationId }).select("sessionId").lean();
        const sessionIds = sessions.map((s: any) => s.sessionId);
        query.sessionId = { $in: sessionIds.length ? sessionIds : ["__none__"] };
      }
      const page = Math.max(1, filter?.page || 1);
      const limit = Math.min(100, Math.max(1, filter?.limit || 20));
      const skip = (page - 1) * limit;

      const [records, total] = await Promise.all([
        Absence.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Absence.countDocuments(query),
      ]);

      return { records, total, page, limit };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Mark absence as excused
   */
  async markAsExcused(absenceId: string, excusedBy?: string, reason?: string) {
    try {
      // Fetch the existing absence record to get its reason
      const existingAbsence = await Absence.findById(absenceId);

      if (!existingAbsence) {
        throw new Error("Absence not found.");
      }

      if (existingAbsence.isExcused) {
        throw new Error("Absence already excused.");
      }

      const normalizedReason = reason?.trim();

      const absence = await Absence.findByIdAndUpdate(
        absenceId,
        {
          isExcused: true,
          excusedAt: new Date(),
          excusedBy,
          reason: normalizedReason || existingAbsence.reason || "Not Provided",
        },
        { new: true }
      );

      return absence;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Bulk mark absences as excused
   */
  async bulkMarkAsExcused(
    absenceIds: string[],
    excusedBy?: string,
    reason?: string
  ) {
    try {
      const normalizedReason = reason?.trim();
      const result = await Absence.updateMany(
        { _id: { $in: absenceIds }, isExcused: false },
        {
          isExcused: true,
          excusedAt: new Date(),
          excusedBy,
          reason: normalizedReason || "Bulk Excused",
        }
      );

      return result;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Manually mark attendance for absent faculty
   */
  async markAttendanceManually(absenceId: string, performedBy?: string) {
    try {
      const absence = await Absence.findById(absenceId);
      if (!absence) {
        throw new Error("Absence not found.");
      }

      const existingAttendance = await Attendance.findOne({
        sessionId: absence.sessionId,
        userId: absence.facultyId,
      });

      let attendanceCreated = false;
      if (!existingAttendance) {
        const attendance = new Attendance({
          attendanceId: generateAttendanceId(),
          sessionId: absence.sessionId,
          userId: absence.facultyId,
          markedAt: new Date(),
        });
        await attendance.save();
        attendanceCreated = true;
      }

      absence.markedManually = true;
      absence.markedAt = new Date();
      absence.isExcused = true;
      absence.excusedAt = new Date();
      if (performedBy) {
        absence.excusedBy = performedBy;
      }
      await absence.save();

      return {
        success: true,
        attendanceCreated,
        absence,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Generate absence summary for a session
   */
  async generateSessionSummary(sessionId: string) {
    try {
      const session = await Session.findOne({ sessionId });
      if (!session) {
        throw new Error("Session not found");
      }

      const [attendanceRecords, totalMembersAtOrg] = await Promise.all([
        Attendance.find({ sessionId }).select("userId").lean(),
        User.countDocuments({
          organizationIds: session.organizationId,
        }),
      ]);

      const attendedUserIds = new Set(attendanceRecords.map((record: any) => String(record.userId)));
      const attendance = attendedUserIds.size;
      const total = session.memberCountAtStart ?? totalMembersAtOrg;

      const [absences, excused] = await Promise.all([
        Absence.countDocuments({
          sessionId,
          isExcused: false,
          facultyId: { $nin: Array.from(attendedUserIds) },
        }),
        Absence.countDocuments({
          sessionId,
          isExcused: true,
          facultyId: { $nin: Array.from(attendedUserIds) },
        }),
      ]);

      const attendancePercentage =
        total > 0 ? Math.round((attendance / total) * 100) : 0;
      const absencePercentage =
        total > 0 ? Math.round((absences / total) * 100) : 0;

      return {
        sessionId,
        startedAt: session.startTime,
        duration: session.duration,
        total,
        attended: attendance,
        absent: absences,
        excused,
        attendancePercentage,
        absencePercentage,
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Get absence statistics by department
   */
  async getAbsenceStatsByDepartment(sessionId: string) {
    try {
      const stats = await Absence.aggregate([
        { $match: { sessionId } },
        {
          $group: {
            _id: "$department",
            total: { $sum: 1 },
            excused: { $sum: { $cond: ["$isExcused", 1, 0] } },
            pending: { $sum: { $cond: ["$isExcused", 0, 1] } },
          },
        },
        { $sort: { pending: -1 } },
      ]);

      return stats;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Delete old absence records (cleanup)
   * Keeps records for 90 days
   */
  async cleanupOldRecords(daysToKeep: number = 90) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

      const result = await Absence.deleteMany({
        createdAt: { $lt: cutoffDate },
      });

      return result;
    } catch (error) {
      throw error;
    }
  }
}

export default new AbsenceService();
