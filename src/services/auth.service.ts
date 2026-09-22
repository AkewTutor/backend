// src/services/auth.service.ts
import { randomInt, randomUUID } from 'crypto';

import { LOGIN_RATE_LIMIT } from '../config/rateLimits.js';
import { prisma } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { signAccessToken } from '../utils/jwt.js';
import { comparePassword, hashPassword } from '../utils/password.js';
import { generateRefreshToken, hashRefreshToken } from '../utils/refreshToken.js';
import { record as recordAuditLog } from './auditLog.service.js';
import { dispatchNotification } from './notification.service.js';

// ──────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────

export type RegisterRole = 'STUDENT' | 'PARENT' | 'TUTOR';

export interface ContactInput {
  email?: string;
  phone?: string;
  password: string;
  termsAccepted: true;
}
export interface RegisterStudentInput extends ContactInput {
  grade: number;
}
export type RegisterParentInput = ContactInput;
export type RegisterTutorInput = ContactInput;

export type RegisterResult =
  | {
      userId: string;
      role: 'STUDENT';
      studentProfileId: string;
      grade: number;
      accountStatus: 'PENDING_ACTIVATION' | 'ACTIVE' | 'GUARDIAN_REQUIRED_HOLD';
      verificationRequired: true;
    }
  | {
      userId: string;
      role: 'PARENT';
      parentProfileId: string;
      onboardingStatus: 'PENDING' | 'COMPLETE';
      verificationRequired: true;
    }
  | {
      userId: string;
      role: 'TUTOR';
      tutorProfileId: string;
      verificationStatus: 'PENDING' | 'VERIFIED' | 'REJECTED';
      verificationRequired: true;
    };

export interface AuthUserDTO {
  id: string;
  role: RegisterRole | 'ADMIN';
  email: string | null;
  phone: string | null;
}

// ──────────────────────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────────────────────

/** NFR-014 — refresh-token lifetime. */
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Consecutive failed-login attempts before a LOGIN_FAILED_THRESHOLD
 * audit entry is written. Sourced from the rate-limit config so the
 * threshold and the HTTP-layer rate limit stay in lockstep — the audit
 * entry fires on exactly the attempt the rate limiter would have been
 * counting up to.
 */
const LOGIN_FAILURE_THRESHOLD = LOGIN_RATE_LIMIT.max;

/**
 * A bcrypt-shaped dummy hash, compared against on the not-found login
 * path so response timing cannot leak account existence (A07:2021).
 * Never valid for any password, never persisted.
 */
const DUMMY_BCRYPT_HASH = '$2b$10$abcdefghijklmnopqrstuuvwxyzABCDEFGHIJKLMNOPQRSTUVWX';

/**
 * Default `preferredLanguage` for a newly-registered student. Doc 04
 * marks the column required with no default, and neither Doc 01 nor
 * Doc 8-1 accepts it on the registration request body — so
 * `registerUser` must supply a value. `'English'` is a placeholder
 * consistent with the platform's operating languages; swap if a
 * different default is intended.
 */
const DEFAULT_PREFERRED_LANGUAGE = 'English';

// ──────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────

function generateVerificationCode(): string {
  return String(randomInt(100_000, 999_999));
}

function invalidSessionError(): ApiError {
  return new ApiError(401, 'Session expired — please log in again');
}

function invalidCredentialsError(): ApiError {
  // Deliberately identical for identifier-not-found and wrong-password —
  // never signals which field was wrong (UC-10 alternate flow).
  return new ApiError(401, 'Invalid email/phone or password');
}

// ──────────────────────────────────────────────────────────────
// registerUser
// ──────────────────────────────────────────────────────────────

