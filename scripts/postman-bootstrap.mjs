#!/usr/bin/env node
/**
 * AkewTutor Postman bootstrap  (fixtures for collections 02, 03 and 04)
 *
 * Place at:  backend/scripts/postman-bootstrap.mjs
 * Run from:  backend/   ->   node scripts/postman-bootstrap.mjs --env ../postman/AkewTutor.postman_environment.json
 *
 * Needs the API running (npm run dev) and Postgres reachable via DATABASE_URL in backend/.env.
 * Creates fresh users/fixtures on every run (unique suffix), so it is safe to re-run.
 * Writes a NEW env file (<env>.generated.json); your original is never modified.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

// ── args ────────────────────────────────────────────────────────────
const arg = (name) => {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const candidates = [
  arg('--env'),
  './postman/AkewTutor.postman_environment.json',
  '../postman/AkewTutor.postman_environment.json',
].filter(Boolean);
const envPath = candidates.find((p) => fs.existsSync(p));
if (!envPath) {
  console.error('Env file not found. Pass --env <path to AkewTutor.postman_environment.json>');
  process.exit(1);
}
const outPath = arg('--out') || envPath.replace(/\.json$/, '.generated.json');
const envFile = JSON.parse(fs.readFileSync(envPath, 'utf8'));
const envGet = (k, d = '') => envFile.values.find((v) => v.key === k)?.value || d;

const BASE = (envGet('baseUrl', 'http://localhost:3000')).replace(/\/$/, '');
const RUN = Date.now().toString(36);
const PW = {
  student: envGet('studentPassword', 'Passw0rd!23'),
  parent: envGet('parentPassword', 'Passw0rd!23'),
  tutor: envGet('tutorPassword', 'Passw0rd!23'),
};
const DEFAULT_PW = 'Passw0rd!23';

// ── helpers ─────────────────────────────────────────────────────────
const db = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function api(method, url, { token, body, allow = [] } = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api/v1${url}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      // Always send a JSON body on writes: some controllers destructure req.body,
      // which is undefined in Express 5 when no body is sent (-> 500).
      body: method === 'GET' || method === 'DELETE' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch (e) {
    throw new Error(`Cannot reach ${BASE} — is the API running? (${e.message})`);
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok && !allow.includes(res.status)) {
    throw new Error(`${method} ${url} -> ${res.status} ${JSON.stringify(json)}`);
  }
  return json?.data ?? json;
}

const step = (msg) => console.log(`• ${msg}`);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

async function makeUser(role, tag, { password = DEFAULT_PW, extra = {} } = {}) {
  const email = `${tag}.${RUN}@akew.test`;
  await api('POST', `/auth/register/${role}`, {
    body: { email, password, termsAccepted: true, ...extra },
  });
  const login = await api('POST', '/auth/login', { body: { identifier: email, password } });
  const user = await one('select id from "User" where email = $1', [email]);
  return {
    email,
    userId: user.id,
    token: login.accessToken,
    refreshToken: login.refreshToken,
  };
}

const tutorProfileId = async (userId) =>
  (await one('select id from "TutorProfile" where "userId" = $1', [userId])).id;

// ── main ────────────────────────────────────────────────────────────
const out = {};
try {
  step('Admin login');
  const admin = await api('POST', '/auth/login', {
    body: { identifier: envGet('adminEmail'), password: envGet('adminPassword') },
  });
  out.adminToken = admin.accessToken;
  const A = out.adminToken;

  step('Main personas: student, parent, tutor');
  const student = await makeUser('student', 'student', { password: PW.student, extra: { grade: 8 } });
  const parent = await makeUser('parent', 'parent', { password: PW.parent });
  const tutor = await makeUser('tutor', 'tutor', { password: PW.tutor });
  Object.assign(out, {
    studentEmail: student.email,
    studentUserId: student.userId,
    studentToken: student.token,
    studentRefreshToken: student.refreshToken,
    parentEmail: parent.email,
    parentUserId: parent.userId,
    parentToken: parent.token,
    tutorEmail: tutor.email,
    tutorUserId: tutor.userId,
    tutorToken: tutor.token,
  });
  out.studentProfileId = (
    await one('select id from "StudentProfile" where "userId" = $1', [student.userId])
  ).id;
  out.tutorProfileId = await tutorProfileId(tutor.userId);

  // tutorToken must be REJECTED so "Resubmit verification - success" works
  step('Reject main tutor (so resubmit-verification succeeds)');
  await api('POST', `/admin/tutors/${out.tutorProfileId}/reject`, {
    token: A,
    body: { reason: 'Bootstrap: rejected so resubmit works' },
  });

  step('Extra personas (other parent, unrelated student/tutor)');
  const otherParent = await makeUser('parent', 'otherparent');
  const unrelatedStudent = await makeUser('student', 'unrelatedstudent', { extra: { grade: 9 } });
  const unrelatedTutor = await makeUser('tutor', 'unrelatedtutor');
  out.otherParentToken = otherParent.token;
  out.unrelatedStudentToken = unrelatedStudent.token;
  out.unrelatedTutorToken = unrelatedTutor.token;

  // other tutor's availability slot (for the "not authorized" delete test).
  // Inserted via SQL on purpose: POST /tutors/me/availability currently 500s because
  // availability.service passes the USER id as AvailabilitySlot.tutorId, but the FK
  // points at TutorProfile.id. Fix that in the backend, then this can use the API.
  const otherProfileId = await tutorProfileId(unrelatedTutor.userId);
  out.otherTutorsSlotId = (
    await one(
      `insert into "AvailabilitySlot" (id, "tutorId", "dayOfWeek", "startTime", "endTime", "isRecurring")
       values (gen_random_uuid(), $1, 3, '2026-10-02T09:00:00Z', '2026-10-02T10:00:00Z', true)
       returning id`,
      [otherProfileId],
    )
  ).id;

  step('Tutors for admin verification tests (pending x2, already-reviewed x1)');
  const pending1 = await makeUser('tutor', 'pendingtutor');
  const pending2 = await makeUser('tutor', 'pendingtutor2');
  const reviewed = await makeUser('tutor', 'reviewedtutor');
  out.pendingTutorToken = pending1.token;
  out.pendingTutorId = await tutorProfileId(pending1.userId);
  out.pendingTutorId2 = await tutorProfileId(pending2.userId);
  out.alreadyReviewedTutorId = await tutorProfileId(reviewed.userId);
  await api('POST', `/admin/tutors/${out.alreadyReviewedTutorId}/approve`, { token: A });

  step('Subjects (1-3)');
  for (const n of [1, 2, 3]) {
    const s = await api('POST', '/admin/subjects', {
      token: A,
      body: { name: `Bootstrap Subject ${n} ${RUN}` },
    });
    out[`subjectId${n}`] = s.id;
  }

  step('Guardianship fixtures');
  const addKid = (grade, tag) =>
    api('POST', '/guardianship/students', {
      token: parent.token,
      body: { grade, inviteContact: `${tag}.${RUN}@akew.test` },
    });
  const relA = await addKid(3, 'kid-revoke'); // relationshipId
  const relB = await addKid(3, 'kid-activate'); // inviteToken (activated by the collection)
  const relC = await addKid(3, 'kid-resend'); // inviteId
  const relD = await addKid(3, 'kid-minor'); // activated here -> minorStudentToken + activatedInviteId
  out.relationshipId = relA.relationshipId;
  out.inviteId = relC.relationshipId;
  out.activatedInviteId = relD.relationshipId;
  out.inviteToken = (
    await one('select "inviteToken" from "ParentStudentRelationship" where id = $1', [
      relB.relationshipId,
    ])
  ).inviteToken;
  const tokenD = (
    await one('select "inviteToken" from "ParentStudentRelationship" where id = $1', [
      relD.relationshipId,
    ])
  ).inviteToken;
  const activated = await api('POST', `/guardianship/invites/${tokenD}/activate`, {
    body: { password: DEFAULT_PW },
  });
  out.minorStudentToken = activated.accessToken ?? activated.token;
  // Student that the MAIN parent actively guards (relD is ACTIVE after the
  // activation above) — used by 05 "parent on behalf of student".
  out.guardedStudentProfileId = (
    await one('select \"studentId\" from \"ParentStudentRelationship\" where id = $1', [
      relD.relationshipId,
    ])
  ).studentId;

  step('Matching & cohort fixtures (03)');
  const approvedTutorId = out.alreadyReviewedTutorId;
  out.ineligibleTutorId = out.tutorProfileId; // rejected main tutor
  const newStudent = (tag) => makeUser('student', tag, { extra: { grade: 8 } });

  out.studentNoRequestToken = (await newStudent('norequest')).token;
  out.studentNoCohortToken = (await newStudent('nocohort')).token;

  const busy = await newStudent('activematch');
  await api('POST', '/matching/no-exact-match', {
    token: busy.token,
    body: { subjectId: out.subjectId1 },
  });
  out.studentWithActiveMatchToken = busy.token;

  // Student with an ACTIVE 1-to-1 membership (format-switch tests)
  const switcher = await newStudent('switcher');
  const switcherProfile = (
    await one('select id from "StudentProfile" where "userId" = $1', [switcher.userId])
  ).id;
  const mkCohort = async (status) =>
    (
      await one(
        `insert into "Cohort" (id, "tutorId", "subjectId", status, format, "updatedAt")
         values (gen_random_uuid(), $1, $2, $3::"CohortStatus", 'ONE_TO_ONE', now()) returning id`,
        [approvedTutorId, out.subjectId1, status],
      )
    ).id;
  const activeCohort = await mkCohort('ACTIVE');
  await one(
    `insert into "CohortMembership" (id, "cohortId", "studentId", status, "updatedAt")
     values (gen_random_uuid(), $1, $2, 'ACTIVE'::"MembershipStatus", now()) returning id`,
    [activeCohort, switcherProfile],
  );
  out.studentSwitchToken = switcher.token;

  out.pendingCohortId = await mkCohort('PENDING_ADMIN_APPROVAL');
  out.pendingCohortId2 = await mkCohort('PENDING_ADMIN_APPROVAL');
  out.alreadyApprovedCohortId = await mkCohort('PENDING_PAYMENT');

  step('Throwaway user for the suspend test');
  out.targetUserId = (await makeUser('student', 'suspendme', { extra: { grade: 10 } })).userId;

  // ── Class delivery & library fixtures (collection 04) ─────────────
  // Everything here uses dedicated `delivery*` personas/variables, so collections
  // 01-03 (which own studentToken/tutorToken/cohortId/...) behave exactly as before.
  step('Class-delivery fixtures (04): approved tutor + student, cohorts, sessions, thread, recordings, material');
  const dTutor = await makeUser('tutor', 'deliverytutor');
  const dStudent = await makeUser('student', 'deliverystudent', { extra: { grade: 8 } });
  const dTutorProfileId = await tutorProfileId(dTutor.userId);
  await api('POST', `/admin/tutors/${dTutorProfileId}/approve`, { token: A });
  const dStudentProfileId = (
    await one('select id from "StudentProfile" where "userId" = $1', [dStudent.userId])
  ).id;
  out.deliveryTutorToken = dTutor.token;
  out.deliveryStudentToken = dStudent.token;
  out.deliveryTutorProfileId = dTutorProfileId;
  out.deliveryStudentProfileId = dStudentProfileId;

  // Recurring weekly availability: Sundays 08:00-12:00 UTC (2026-11-01 is a Sunday).
  // The reschedule tests request 09:00 (inside) and 03:00 (outside) on that day.
  await one(
    `insert into "AvailabilitySlot" (id, "tutorId", "dayOfWeek", "startTime", "endTime", "isRecurring")
     values (gen_random_uuid(), $1, 0, '2026-11-01T08:00:00Z', '2026-11-01T12:00:00Z', true)
     returning id`,
    [dTutorProfileId],
  );

  const mkDeliveryCohort = async () =>
    (
      await one(
        `insert into "Cohort" (id, "tutorId", "subjectId", status, format, "sessionsPerWeek", "updatedAt")
         values (gen_random_uuid(), $1, $2, 'ACTIVE'::"CohortStatus", 'ONE_TO_ONE', 1, now()) returning id`,
        [dTutorProfileId, out.subjectId1],
      )
    ).id;
  const mkMembership = async (cohortId, status) =>
    (
      await one(
        `insert into "CohortMembership" (id, "cohortId", "studentId", status, "updatedAt")
         values (gen_random_uuid(), $1, $2, $3::"MembershipStatus", now()) returning id`,
        [cohortId, dStudentProfileId, status],
      )
    ).id;
  const mkThread = async (cohortId, status) =>
    (
      await one(
        `insert into "MessageThread" (id, "cohortId", status)
         values (gen_random_uuid(), $1, $2::"ThreadStatus") returning id`,
        [cohortId, status],
      )
    ).id;
  // offsetHours is relative to now; sessions last one hour.
  const mkSession = async (cohortId, status, offsetHours) =>
    (
      await one(
        `insert into "ScheduledSession" (id, "cohortId", "scheduledStart", "scheduledEnd", status, "updatedAt")
         values (gen_random_uuid(), $1,
                 now() + $2::int * interval '1 hour',
                 now() + $2::int * interval '1 hour' + interval '1 hour',
                 $3::"SessionStatus", now())
         returning id`,
        [cohortId, offsetHours, status],
      )
    ).id;

  // Main delivery cohort: ACTIVE, student has an ACTIVE membership, thread is open.
  out.deliveryCohortId = await mkDeliveryCohort();
  out.deliveryMembershipId = await mkMembership(out.deliveryCohortId, 'ACTIVE');
  out.deliveryThreadId = await mkThread(out.deliveryCohortId, 'ACTIVE');

  // Messaging: membership still PENDING_PAYMENT -> "messaging not available" (403).
  out.deliveryInactiveCohortId = await mkDeliveryCohort();
  await mkMembership(out.deliveryInactiveCohortId, 'PENDING_PAYMENT');

  // Messaging: healthy membership but the admin already closed the thread (403).
  out.deliveryClosedThreadCohortId = await mkDeliveryCohort();
  await mkMembership(out.deliveryClosedThreadCohortId, 'ACTIVE');
  await mkThread(out.deliveryClosedThreadCohortId, 'CLOSED_BY_ADMIN');

  // Sessions (all in the main cohort). Upcoming one is >12h away so it is a free reschedule.
  out.deliverySessionId = await mkSession(out.deliveryCohortId, 'SCHEDULED', 72);
  out.deliveryCompletedSessionId = await mkSession(out.deliveryCohortId, 'COMPLETED', -48);
  out.deliveryMissSessionId = await mkSession(out.deliveryCohortId, 'MISSED', -96);
  await one(
    `insert into "SessionMiss" (id, "sessionId", "causedBy", "missType")
     values (gen_random_uuid(), $1, 'STUDENT'::"MissCause", 'NO_SHOW'::"MissType") returning id`,
    [out.deliveryMissSessionId],
  );

  // Recordings on their own sessions (Recording.sessionId is unique, and the collection
  // uploads a brand-new recording for deliverySessionId). One valid, one expired.
  const recSession = await mkSession(out.deliveryCohortId, 'COMPLETED', -72);
  const expiredRecSession = await mkSession(out.deliveryCohortId, 'COMPLETED', -2400);
  const mkRecording = async (sessionId, expiresInterval) =>
    (
      await one(
        `insert into "Recording" (id, "sessionId", "storageKey", "fileSizeBytes", "expiresAt")
         values (gen_random_uuid(), $1, $2, 1024, now() + $3::interval) returning id`,
        [sessionId, `recordings/bootstrap/${sessionId}.mp4`, expiresInterval],
      )
    ).id;
  out.deliveryRecordingId = await mkRecording(recSession, '30 days');
  out.deliveryExpiredRecordingId = await mkRecording(expiredRecSession, '-1 day');

  // Recording consent: the tutor has already acknowledged; the collection's
  // "Acknowledge consent - success" (student) completes it, which unlocks uploads.
  await one(
    `insert into "RecordingConsent" (id, "tutorId", "studentId", "tutorAcknowledgedAt")
     values (gen_random_uuid(), $1, $2, now()) returning id`,
    [dTutorProfileId, dStudentProfileId],
  );

  // A library material for the admin-override tests.
  out.deliveryMaterialId = (
    await one(
      `insert into "LibraryMaterial" (id, "cohortId", "uploadedByTutorId", title, "fileUrl", "fileType")
       values (gen_random_uuid(), $1, $2, 'Bootstrap worksheet',
               'https://r2.akewtutor.com/library/bootstrap.pdf', 'PDF'::"MaterialFileType")
       returning id`,
      [out.deliveryCohortId, dTutorProfileId],
    )
  ).id;

  // ── Payments, refunds, payouts, disputes & promotions (collection 06) ──
  step('Payments & earnings fixtures (06): payable membership, refunds, payouts, complaints, promotion');
  out.chapaWebhookSecret = process.env.CHAPA_WEBHOOK_SECRET || envGet('chapaWebhookSecret');

  // A dedicated guarded student (ACTIVE guardianship with the MAIN parent) so
  // parentToken may pay for it while otherParentToken may not (403). Fresh user,
  // so no other collection's expectations are touched.
  const relE = await addKid(3, 'kid-pay');
  const tokenE = (
    await one('select "inviteToken" from "ParentStudentRelationship" where id = $1', [
      relE.relationshipId,
    ])
  ).inviteToken;
  await api('POST', `/guardianship/invites/${tokenE}/activate`, { body: { password: DEFAULT_PW } });
  const payStudentProfileId = (
    await one('select "studentId" from "ParentStudentRelationship" where id = $1', [
      relE.relationshipId,
    ])
  ).studentId;

  const payTutor = out.alreadyReviewedTutorId; // approved TutorProfile id
  const mkPayCohort = async () =>
    (
      await one(
        `insert into "Cohort" (id, "tutorId", "subjectId", status, format, "sessionsPerWeek", "updatedAt")
         values (gen_random_uuid(), $1, $2, 'ACTIVE'::"CohortStatus", 'ONE_TO_ONE', 1, now()) returning id`,
        [payTutor, out.subjectId1],
      )
    ).id;
  const mkPayMembership = async (cohortId, status) =>
    (
      await one(
        `insert into "CohortMembership" (id, "cohortId", "studentId", status, "updatedAt")
         values (gen_random_uuid(), $1, $2, $3::"MembershipStatus", now()) returning id`,
        [cohortId, payStudentProfileId, status],
      )
    ).id;
  const mkPayment = async (membershipId, status) =>
    (
      await one(
        `insert into "Payment" (id, "cohortMembershipId", amount, status, "billingPeriodStart", "billingPeriodEnd", "updatedAt")
         values (gen_random_uuid(), $1, 100, $2::"PaymentStatus", now(), now() + interval '28 days', now()) returning id`,
        [membershipId, status],
      )
    ).id;

  // Payable membership (PENDING_PAYMENT). It also carries an already-SUCCESS
  // payment so "resolve dispute - refund issued" has a paid cycle to prorate.
  const payableCohortId = await mkPayCohort();
  out.cohortMembershipId = await mkPayMembership(payableCohortId, 'PENDING_PAYMENT');
  await mkPayment(out.cohortMembershipId, 'SUCCESS');
  // One undelivered (non-completed, non-makeup) session inside the billing period, so
  // proration gives sessionsRemaining > 0 and the dispute refund qualifies for approval.
  await one(
    `insert into "ScheduledSession" (id, "cohortId", "scheduledStart", "scheduledEnd", status, "updatedAt")
     values (gen_random_uuid(), $1, now() + interval '2 days', now() + interval '2 days 1 hour',
             'SCHEDULED'::"SessionStatus", now()) returning id`,
    [payableCohortId],
  );
  // Membership that is NOT awaiting payment (409 case) + a paid payment for refunds.
  out.alreadyPaidMembershipId = await mkPayMembership(await mkPayCohort(), 'ACTIVE');
  const paidPaymentId = await mkPayment(out.alreadyPaidMembershipId, 'SUCCESS');

  const mkRefund = async (status) =>
    (
      await one(
        `insert into "Refund" (id, "paymentId", reason, status, "sessionsRemaining", "totalSessionsBilled", amount)
         values (gen_random_uuid(), $1, 'TUTOR_DROPOUT'::"RefundReason", $2::"RefundStatus", 4, 8, 50) returning id`,
        [paidPaymentId, status],
      )
    ).id;
  out.refundId = await mkRefund('PENDING'); // approve success
  out.refundId2 = await mkRefund('PENDING'); // reject success / validation cases
  out.alreadyActionedRefundId = await mkRefund('APPROVED'); // 409 already actioned
  // Ineligible refund: nothing undelivered (sessionsRemaining 0, amount 0), so
  // approveRefund must reject it with 409 (policy conditions not met).
  out.ineligibleRefundId = (
    await one(
      `insert into "Refund" (id, "paymentId", reason, status, "sessionsRemaining", "totalSessionsBilled", amount)
       values (gen_random_uuid(), $1, 'SESSION_UNDELIVERED'::"RefundReason", 'PENDING'::"RefundStatus", 0, 8, 0) returning id`,
      [paidPaymentId],
    )
  ).id;

  const mkPayout = async (status) =>
    (
      await one(
        `insert into "Payout" (id, "tutorId", "periodStart", "periodEnd", "totalAmount", status, "paidAt")
         values (gen_random_uuid(), $1, now() - interval '14 days', now() - interval '7 days', 500,
                 $2::"PayoutStatus", case when $2 = 'PAID' then now() else null end) returning id`,
        [payTutor, status],
      )
    ).id;
  out.payoutId = await mkPayout('PENDING');
  out.alreadyPaidPayoutId = await mkPayout('PAID');

  const reporterUserId = (
    await one('select "userId" from "StudentProfile" where id = $1', [out.deliveryStudentProfileId])
  ).userId;
  const mkComplaint = async (status, action) =>
    (
      await one(
        `insert into "ComplaintReport" (id, "reporterId", category, description, status, "resolutionAction", "resolutionNotes")
         values (gen_random_uuid(), $1, 'PAYMENT_ISSUE'::"ComplaintCategory", 'Postman 06 fixture complaint',
                 $2::"ComplaintStatus", $3::"ResolutionAction", $4) returning id`,
        [reporterUserId, status, action, action ? 'Closed by fixture' : null],
      )
    ).id;
  out.complaintId = await mkComplaint('OPEN', null); // admin dispute detail / dismiss (runs before 06 files its own)
  out.complaintId2 = await mkComplaint('OPEN', null);
  out.closedComplaintId = await mkComplaint('DISMISSED', 'NO_ACTION');

  const adminUserId = (
    await one('select id from "User" where email = $1', [envGet('adminEmail')])
  ).id;
  out.promotionId = (
    await one(
      `insert into "PromotionCode" (id, code, "discountType", "discountValue", "validFrom", "validTo", "isActive", "createdById")
       values (gen_random_uuid(), $1, 'PERCENT'::"DiscountType", 10, now() - interval '1 day', now() + interval '90 days', true, $2)
       returning id`,
      [`PM${RUN}`.toUpperCase(), adminUserId],
    )
  ).id;

  // ── write env ─────────────────────────────────────────────────────
  for (const [key, value] of Object.entries(out)) {
    const existing = envFile.values.find((v) => v.key === key);
    if (existing) existing.value = value ?? '';
    else envFile.values.push({ key, value: value ?? '', type: 'default', enabled: true });
  }
  envFile.name = `${envFile.name || 'AkewTutor'} (generated)`;
  envFile.id = `${envFile.id || 'akewtutor-env'}-gen`;
  fs.writeFileSync(outPath, JSON.stringify(envFile, null, 2));

  const missing = Object.entries(out).filter(([, v]) => !v).map(([k]) => k);
  console.log(`\n✔ Done. ${Object.keys(out).length} variables written to:\n  ${path.resolve(outPath)}`);
  if (missing.length) console.log(`⚠ Empty values: ${missing.join(', ')}`);
} catch (e) {
  console.error(`\n✘ Bootstrap failed: ${e.message}`);
  process.exitCode = 1;
} finally {
  await db.end();
}
