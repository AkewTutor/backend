with open('tests/utils/providers/storage.client.test.ts', 'r') as f:
    content = f.read()

content = content.replace("const putObjectMock = vi.fn();\nconst getSignedUrlMock = vi.fn();", """const { putObjectMock, getSignedUrlMock } = vi.hoisted(() => ({
  putObjectMock: vi.fn(),
  getSignedUrlMock: vi.fn()
}));""")

with open('tests/utils/providers/storage.client.test.ts', 'w') as f:
    f.write(content)