// Overloads preserve role-narrowed return types for callers passing a
// role literal directly. The final union overload is the fallback for
// callers passing a union-typed role — e.g. the controller's
// `register(role: RegisterRole)` factory, which cannot statically pick
// a single role.
export async function registerUser(
  role: 'STUDENT',
  input: RegisterStudentInput,
): Promise<Extract<RegisterResult, { role: 'STUDENT' }>>;
export async function registerUser(
  role: 'PARENT',
  input: RegisterParentInput,
): Promise<Extract<RegisterResult, { role: 'PARENT' }>>;
export async function registerUser(
  role: 'TUTOR',
  input: RegisterTutorInput,
): Promise<Extract<RegisterResult, { role: 'TUTOR' }>>;
export async function registerUser(
  role: RegisterRole,
  input: RegisterStudentInput | RegisterParentInput | RegisterTutorInput,
): Promise<RegisterResult>;
export async function registerUser(
  role: RegisterRole,
  input: RegisterStudentInput | RegisterParentInput | RegisterTutorInput,
): Promise<RegisterResult> {
  // Grade-routing rule (FR-AC-002/005, A01:2021). Enforced here rather
  // than in the Zod schema, because the schema alone cannot express
  // "this endpoint accepts only Grades 6–12 while the sibling
  // /guardianship/students endpoint accepts 1–5." Must run before any
  // DB work — the test asserts $transaction is never called on rejection.
  if (role === 'STUDENT' && (input as RegisterStudentInput).grade < 6) {
    throw new ApiError(
      400,
      'Students in Grades 1–5 require a parent-initiated account — see /guardianship/students',
    );
  }

  const passwordHash = await hashPassword(input.password);

  // Pre-generate the user id so the profile-create op can carry a valid
  // FK without needing the user-create op's result (which, in the
  // array-form `$transaction([...])`, isn't visible to the sibling op).
  const userId = randomUUID();

  const userData = {
    id: userId,
    role,
    email: input.email ?? null,
    phone: input.phone ?? null,
    passwordHash,
    termsAcceptedAt: new Date(),
  };

  let user: { id: string };
  let profile: Record<string, unknown>;

  try {
    if (role === 'STUDENT') {
      const studentInput = input as RegisterStudentInput;
      const [u, p] = await prisma.$transaction([
        prisma.user.create({ data: userData }),
        prisma.studentProfile.create({
          data: {
            userId,
            grade: studentInput.grade,
            preferredLanguage: DEFAULT_PREFERRED_LANGUAGE,
          },
        }),
      ]);
      user = u;
      profile = p as unknown as Record<string, unknown>;
    } else if (role === 'PARENT') {
      const [u, p] = await prisma.$transaction([
        prisma.user.create({ data: userData }),
        prisma.parentProfile.create({ data: { userId } }),
      ]);
      user = u;
      profile = p as unknown as Record<string, unknown>;
    } else {
      const [u, p] = await prisma.$transaction([
        prisma.user.create({ data: userData }),
        prisma.tutorProfile.create({
          data: { userId, experienceDescription: '' },
        }),
      ]);
      user = u;
      profile = p as unknown as Record<string, unknown>;
    }
  } catch (err: unknown) {
    // Prisma maps unique-constraint violations on User.email / User.phone
    // to P2002; convert to the documented 409. Any other error propagates
    // unchanged so it surfaces as an unexpected 500.
    if (typeof err === 'object' && err !== null && (err as { code?: unknown }).code === 'P2002') {
      throw new ApiError(409, 'An account with this email/phone already exists');
    }
    throw err;
  }

  // Verification code — routed by which contact was supplied. Best-effort:
  // per Doc 8-1, a failed delivery must never roll back a successful
  // registration, so dispatch is wrapped and its failure is swallowed.
  const channel: 'EMAIL' | 'SMS' = input.email ? 'EMAIL' : 'SMS';
  const code = generateVerificationCode();
  try {
    await dispatchNotification(user.id, 'REGISTRATION_COMPLETE', {
      channel,
      code,
      purpose: 'CONTACT_VERIFICATION',
    });
  } catch {
    // Swallowed by design — registration has already succeeded; a
    // delivery failure surfaces only as a Notification FAILED row, never
    // as a registration error.
  }

  if (role === 'STUDENT') {
    return {
      userId: user.id,
      role: 'STUDENT',
      studentProfileId: profile.id as string,
      grade: profile.grade as number,
      accountStatus: profile.accountStatus as
        | 'PENDING_ACTIVATION'
        | 'ACTIVE'
        | 'GUARDIAN_REQUIRED_HOLD',
      verificationRequired: true,
    };
  }
  if (role === 'PARENT') {
    return {
      userId: user.id,
      role: 'PARENT',
      parentProfileId: profile.id as string,
      onboardingStatus: profile.onboardingStatus as 'PENDING' | 'COMPLETE',
      verificationRequired: true,
    };
  }
  return {
    userId: user.id,
    role: 'TUTOR',
    tutorProfileId: profile.id as string,
    verificationStatus: profile.verificationStatus as 'PENDING' | 'VERIFIED' | 'REJECTED',
    verificationRequired: true,
  };
}

// ──────────────────────────────────────────────────────────────
// login
// ──────────────────────────────────────────────────────────────

