const fs = require('node:fs');

const values = fs.readFileSync(0, 'utf8').trim().split(/\s+/).filter(Boolean).map(Number);
const a = values[0] ?? 0;
const b = values[1] ?? 0;

process.stdout.write(`${a + b}\n`);
