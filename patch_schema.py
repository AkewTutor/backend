import re

with open('prisma/schema.prisma', 'r') as f:
    content = f.read()

# Add to User
if 'rescheduleRequestsRequested' not in content:
    content = content.replace(
        '  pricingConfigs       PricingConfig[]',
        '  pricingConfigs       PricingConfig[]\n  rescheduleRequestsRequested RescheduleRequest[]\n  recordingConsentsAcknowledged RecordingConsent[] @relation("ConsentAcknowledgedBy")'
    )

# Add to StudentProfile
if 'recordingConsents' not in content:
    content = content.replace(
        '  formatSwitchRequests  FormatSwitchRequest[]',
        '  formatSwitchRequests  FormatSwitchRequest[]\n  recordingConsents     RecordingConsent[]'
    )

# Add to TutorProfile
if 'recordingConsents' not in content:
    content = content.replace(
        '  tutorExclusions   TutorExclusion[]',
        '  tutorExclusions   TutorExclusion[]\n  recordingConsents RecordingConsent[]\n  libraryMaterials  LibraryMaterial[]\n  weeklyAssessments WeeklyAssessment[]'
    )

# Add to Cohort
if 'scheduledSessions' not in content:
    content = content.replace(
        '  matchRequests   MatchRequest[]',
        '  matchRequests   MatchRequest[]\n  scheduledSessions ScheduledSession[]\n  libraryMaterials  LibraryMaterial[]'
    )

# Add to CohortMembership
if 'weeklyAssessments' not in content:
    content = content.replace(
        '  formatSwitches FormatSwitchRequest[]',
        '  formatSwitches FormatSwitchRequest[]\n  weeklyAssessments WeeklyAssessment[]'
    )

# Append new enums and models
new_code = """
// ---- PHASE 4: CLASS DELIVERY & LIBRARY ----

enum SessionStatus {
  SCHEDULED
  COMPLETED
  MISSED
  RESCHEDULED
  PAYMENT_PAUSE_RESCHEDULED
  CANCELLED
}

enum RecordingUploadStatus {
  PENDING
  UPLOADED
  MISSING
  ESCALATED
}

enum RescheduleClassification {
  FREE_RESCHEDULE
  SAME_DAY_MISS
}

enum MissCause {
  TUTOR
  STUDENT
}

enum MissType {
  NO_SHOW
  LATE_CANCELLATION
  TECHNICAL_FAILURE
}

enum MaterialFileType {
  PDF
  NOTE
  BOOK
}

model ScheduledSession {
  id                 String                @id @default(uuid())
  cohortId           String
  scheduledStart     DateTime
  scheduledEnd       DateTime
  jitsiLinkUrl       String?
  jitsiLinkSentAt    DateTime?
  status             SessionStatus         @default(SCHEDULED)
  isMakeup           Boolean               @default(false)
  makeupForSessionId String?
  recordingStatus    RecordingUploadStatus @default(PENDING)
  createdAt          DateTime              @default(now())
  updatedAt          DateTime              @updatedAt

  cohort           Cohort              @relation(fields: [cohortId], references: [id])
  makeupForSession ScheduledSession?   @relation("MakeupSession", fields: [makeupForSessionId], references: [id])
  makeupSessions   ScheduledSession[]  @relation("MakeupSession")
  
  rescheduleRequests RescheduleRequest[]
  sessionMiss        SessionMiss?
  recording          Recording?
}

model RescheduleRequest {
  id                String                   @id @default(uuid())
  sessionId         String
  requestedById     String
  requestedNewStart DateTime
  noticeHours       Decimal
  classification    RescheduleClassification
  createdAt         DateTime                 @default(now())

  session     ScheduledSession @relation(fields: [sessionId], references: [id])
  requestedBy User             @relation(fields: [requestedById], references: [id])
}

model SessionMiss {
  id              String   @id @default(uuid())
  sessionId       String   @unique
  causedBy        MissCause
  missType        MissType
  makeupSessionId String?
  createdAt       DateTime @default(now())

  session       ScheduledSession @relation("MissedSession", fields: [sessionId], references: [id])
  // We don't strictly bind makeupSessionId in the Prisma relation since it's a loosely coupled reference for reporting
}

model RecordingConsent {
  id                            String    @id @default(uuid())
  tutorId                       String
  studentId                     String
  tutorAcknowledgedAt           DateTime?
  studentOrParentAcknowledgedAt DateTime?
  acknowledgedByUserId          String?
  createdAt                     DateTime  @default(now())

  tutor          TutorProfile   @relation(fields: [tutorId], references: [id])
  student        StudentProfile @relation(fields: [studentId], references: [id])
  acknowledgedBy User?          @relation("ConsentAcknowledgedBy", fields: [acknowledgedByUserId], references: [id])

  @@unique([tutorId, studentId])
}

model Recording {
  id              String   @id @default(uuid())
  sessionId       String   @unique
  storageKey      String
  fileSizeBytes   Int
  encoding        String   @default("720p")
  createdAt       DateTime @default(now())
  expiresAt       DateTime
  keepPermanently Boolean  @default(false)
  deletedAt       DateTime?

  session ScheduledSession @relation(fields: [sessionId], references: [id])
}

model LibraryMaterial {
  id                String           @id @default(uuid())
  cohortId          String
  uploadedByTutorId String
  title             String
  fileUrl           String
  fileType          MaterialFileType
  createdAt         DateTime         @default(now())

  cohort     Cohort       @relation(fields: [cohortId], references: [id])
  uploadedBy TutorProfile @relation(fields: [uploadedByTutorId], references: [id])
}

model WeeklyAssessment {
  id                 String   @id @default(uuid())
  cohortMembershipId String
  weekStartDate      DateTime
  scoreSummary       String?
  tutorFeedback      String
  submittedByTutorId String
  createdAt          DateTime @default(now())

  cohortMembership CohortMembership @relation(fields: [cohortMembershipId], references: [id])
  submittedBy      TutorProfile     @relation(fields: [submittedByTutorId], references: [id])

  @@unique([cohortMembershipId, weekStartDate])
}
"""

if 'ScheduledSession' not in content:
    content += new_code

with open('prisma/schema.prisma', 'w') as f:
    f.write(content)

print("Schema updated successfully.")