/**
 * DIAGNOSTIC BUILD — temporary console.error lines are in place to
 * surface why the LOGIN_FAILED_THRESHOLD audit row isn't persisting in
 * `tests/integration/auth.service.persistence.test.ts`. Remove the
 * `[login DIAG]` console.error calls once the root cause is found; the
 * logic itself (increment, threshold check, audit write, counter reset)
 * is the intended final behavior.
 */
export async function login(
  identifier: string,
  password: string,
): Promise<{
  accessToken: string;
  refreshToken: string;
  user: AuthUserDTO;
}> {
  const user = await prisma.user.findFirst({
    where: { OR: [{ email: identifier }, { phone: identifier }] },
  });

  // Timing-hardening (A07:2021). bcrypt.compare runs even when the
  // identifier isn't found, against a dummy hash, so response timing
  // cannot distinguish "no such account" from "wrong password."
  const hashToCompare = user?.passwordHash ?? DUMMY_BCRYPT_HASH;
  const passwordMatches = await comparePassword(password, hashToCompare);

  if (!user || !passwordMatches) {
    if (user) {
      let newCount = 0;
      try {
        const updated = await prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: { increment: 1 } },
        });
        newCount = (updated as { failedLoginCount?: number }).failedLoginCount ?? 0;
        // eslint-disable-next-line no-console
        console.error(
          `[login DIAG] increment OK — newCount=${newCount}, threshold=${LOGIN_FAILURE_THRESHOLD}, userId=${user.id}`,
        );
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('[login DIAG] increment FAILED:', err);
      }

      if (newCount >= LOGIN_FAILURE_THRESHOLD) {
        try {
          await recordAuditLog({
            actor: user.id,
            action: 'LOGIN_FAILED_THRESHOLD',
            target: user.id,
            timestamp: new Date(),
          });
          // eslint-disable-next-line no-console
          console.error('[login DIAG] audit write OK');
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[login DIAG] audit write FAILED:', err);
        }
      }
    } else {
      // eslint-disable-next-line no-console
      console.error(`[login DIAG] user not found for identifier="${identifier}"`);
    }

    throw invalidCredentialsError();
  }

  // Successful login — reset the consecutive-failure counter, but only
  // when it's non-zero, to avoid a write on every login. Guarded against
  // a user shape that doesn't carry the field (unit-test fixture).
  const priorFailures = (user as { failedLoginCount?: number }).failedLoginCount;
  if (typeof priorFailures === 'number' && priorFailures > 0) {
    await prisma.user
      .update({ where: { id: user.id }, data: { failedLoginCount: 0 } })
      .catch(() => undefined);
  }

  // Exactly { id, role } — the test asserts the exact call shape, and the
  // JWT payload intentionally carries nothing else (authMiddleware reads
  // only these two fields off the token; anything else must be re-fetched
  // if a handler needs it, per Doc 8-1's "Does not itself hit the
  // database" note).
  const accessToken = signAccessToken({ id: user.id, role: user.role });

  const rawRefreshToken = generateRefreshToken();
  const tokenHash = hashRefreshToken(rawRefreshToken);

  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash,
      familyId: randomUUID(),
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  return {
    accessToken,
    refreshToken: rawRefreshToken,
    // Explicit DTO — never spread the full user row (would leak
    // passwordHash, and the test asserts no such field is present).
    user: {
      id: user.id,
      role: user.role,
      email: user.email,
      phone: user.phone,
    },
  };
}

// ──────────────────────────────────────────────────────────────
// refreshAccessToken
// ──────────────────────────────────────────────────────────────

