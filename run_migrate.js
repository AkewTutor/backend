const { spawn } = require('child_process');
const child = spawn('npx', ['prisma', 'migrate', 'dev', '--name', 'gamification_engagement'], { stdio: ['pipe', 'pipe', 'pipe'] });

child.stdout.on('data', (data) => {
  const output = data.toString();
  process.stdout.write(output);
  if (output.includes('We need to reset the') || output.includes('Do you want to continue?') || output.includes('Are you sure')) {
    child.stdin.write('y\n');
  }
});

child.stderr.on('data', (data) => {
  process.stderr.write(data.toString());
});

child.on('close', (code) => {
  process.exit(code);
});
