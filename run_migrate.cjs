const { spawn } = require('child_process');
const pty = require('node:child_process'); // Wait, node doesn't have pty builtin.
// I can just use python! Python has pty!
