// Kills any process occupying the Vite dev port (1420) before `pnpm dev` runs.
// Vite runs with strictPort, so a leftover dev server from a previous session
// would otherwise abort startup with "Port 1420 is already in use".
import { execSync } from 'node:child_process';

const PORT = 1420;

function pidsOnPort(port) {
  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' });
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  } catch {
    // lsof exits non-zero when no process matches
    return [];
  }
}

const pids = pidsOnPort(PORT);
if (pids.length === 0) {
  process.exit(0);
}

for (const pid of pids) {
  try {
    const cmd = execSync(`ps -p ${pid} -o command=`, { encoding: 'utf8' }).trim();
    console.log(`[kill-port] port ${PORT} in use by pid ${pid}: ${cmd}`);
  } catch {
    console.log(`[kill-port] port ${PORT} in use by pid ${pid}`);
  }
}

execSync(`kill ${pids.join(' ')}`);

// Wait briefly for the port to be released; escalate to SIGKILL if still held.
for (let i = 0; i < 20 && pidsOnPort(PORT).length > 0; i++) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 100);
}
const remaining = pidsOnPort(PORT);
if (remaining.length > 0) {
  execSync(`kill -9 ${remaining.join(' ')}`);
  console.log(`[kill-port] force killed: ${remaining.join(', ')}`);
}
console.log(`[kill-port] port ${PORT} is free`);
