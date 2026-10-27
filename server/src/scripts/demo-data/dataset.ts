/**
 * Deterministic demo dataset generator (pure: no DB access).
 *
 * Models a B.Tech CSE semester-3 timetable: four classes (one Organization each), ~9 weeks of
 * sessions in IST, per-student attendance tendencies and a mid-semester dip. Documents mirror
 * what the real flows write (createSession, markAttendance, the expiry scheduler,
 * detectAbsences, join-request approval, invites, excuse/override) with backdated timestamps.
 */
import { fakerEN_IN as faker } from "@faker-js/faker";
import { Types } from "mongoose";
import { NAME_GROUPS } from "./names";

export const DEMO_SEED = 20261027;

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const IST_OFFSET_MS = 330 * MINUTE;

// Same alphabets as utils/id.utils.ts (customAlphabet) and nanoid's default url alphabet.
const ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const NANOID_ALPHABET = "useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict";

type Doc = Record<string, any>;

type Person = {
    userId: string;
    name: string;
    email: string;
    createdAt: Date;
    tier: "perfect" | "regular" | "irregular" | "chronic" | "staff";
    base: number;
    lateProb: number;
    createDoc: boolean;
};

type Enrollment = {
    person: Person;
    joinedAt: Date;
    requestedAt: Date;
    role: "member" | "admin";
    approvedBy: string;
    viaInvite: boolean;
    courseAdj: number;
};

type Course = {
    key: "dsa" | "dbms" | "pns" | "web";
    code: string;
    name: string;
    description: string;
    slots: Array<{ dow: number; h: number; m: number; bias: number }>;
    window: number;
    refreshInterval: number;
    bias: number;
};

const COURSES: Course[] = [
    {
        key: "dsa",
        code: "DEMO-CS2101",
        name: "Data Structures & Algorithms · CSE 3A (Demo)",
        description: "CS2101, B.Tech CSE Semester 3, Section A. Demo dataset: every student here is fictional.",
        slots: [
            { dow: 1, h: 9, m: 0, bias: -0.03 },
            { dow: 3, h: 9, m: 0, bias: 0 },
            { dow: 5, h: 11, m: 0, bias: 0 },
        ],
        window: 10,
        refreshInterval: 10,
        bias: 0,
    },
    {
        key: "dbms",
        code: "DEMO-CS2103",
        name: "Database Management Systems · CSE 3A (Demo)",
        description: "CS2103, B.Tech CSE Semester 3, Section A (with ECE electives). Demo dataset: every student here is fictional.",
        slots: [
            { dow: 2, h: 10, m: 0, bias: 0 },
            { dow: 4, h: 10, m: 0, bias: 0 },
            { dow: 5, h: 14, m: 0, bias: -0.04 },
        ],
        window: 10,
        refreshInterval: 15,
        bias: 0.01,
    },
    {
        key: "pns",
        code: "DEMO-MA2105",
        name: "Probability & Statistics · CSE/ECE (Demo)",
        description: "MA2105, combined CSE + ECE lecture. Demo dataset: every student here is fictional.",
        slots: [
            { dow: 1, h: 14, m: 0, bias: -0.02 },
            { dow: 3, h: 11, m: 30, bias: 0 },
            { dow: 4, h: 14, m: 0, bias: -0.01 },
        ],
        window: 10,
        refreshInterval: 10,
        bias: -0.04,
    },
    {
        key: "web",
        code: "DEMO-CS2181",
        name: "Web Technologies Lab · CSE 3A Batch 1 (Demo)",
        description: "CS2181 lab, Batch 1. Demo dataset: every student here is fictional.",
        slots: [{ dow: 2, h: 14, m: 0, bias: 0 }],
        window: 15,
        refreshInterval: 20,
        bias: 0.03,
    },
];

// Week index within the 9-week window (0 = oldest). dow: 1 = Monday.
const HOLIDAYS = [
    { week: 3, dow: 3 },
    { week: 6, dow: 1 },
];
const CANCELLED = [
    { course: "dbms", week: 2, dow: 4 },
    { course: "pns", week: 5, dow: 3 },
];
const WEEK_ADJUSTMENT = [0.01, 0, 0, -0.01, -0.07, -0.08, -0.03, 0, 0];

export type DemoInput = {
    owner: { userId: string; name: string; email: string };
    student: { userId: string | null; name: string; email: string } | null;
    anchorDay: Date;
    now: Date;
};

export type RealUserLink = {
    userId: string;
    memberships: Array<{ organizationId: string; role: "member" | "admin" }>;
    currentOrganizationId: string;
};

