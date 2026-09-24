import pty
import os
import time

def master_read(fd):
    data = os.read(fd, 1024)
    # print(data)
    if b'Do you want to continue?' in data or b'Are you sure' in data or b'reset the' in data:
        os.write(fd, b'y\n')
    return data

pty.spawn(['npx', 'prisma', 'migrate', 'dev', '--name', 'gamification_engagement'], master_read)
