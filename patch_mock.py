with open('tests/utils/providers/storage.client.test.ts', 'r') as f:
    content = f.read()

content = content.replace("S3Client: vi.fn().mockImplementation(() => ({ send: putObjectMock })),", "S3Client: vi.fn().mockImplementation(function() { return { send: putObjectMock }; }),")
content = content.replace("PutObjectCommand: vi.fn().mockImplementation((input) => ({ input })),", "PutObjectCommand: vi.fn().mockImplementation(function(input) { return { input }; }),")
content = content.replace("GetObjectCommand: vi.fn().mockImplementation((input) => ({ input })),", "GetObjectCommand: vi.fn().mockImplementation(function(input) { return { input }; }),")

with open('tests/utils/providers/storage.client.test.ts', 'w') as f:
    f.write(content)
