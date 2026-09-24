with open('src/controllers/library.controller.ts', 'r') as f:
    content = f.read()

content = content.replace(
    'const cohortId = req.params.cohortId;',
    'const cohortId = req.params.cohortId as string;'
)
content = content.replace(
    'const materialId = req.params.id;',
    'const materialId = req.params.id as string;'
)

with open('src/controllers/library.controller.ts', 'w') as f:
    f.write(content)


with open('src/services/library.service.ts', 'r') as f:
    svc = f.read()

svc = svc.replace(
    "const { storageKey } = await storageUpload(fileBuffer, `library/${cohortId}/${Date.now()}-${fileType}`);",
    "const { storageKey } = await storageUpload(`library/${cohortId}/${Date.now()}-${fileType}`, fileBuffer, 'application/pdf');"
)
svc = svc.replace(
    """    data: {
      cohortId,
      title,
      fileType: fileType as any,
      fileUrl: `https://r2.akewtutor.com/${storageKey}`,
    },""",
    """    data: {
      cohortId,
      uploadedByTutorId: tutorId,
      title,
      fileType: fileType as any,
      fileUrl: `https://r2.akewtutor.com/${storageKey}`,
    },"""
)

if "data: { removedAt: new Date() }," not in svc:
    print("WARNING: removedAt not found")

with open('src/services/library.service.ts', 'w') as f:
    f.write(svc)