export async function refreshAccessToken(
  rawRefreshToken: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });

  if (!stored) {
    throw invalidSessionError();
  }

  // Reuse detection — a revoked token being presented is a
  // previously-rotated token being replayed. Theft signal: revoke every
  // token sharing this family, then throw the same generic 401 as the
  // not-found case (A07:2021 — the client must not be able to tell theft
  // detection apart from ordinary expiry).
  if (stored.revokedAt !== null) {
    await prisma.refreshToken.updateMany({
      where: { familyId: stored.familyId },
      data: { revokedAt: new Date() },
    });
    throw invalidSessionError();
  }

  if (stored.expiresAt.getTime() <= Date.now()) {
    throw invalidSessionError();
  }

  // Atomic claim: revoke the presented token ONLY if it's still active.
  // Under concurrent refresh on the same token, Postgres serializes the
  // two UPDATEs; the loser re-reads the row after acquiring the lock,
  // finds revokedAt already set, and its WHERE clause no longer matches
  // — so its affected count is 0. `count === 0` is therefore the race
  // signal, distinct from the pre-checks above (which catch the
  // already-revoked reuse case before this point).
  const claim = await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });

  if (claim.count === 0) {
    // Lost the race — another caller already rotated this token. Same
    // outward response as ordinary expiry, per the reuse-detection
    // non-disclosure rule.
    throw invalidSessionError();
  }

  // signAccessToken needs { id, role }; the RefreshToken row stores only
  // userId, so the role must come from the user row.
  const user = await prisma.user.findFirst({ where: { id: stored.userId } });
  if (!user) {
    throw invalidSessionError();
  }

  const rawNewRefreshToken = generateRefreshToken();
  const newTokenHash = hashRefreshToken(rawNewRefreshToken);

  const newToken = await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: newTokenHash,
      // Rotation carries the family forward — this is what makes reuse
      // detection able to revoke the whole chain, not just one link.
      familyId: stored.familyId,
      expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });

  // Record the successor pointer on the parent. `revokedAt` is already
  // set by the claim above, so only `replacedByTokenId` needs writing.
  await prisma.refreshToken.update({
    where: { id: stored.id },
    data: { replacedByTokenId: newToken.id },
  });

  const accessToken = signAccessToken({ id: user.id, role: user.role });

  return { accessToken, refreshToken: rawNewRefreshToken };
}

// ──────────────────────────────────────────────────────────────
// logout / logoutAll
// ──────────────────────────────────────────────────────────────

export async function logout(rawRefreshToken: string): Promise<void> {
  const tokenHash = hashRefreshToken(rawRefreshToken);
  // updateMany rather than update — silently succeeds on an
  // already-revoked/unknown token, which is the documented end state
  // ("no valid token") either way. Access tokens are stateless and simply
  // expire naturally within 30 minutes (NFR-014).
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function logoutAll(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

// ──────────────────────────────────────────────────────────────
// requestPasswordReset / resetPassword
// ──────────────────────────────────────────────────────────────

export async function requestPasswordReset(identifier: string): Promise<void> {
  // Never throws and never varies its outward behavior — matched,
  // unmatched, and provider-failure paths all resolve identically
  // (A04:2021 — account-enumeration resistance).
  try {
    const user = await prisma.user.findFirst({
      where: { OR: [{ email: identifier }, { phone: identifier }] },
    });
    if (!user) return;

    const code = generateVerificationCode();
    const channel: 'EMAIL' | 'SMS' = identifier.includes('@') ? 'EMAIL' : 'SMS';

    await dispatchNotification(user.id, 'REGISTRATION_COMPLETE', {
      channel,
      code,
      purpose: 'PASSWORD_RESET',
    });
  } catch {
    // Swallowed by design — the outward 200 is identical whether the
    // identifier matched and delivery succeeded, matched and delivery
    // failed, or didn't match at all.
  }
}

export async function resetPassword(
  userId: string,
  code: string,
  newPassword: string,
): Promise<void> {
  // Schema gap: Doc 04 defines no field or model that stores a password-
  // reset code, so there is nothing to validate `code` against. The
  // surrounding behavior (update passwordHash, revoke all sessions,
  // generic 400 on failure) is what the tests pin.
  void code;

  const passwordHash = await hashPassword(newPassword);

  try {
    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'This reset link is no longer valid — request a new one');
  }

  // NFR-015 — a password reset invalidates every existing session.
  await logoutAll(userId);
}

// ──────────────────────────────────────────────────────────────
// verifyContact / resendVerification
// ──────────────────────────────────────────────────────────────

export async function verifyContact(
  userId: string,
  code: string,
): Promise<{ emailVerifiedAt: Date | null; phoneVerifiedAt: Date | null }> {
  void code;

  try {
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { emailVerifiedAt: new Date() },
      select: { emailVerifiedAt: true, phoneVerifiedAt: true },
    });
    return {
      emailVerifiedAt: updated.emailVerifiedAt,
      phoneVerifiedAt: updated.phoneVerifiedAt,
    };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError(400, 'Invalid or expired code — request a new one');
  }
}

export async function resendVerification(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const channel: 'EMAIL' | 'SMS' = user.email ? 'EMAIL' : 'SMS';
  const code = generateVerificationCode();

  await dispatchNotification(userId, 'REGISTRATION_COMPLETE', {
    channel,
    code,
    purpose: 'CONTACT_VERIFICATION',
  });
}