export type DemoDataset = {
    organizations: Doc[];
    users: Doc[];
    sessions: Doc[];
    attendances: Doc[];
    absences: Doc[];
    auditlogs: Doc[];
    emailnotifications: Doc[];
    organizationjoinrequests: Doc[];
    organizationinvites: Doc[];
    realUserLinks: RealUserLink[];
    primaryOrganizationId: string;
    window: { from: Date; to: Date };
};

/** IST calendar day (as UTC midnight) for an instant. */
export const istDay = (instant: Date): Date => {
    const shifted = new Date(instant.getTime() + IST_OFFSET_MS);
    return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
};

export const generateDemoDataset = (input: DemoInput): DemoDataset => {
    faker.seed(DEMO_SEED);
    const { owner, now } = input;

    const rand = () => faker.number.float({ min: 0, max: 1 });
    const between = (min: number, max: number) => min + (max - min) * rand();
    const chance = (p: number) => rand() < p;
    const at = (base: Date, deltaMs: number) => new Date(base.getTime() + Math.round(deltaMs));
    const istAt = (day: Date, h: number, m: number) => new Date(day.getTime() + (h * 60 + m) * MINUTE - IST_OFFSET_MS);
    const earliest = (...dates: Date[]) => new Date(Math.min(...dates.map((d) => d.getTime())));
    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const usedIds = new Set<string>();
    const newId = (prefix: string) => {
        let id: string;
        do {
            id = `${prefix}-${faker.string.fromCharacters(ID_ALPHABET, 8)}`;
        } while (usedIds.has(id));
        usedIds.add(id);
        return id;
    };
    // ObjectIds whose embedded timestamp matches the document's creation time.
    const oid = (createdAt: Date) =>
        new Types.ObjectId(
            Math.floor(createdAt.getTime() / 1000).toString(16).padStart(8, "0") +
            faker.string.hexadecimal({ length: 16, casing: "lower", prefix: "" })
        );
    const nanoidLike = (length: number) => faker.string.fromCharacters(NANOID_ALPHABET, length);

    // ---- Timeline --------------------------------------------------------------
    const anchorDay = input.anchorDay;
    const anchorMonday = new Date(anchorDay.getTime() - ((anchorDay.getUTCDay() + 6) % 7) * DAY);
    const semesterStart = new Date(anchorMonday.getTime() - 8 * 7 * DAY);
    const orgCreatedAt = at(istAt(new Date(semesterStart.getTime() - 9 * DAY), 16, 20), between(0, 40 * MINUTE));
    const dayOf = (week: number, dow: number) => new Date(semesterStart.getTime() + (week * 7 + dow - 1) * DAY);

    // ---- People ----------------------------------------------------------------
    const usedEmails = new Set<string>([owner.email.toLowerCase()]);
    const usedNames = new Set<string>();
    const slug = (value: string) => value.toLowerCase().normalize("NFD").replace(/[^a-z]+/g, "");

    const makeIdentity = () => {
        for (let attempt = 0; ; attempt++) {
            const group = faker.helpers.weightedArrayElement(NAME_GROUPS.map((g) => ({ weight: g.weight, value: g })));
            const female = chance(0.48);
            const first = faker.helpers.arrayElement(female ? group.female : group.male);
            const last = faker.helpers.arrayElement(female && group.femaleSurnames ? group.femaleSurnames : group.surnames);
            const name = `${first} ${last}`;
            if (usedNames.has(name) && attempt < 20) continue;
            usedNames.add(name);
            const base = `${slug(first)}.${slug(last)}`;
            let email = `${base}@example.com`;
            for (let n = 2; usedEmails.has(email); n++) email = `${base}${n}@example.com`;
            usedEmails.add(email);
            return { name, email };
        }
    };

    const makeStudent = (): Person => {
        const roll = rand();
        const tier: Person["tier"] = roll < 0.1 ? "perfect" : roll < 0.8 ? "regular" : roll < 0.92 ? "irregular" : "chronic";
        const base = tier === "perfect" ? 1 : tier === "regular" ? between(0.84, 0.99) : tier === "irregular" ? between(0.66, 0.8) : between(0.36, 0.58);
        return {
            userId: newId("USR"),
            ...makeIdentity(),
            createdAt: semesterStart,
            tier,
            base,
            lateProb: chance(0.12) ? between(0.2, 0.35) : between(0.02, 0.07),
            createDoc: true,
        };
    };

    const makeStaff = (): Person => ({
        userId: newId("USR"),
        ...makeIdentity(),
        createdAt: semesterStart,
        tier: "staff",
        base: 0.93,
        lateProb: 0.04,
        createDoc: true,
    });

    const cse = Array.from({ length: 64 }, makeStudent);
    const ece = Array.from({ length: 44 }, makeStudent);
    const tas = COURSES.map(makeStaff);
    const applicants = Array.from({ length: 9 }, makeStudent);

    let demoStudent: Person | null = null;
    if (input.student) {
        usedEmails.add(input.student.email.toLowerCase());
        demoStudent = {
            userId: input.student.userId || newId("USR"),
            name: input.student.name,
            email: input.student.email.toLowerCase(),
            createdAt: semesterStart,
            tier: "regular",
            base: 0.88,
            lateProb: 0.08,
            createDoc: !input.student.userId,
        };
    }

    // ---- Organizations, enrollments, invites -----------------------------------
    const organizations: Doc[] = [];
    const organizationjoinrequests: Doc[] = [];
    const organizationinvites: Doc[] = [];
    const auditlogs: Doc[] = [];
    const enrollmentsByCourse = new Map<Course["key"], Enrollment[]>();
    const orgIdByCourse = new Map<Course["key"], string>();
    const taPromotedAt = at(orgCreatedAt, 22 * HOUR);

    const audit = (doc: Doc) => {
        const timestamp: Date = doc.timestamp;
        auditlogs.push({ _id: oid(timestamp), auditId: newId("AUD"), createdAt: timestamp, updatedAt: timestamp, ...doc });
    };

    const rosterFor = (key: Course["key"]): Person[] => {
        switch (key) {
            case "dsa":
                return [...cse, ...(demoStudent ? [demoStudent] : [])];
            case "dbms":
                return [...faker.helpers.shuffle([...cse]).slice(0, 50), ...ece.slice(36, 44)];
            case "pns":
                return [...faker.helpers.shuffle([...cse]).slice(0, 30), ...ece.slice(0, 40)];
            case "web":
                return faker.helpers.shuffle([...cse]).slice(0, 40);
        }
    };

    for (const [index, course] of COURSES.entries()) {
        const organizationId = newId("ORG");
        orgIdByCourse.set(course.key, organizationId);
        const ta = tas[index]!;
        const createdAt = at(orgCreatedAt, index * between(4, 9) * MINUTE);

        audit({
            action: "organization_created",
            performedBy: owner.userId,
            targetId: organizationId,
            organizationId,
            metadata: { name: course.name, code: course.code },
            details: {},
            timestamp: at(createdAt, 300),
        });

        // Batch invite link shared on the class WhatsApp group before the semester (now expired).
        const launchInvite: Doc = {
            _id: oid(at(createdAt, HOUR)),
            token: nanoidLike(32),
            organizationId,
            createdBy: owner.userId,
            invitedEmail: null,
            invitedUserId: null,
            expiresAt: at(createdAt, HOUR + 7 * DAY),
            useCount: 0,
            createdAt: at(createdAt, HOUR),
            updatedAt: at(createdAt, HOUR),
        };
        organizationinvites.push(launchInvite);
        audit({
            action: "organization_updated",
            performedBy: owner.userId,
            targetId: organizationId,
            organizationId,
            metadata: { scope: "invite_created", organizationId, invitedEmail: null, invitedUserId: null, expiresAt: launchInvite.expiresAt },
            details: {},
            timestamp: at(launchInvite.createdAt, 200),
        });

        const enrollments: Enrollment[] = [];
        const taJoinedAt = at(createdAt, 20 * HOUR);
        enrollments.push({
            person: ta,
            joinedAt: taJoinedAt,
            requestedAt: at(taJoinedAt, -between(1, 5) * HOUR),
            role: "admin",
            approvedBy: owner.userId,
            viaInvite: false,
            courseAdj: 0,
        });

        for (const person of rosterFor(course.key)) {
            const lateJoin = person !== demoStudent && chance(0.06);
            const joinedAt = lateJoin
                ? at(istAt(new Date(semesterStart.getTime() + Math.floor(between(2, 12)) * DAY), 10, 0), between(0, 9 * HOUR))
                : person === demoStudent
                    ? at(istAt(new Date(semesterStart.getTime() - 3 * DAY), 19, 30), between(0, 20 * MINUTE))
                    : at(istAt(new Date(semesterStart.getTime() - Math.floor(between(1, 7)) * DAY), 10, 0), between(0, 12 * HOUR));
            const requestedAt = new Date(Math.max(at(joinedAt, -between(10 * MINUTE, 30 * HOUR)).getTime(), at(launchInvite.createdAt, 5 * MINUTE).getTime()));
            const approvedBy = joinedAt > taPromotedAt && chance(0.25) ? ta.userId : owner.userId;
            const viaInvite = joinedAt < launchInvite.expiresAt && requestedAt < launchInvite.expiresAt && chance(0.3);
            if (viaInvite) launchInvite.useCount += 1;
            enrollments.push({
                person,
                joinedAt,
                requestedAt,
                role: "member",
                approvedBy,
                viaInvite,
                courseAdj: person.tier === "perfect" ? 0 : between(-0.04, 0.04),
            });
        }

        enrollments.sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
        enrollmentsByCourse.set(course.key, enrollments);

        for (const enrollment of enrollments) {
            organizationjoinrequests.push({
                _id: oid(enrollment.requestedAt),
                userId: enrollment.person.userId,
                organizationId,
                status: "approved",
                requestedAt: enrollment.requestedAt,
                processedAt: enrollment.joinedAt,
                processedBy: enrollment.approvedBy,
                requestSource: enrollment.viaInvite ? "invite" : "direct",
                inviteToken: enrollment.viaInvite ? launchInvite.token : null,
                decisionNote: null,
                createdAt: enrollment.requestedAt,
                updatedAt: enrollment.joinedAt,
            });
            audit({
                action: "org_join_approved",
                performedBy: enrollment.approvedBy,
                targetId: organizationId,
                organizationId,
                metadata: { targetUserId: enrollment.person.userId, organizationName: course.name },
                details: {},
                timestamp: at(enrollment.joinedAt, 150),
            });
            enrollment.person.createdAt = earliest(enrollment.person.createdAt, at(enrollment.requestedAt, -between(5 * MINUTE, 2 * DAY)));
        }

        audit({
            action: "member_promoted_to_admin",
            performedBy: owner.userId,
            targetId: organizationId,
            organizationId,
            metadata: { targetUserId: ta.userId },
            details: {},
            timestamp: taPromotedAt,
        });

        organizations.push({
            _id: oid(createdAt),
            organizationId,
            name: course.name,
            code: course.code,
            description: course.description,
            createdBy: owner.userId,
            owner: owner.userId,
            isActive: true,
            members: [],
            createdAt,
            updatedAt: createdAt,
        });
    }

    // Applicants: pending requests (dashboard action item) and a few rejected ones.
    const pendingTargets: Course["key"][] = ["dsa", "dsa", "pns", "pns", "dbms", "web"];
    const requestedByUser = new Map<string, string[]>();
    applicants.forEach((person, index) => {
        const pending = index < pendingTargets.length;
        const courseKey = pending ? pendingTargets[index]! : "web";
        const organizationId = orgIdByCourse.get(courseKey)!;
        const requestedAt = pending
            ? at(now, -between(3 * HOUR, 70 * HOUR))
            : at(semesterStart, between(1 * DAY, 10 * DAY));
        person.createdAt = at(requestedAt, -between(5 * MINUTE, 3 * HOUR));
        const processedAt = pending ? null : at(requestedAt, between(2 * HOUR, 20 * HOUR));

        organizationjoinrequests.push({
            _id: oid(requestedAt),
            userId: person.userId,
            organizationId,
            status: pending ? "pending" : "rejected",
            requestedAt,
            processedAt,
            processedBy: pending ? null : owner.userId,
            requestSource: "direct",
            inviteToken: null,
            decisionNote: pending ? null : "You're registered in Batch 2 — please join the Batch 2 lab group instead.",
            createdAt: requestedAt,
            updatedAt: processedAt || requestedAt,
        });
        if (pending) {
            requestedByUser.set(person.userId, [organizationId]);
        } else {
            audit({
                action: "org_join_rejected",
                performedBy: owner.userId,
                targetId: organizationId,
                organizationId,
                metadata: { targetUserId: person.userId },
                details: {},
                timestamp: at(processedAt!, 120),
            });
        }
    });

    // Current invite links plus a couple of personal invites (one pending, one revoked).
    for (const course of COURSES) {
        const organizationId = orgIdByCourse.get(course.key)!;
        const createdAt = at(now, -between(1 * DAY, 3 * DAY));
        organizationinvites.push({
            _id: oid(createdAt),
            token: nanoidLike(32),
            organizationId,
            createdBy: owner.userId,
            invitedEmail: null,
            invitedUserId: null,
            expiresAt: at(createdAt, 7 * DAY),
            useCount: 0,
            createdAt,
            updatedAt: createdAt,
        });
        audit({
            action: "organization_updated",
            performedBy: owner.userId,
            targetId: organizationId,
            organizationId,
            metadata: { scope: "invite_created", organizationId, invitedEmail: null, invitedUserId: null, expiresAt: at(createdAt, 7 * DAY) },
            details: {},
            timestamp: at(createdAt, 200),
        });
    }

    const personalInvite = (courseKey: Course["key"], createdAt: Date, revoked: boolean) => {
        const organizationId = orgIdByCourse.get(courseKey)!;
        const invitedEmail = makeIdentity().email;
        const revokedAt = revoked ? at(createdAt, between(6 * HOUR, 30 * HOUR)) : null;
        organizationinvites.push({
            _id: oid(createdAt),
            token: nanoidLike(32),
            organizationId,
            createdBy: owner.userId,
            invitedEmail,
            invitedUserId: null,
            expiresAt: at(createdAt, 7 * DAY),
            revokedAt,
            revokedBy: revoked ? owner.userId : null,
            useCount: 0,
            createdAt,
            updatedAt: revokedAt || createdAt,
        });
        audit({
            action: "organization_updated",
            performedBy: owner.userId,
            targetId: organizationId,
            organizationId,
            metadata: { scope: "invite_created", organizationId, invitedEmail, invitedUserId: null, expiresAt: at(createdAt, 7 * DAY) },
            details: {},
            timestamp: at(createdAt, 200),
        });
        if (revokedAt) {
            audit({
                action: "organization_updated",
                performedBy: owner.userId,
                targetId: organizationId,
                organizationId,
                metadata: { scope: "invite_revoked", invitedEmail, invitedUserId: null },
                details: {},
                timestamp: revokedAt,
            });
        }
    };
    personalInvite("dsa", at(now, -between(5 * HOUR, 30 * HOUR)), false);
    personalInvite("pns", at(now, -between(5 * HOUR, 30 * HOUR)), false);
    personalInvite("dbms", at(semesterStart, between(8 * DAY, 12 * DAY)), true);

    // ---- Sessions, attendance, absences, notifications --------------------------
    const sessions: Doc[] = [];
    const attendances: Doc[] = [];
    const absences: Doc[] = [];
    const emailnotifications: Doc[] = [];
    const isHoliday = (week: number, dow: number) => HOLIDAYS.some((h) => h.week === week && h.dow === dow);
    const isCancelled = (key: string, week: number, dow: number) => CANCELLED.some((c) => c.course === key && c.week === week && c.dow === dow);
    const latestEnd = at(now, -2 * MINUTE);

    for (let week = 0; week < 9; week++) {
        for (const [courseIndex, course] of COURSES.entries()) {
            const organizationId = orgIdByCourse.get(course.key)!;
            const enrollments = enrollmentsByCourse.get(course.key)!;
            const ta = enrollments.find((e) => e.role === "admin")!.person;

            for (const [slotIndex, slot] of course.slots.entries()) {
                // Independent stream per session, so re-running later in the day cannot shift earlier sessions.
                faker.seed([DEMO_SEED, week, courseIndex, slotIndex]);
                if (isHoliday(week, slot.dow) || isCancelled(course.key, week, slot.dow)) continue;

                const startTime = at(istAt(dayOf(week, slot.dow), slot.h, slot.m), between(0, 4.5 * MINUTE));
                const endTime = at(startTime, course.window * MINUTE);
                const endedManually = chance(0.15);
                const endedAt = endedManually ? at(startTime, between(0.6, 0.9) * course.window * MINUTE) : endTime;
                const closedAt = endedManually ? endedAt : at(endTime, between(1000, 30000)); // scheduler ticks every 30s
                if (closedAt > latestEnd) continue;

                const sessionId = newId("SES");
                const members = enrollments.filter((e) => e.joinedAt <= startTime);
                const memberCountAtStart = members.length + 1; // + owner
                const shock = between(-0.03, 0.03);

                // Host auto-marked on create (ensureSessionCreatorAttendance), then session_created.
                const hostMarkedAt = at(startTime, between(30, 400));
                const hostAttendanceId = newId("ATT");
                attendances.push({ _id: oid(hostMarkedAt), attendanceId: hostAttendanceId, sessionId, userId: owner.userId, markedAt: hostMarkedAt, createdAt: hostMarkedAt, updatedAt: hostMarkedAt });
                audit({
                    action: "attendance_marked",
                    performedBy: owner.userId,
                    performedByName: owner.name,
                    performedByEmail: owner.email,
                    targetId: sessionId,
                    targetResourceType: "session",
                    targetResourceName: `Auto-marked session host for ${sessionId}`,
                    organizationId,
                    metadata: { attendanceId: hostAttendanceId, sessionId, mode: "auto_host_on_session_create" },
                    details: { sessionCode: sessionId, changesSummary: "Automatically marked session creator present.", result: "success" },
                    timestamp: at(hostMarkedAt, 8),
                });
                audit({
                    action: "session_created",
                    performedBy: owner.userId,
                    performedByName: owner.name,
                    performedByEmail: owner.email,
                    targetId: sessionId,
                    targetResourceType: "session",
                    targetResourceName: `Session for ${course.window} minutes`,
                    organizationId,
                    metadata: {
                        duration: course.window,
                        refreshInterval: course.refreshInterval,
                        startTime,
                        endTime,
                        notification: { recipientsCount: 0, useOrgDefaultRecipients: true, sendSessionEndEmail: true, sendAbsenceEmail: true, attachReport: true },
                        hostAutoMarkApplied: true,
                        hostAutoMarkReason: "created",
                        hostAutoAttendanceId: hostAttendanceId,
                    },
                    details: { sessionCode: sessionId, sessionStatus: "active", changesSummary: `Created new QR session with ${course.window} min duration` },
                    timestamp: at(hostMarkedAt, 25),
                });

                const cutoffSec = (endedAt.getTime() - startTime.getTime()) / 1000;
                let scanned = 1; // host
                const absentMembers: Enrollment[] = [];

                for (const enrollment of members) {
                    const { person } = enrollment;
                    const probability = person.tier === "perfect"
                        ? 1
                        : clamp(person.base + enrollment.courseAdj + course.bias + slot.bias + WEEK_ADJUSTMENT[week]! + shock, 0.03, 0.99);
                    if (!chance(probability)) {
                        absentMembers.push(enrollment);
                        continue;
                    }

                    // Scans cluster in the first few minutes; habitual latecomers drift towards the cutoff.
                    const offsetSec = chance(person.lateProb)
                        ? between(300, Math.max(310, cutoffSec - 15))
                        : Math.min(280, 12 + -Math.log(1 - rand()) * 70);
                    if (offsetSec >= cutoffSec - 3) {
                        absentMembers.push(enrollment);
                        continue;
                    }

                    const markedAt = at(startTime, offsetSec * 1000 + between(0, 999));
                    const attendanceId = newId("ATT");
                    attendances.push({ _id: oid(markedAt), attendanceId, sessionId, userId: person.userId, markedAt, createdAt: markedAt, updatedAt: markedAt });
                    audit({
                        action: "attendance_marked",
                        performedBy: person.userId,
                        performedByName: person.name,
                        performedByEmail: person.email,
                        targetId: sessionId,
                        targetResourceType: "session",
                        targetResourceName: `Attendance for ${person.name}`,
                        organizationId,
                        metadata: { attendanceId, sessionId },
                        details: { sessionCode: sessionId, changesSummary: `Marked attendance for ${person.name}`, result: "success" },
                        timestamp: at(markedAt, between(20, 120)),
                    });
                    scanned += 1;
                }

                // Session closes (scheduler expiry or manual end), then detectAbsences runs.
                audit({
                    action: "session_deleted",
                    performedBy: endedManually ? owner.userId : "system",
                    targetId: sessionId,
                    organizationId,
                    details: {},
                    timestamp: at(closedAt, 40),
                });

                for (const enrollment of absentMembers) {
                    const { person } = enrollment;
                    const createdAt = at(closedAt, between(150, 900));
                    const absence: Doc = {
                        _id: oid(createdAt),
                        sessionId,
                        memberId: person.userId,
                        memberName: person.name,
                        memberEmail: person.email,
                        reason: "Not Provided",
                        isExcused: false,
                        markedManually: false,
                        createdAt,
                        updatedAt: createdAt,
                    };
                    const actor = chance(0.7) ? owner : ta;
                    const ageDays = (now.getTime() - closedAt.getTime()) / DAY;

                    const overrideAt = at(closedAt, between(10 * MINUTE, 90 * MINUTE));
                    if (person.tier !== "chronic" && chance(0.03) && overrideAt < now) {
                        // markAttendanceManually: creates the attendance and flags the absence.
                        const attendanceId = newId("ATT");
                        attendances.push({ _id: oid(overrideAt), attendanceId, sessionId, userId: person.userId, markedAt: overrideAt, createdAt: overrideAt, updatedAt: overrideAt });
                        Object.assign(absence, { markedManually: true, markedAt: overrideAt, isExcused: true, excusedAt: overrideAt, excusedBy: actor.userId, updatedAt: overrideAt });
                        audit({
                            action: "manual_attendance_override",
                            performedBy: actor.userId,
                            performedByName: actor.name,
                            performedByEmail: actor.email,
                            targetId: String(absence._id),
                            targetResourceType: "absence",
                            targetResourceName: `Manual attendance override for ${person.name}`,
                            organizationId,
                            metadata: { sessionId, memberId: person.userId, memberEmail: person.email },
                            details: { changesSummary: `Manually marked attendance for ${person.name} (${person.email})`, result: "success" },
                            timestamp: at(overrideAt, 60),
                        });
                    } else {
                        const excuseProbability = person.tier === "chronic" ? 0.06 : ageDays > 7 ? 0.17 : ageDays > 2 ? 0.08 : 0.02;
                        const excusedAt = at(closedAt, between(3 * HOUR, 72 * HOUR));
                        if (chance(excuseProbability) && excusedAt < at(now, -10 * MINUTE)) {
                            const reason = faker.helpers.weightedArrayElement([
                                { weight: 50, value: "Medical" },
                                { weight: 35, value: "Leave" },
                                { weight: 15, value: "Other" },
                            ]);
                            Object.assign(absence, { isExcused: true, excusedAt, excusedBy: actor.userId, reason, updatedAt: excusedAt });
                            audit({
                                action: "absence_excused",
                                performedBy: actor.userId,
                                performedByName: actor.name,
                                performedByEmail: actor.email,
                                targetId: String(absence._id),
                                targetResourceType: "absence",
                                targetResourceName: `Absence for ${person.name}`,
                                organizationId,
                                metadata: { reason },
                                details: { changesSummary: `Excused absence for ${person.name} (${person.email})`, reason, result: "success" },
                                timestamp: at(excusedAt, 60),
                            });
                        }
                    }
                    absences.push(absence);
                }

                if (endedManually) {
                    audit({
                        action: "session_deleted",
                        performedBy: owner.userId,
                        performedByName: owner.name,
                        performedByEmail: owner.email,
                        targetId: sessionId,
                        targetResourceType: "session",
                        targetResourceName: "Session ended manually",
                        organizationId,
                        details: { sessionCode: sessionId, sessionStatus: "completed", changesSummary: `Manually ended session ${sessionId}`, result: "success" },
                        timestamp: at(closedAt, between(1500, 4000)),
                    });
                }

                // Session-end + absence emails to the creator (history only: never queued).
                const absentCount = absentMembers.length;
                const totalAttendedAtClose = scanned;
                const triggeredBy = endedManually ? owner.userId : "system";
                const mails = [
                    {
                        eventType: "session_ended",
                        subject: `Session ended - ${sessionId}`,
                        html: `<p>Session <strong>${sessionId}</strong> has ended.</p><p>Duration: <strong>${course.window} min</strong></p><p>Total attendance marked: <strong>${totalAttendedAtClose}</strong></p><p>Total absent: <strong>${absentCount}</strong></p><p>Total members: <strong>${memberCountAtStart}</strong></p><p>— Trackence</p>`,
                        metadata: { totalMarked: totalAttendedAtClose, sessionDuration: course.window, totalAbsent: absentCount, totalMember: memberCountAtStart },
                    },
                    {
                        eventType: "absence_detected",
                        subject: `Absence detected - ${sessionId}`,
                        html: `<p>Absence detection completed for <strong>${sessionId}</strong>.</p><p>Total absent: <strong>${absentCount}</strong></p><p>Total members: <strong>${memberCountAtStart}</strong></p><p>Attended: <strong>${totalAttendedAtClose}</strong></p><p>— Trackence</p>`,
                        metadata: { absentCount, totalMember: memberCountAtStart, attended: totalAttendedAtClose },
                    },
                ];
                mails.forEach((mail, mailIndex) => {
                    const createdAt = at(closedAt, between(1200, 3500) + mailIndex * 150);
                    const dead = mail.eventType === "absence_detected" && week === 6 && course.key === "pns" && slot.dow === 4;
                    const sentAt = at(createdAt, between(2000, 9000));
                    emailnotifications.push({
                        _id: oid(createdAt),
                        notificationId: `NTF-${faker.string.fromCharacters("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789", 12)}`,
                        eventType: mail.eventType,
                        fromCategory: "report",
                        organizationId,
                        sessionId,
                        dedupeKey: `${mail.eventType}:${sessionId}`,
                        triggeredBy,
                        recipients: [owner.email.toLowerCase()],
                        subject: mail.subject,
                        html: mail.html,
                        text: null,
                        attachments: [],
                        // "dead" (attempts exhausted) is never picked up by the worker; "failed" would be retried.
                        status: dead ? "dead" : "sent",
                        attempts: dead ? 5 : 1,
                        maxAttempts: 5,
                        nextAttemptAt: dead ? at(createdAt, 75 * MINUTE) : createdAt,
                        sentAt: dead ? null : sentAt,
                        lastError: dead ? "Resend API error (429): Too many requests. Please slow down." : null,
                        metadata: mail.metadata,
                        createdAt,
                        updatedAt: dead ? at(createdAt, 75 * MINUTE) : sentAt,
                    });
                });

                sessions.push({
                    _id: oid(startTime),
                    sessionId,
                    organizationId,
                    createdBy: owner.userId,
                    startTime,
                    endTime,
                    duration: course.window,
                    refreshInterval: course.refreshInterval,
                    memberCountAtStart,
                    isActive: false,
                    notification: {
                        recipients: [],
                        includeCreator: true,
                        sendSessionEndEmail: true,
                        sendAbsenceEmail: true,
                        attachReport: true,
                        inheritedDefaultRecipients: [],
                    },
                    createdAt: startTime,
                    updatedAt: closedAt,
                });
            }
        }
    }

    // ---- Users and denormalized membership ---------------------------------------
    const membershipsByUser = new Map<string, Array<{ organizationId: string; role: "member" | "admin"; joinedAt: Date }>>();
    for (const course of COURSES) {
        const organizationId = orgIdByCourse.get(course.key)!;
        for (const enrollment of enrollmentsByCourse.get(course.key)!) {
            const list = membershipsByUser.get(enrollment.person.userId) || [];
            list.push({ organizationId, role: enrollment.role, joinedAt: enrollment.joinedAt });
            membershipsByUser.set(enrollment.person.userId, list);
        }
    }

    const people = [...tas, ...cse, ...ece, ...applicants, ...(demoStudent ? [demoStudent] : [])];
    const users: Doc[] = [];
    for (const person of people) {
        if (!person.createDoc) continue;
        const memberships = (membershipsByUser.get(person.userId) || []).sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
        const organizationIds = memberships.map((m) => m.organizationId);
        const lastChange = memberships.length ? memberships[memberships.length - 1]!.joinedAt : person.createdAt;
        users.push({
            _id: oid(person.createdAt),
            userId: person.userId,
            name: person.name,
            email: person.email,
            organizationIds,
            currentOrganizationId: organizationIds[0] || null,
            requestedOrganizationIds: requestedByUser.get(person.userId) || [],
            blockedPublicJoinOrgIds: [],
            userOrgRoles: memberships.map((m) => ({ organizationId: m.organizationId, role: m.role })),
            platformRole: "user",
            createdAt: person.createdAt,
            updatedAt: lastChange > person.createdAt ? lastChange : person.createdAt,
        });
    }

    // Organization.members mirrors syncOrgMembers(): every user whose organizationIds include the org.
    for (const org of organizations) {
        const course = COURSES.find((c) => orgIdByCourse.get(c.key) === org.organizationId)!;
        const enrollments = enrollmentsByCourse.get(course.key)!;
        org.members = [
            { userId: owner.userId, name: owner.name, email: owner.email, role: "admin", isOrgAdmin: true },
            ...enrollments.map((e) => ({
                userId: e.person.userId,
                name: e.person.name,
                email: e.person.email,
                role: e.role,
                isOrgAdmin: e.role === "admin",
            })),
        ];
        org.updatedAt = enrollments[enrollments.length - 1]!.joinedAt;
    }

    const primaryOrganizationId = orgIdByCourse.get("dsa")!;
    const realUserLinks: RealUserLink[] = [
        {
            userId: owner.userId,
            memberships: COURSES.map((c) => ({ organizationId: orgIdByCourse.get(c.key)!, role: "admin" as const })),
            currentOrganizationId: primaryOrganizationId,
        },
    ];
    if (demoStudent && !demoStudent.createDoc) {
        realUserLinks.push({
            userId: demoStudent.userId,
            memberships: [{ organizationId: primaryOrganizationId, role: "member" }],
            currentOrganizationId: primaryOrganizationId,
        });
    }

    auditlogs.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return {
        organizations,
        users,
        sessions,
        attendances,
        absences,
        auditlogs,
        emailnotifications,
        organizationjoinrequests,
        organizationinvites,
        realUserLinks,
        primaryOrganizationId,
        window: { from: semesterStart, to: latestEnd },
    };
};
