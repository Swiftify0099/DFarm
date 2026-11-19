import { spawn, exec, execSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const isWindows = process.platform === 'win32';
const npmCmd = isWindows ? 'npm.cmd' : 'npm';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

// Terminal color codes
const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
};

const SERVICES = {
  backend: {
    id: 'backend',
    name: 'Backend API',
    prefix: '[BACKEND]',
    color: colors.cyan,
    cmd: 'node',
    args: ['services/backend/dist/server.js'],
    cwd: rootDir,
    port: 4000,
    url: 'http://localhost:4000',
  },
  dairyAdmin: {
    id: 'dairy-admin',
    name: 'Dairy Admin Web',
    prefix: '[DAIRY-ADMIN]',
    color: colors.blue,
    cmd: npmCmd,
    args: ['run', 'dev', '--workspace=apps/dfarm-dairy-admin'],
    cwd: rootDir,
    port: 5174,
    url: 'http://localhost:5174',
  },
  superAdmin: {
    id: 'super-admin',
    name: 'Super Admin Web',
    prefix: '[SUPER-ADMIN]',
    color: colors.magenta,
    cmd: npmCmd,
    args: ['run', 'dev', '--workspace=apps/dfarm-super-admin'],
    cwd: rootDir,
    port: 5173,
    url: 'http://localhost:5173',
  },
  collectionApp: {
    id: 'collection',
    name: 'Milk Collection App',
    prefix: '[COLLECTION]',
    color: colors.yellow,
    cmd: npmCmd,
    args: ['run', 'dev', '--workspace=apps/dfarm-collection-app'],
    cwd: rootDir,
    port: 5175,
    url: 'http://localhost:5175',
  },
  customerAppWeb: {
    id: 'customer',
    name: 'Customer Web/Expo App',
    prefix: '[CUSTOMER]',
    color: colors.green,
    cmd: npmCmd,
    args: ['run', 'web', '--workspace=apps/dfarm-customer-app'],
    cwd: rootDir,
    port: 8081,
    url: 'http://localhost:8081',
  },
  customerAppAndroid: {
    id: 'customer-android',
    name: 'Customer Android App',
    prefix: '[CUSTOMER-ANDROID]',
    color: colors.green,
    cmd: npmCmd,
    args: ['run', 'android', '--workspace=apps/dfarm-customer-app'],
    cwd: rootDir,
    port: 8081,
    url: 'Android Device / Emulator',
  },
  hub: {
    id: 'hub',
    name: 'Unified Platform Hub',
    prefix: '[HUB]',
    color: colors.white,
    cmd: 'node',
    args: ['scripts/dev-server.js'],
    cwd: rootDir,
    port: 3000,
    url: 'http://localhost:3000',
  },
};

const activeProcesses = [];

function killProcessTree(pid) {
  if (!pid) return;
  if (isWindows) {
    try {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } catch (_err) {}
  } else {
    try {
      process.kill(-pid, 'SIGKILL');
    } catch (_err) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch (_e) {}
    }
  }
}

function freePort(port, serviceName) {
  if (!port) return;
  try {
    if (isWindows) {
      const output = execSync('netstat -ano', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const lines = output.split(/\r?\n/);
      const pidsToKill = new Set();
      for (const line of lines) {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 5 && parts[0] === 'TCP') {
          const localAddr = parts[1];
          const state = parts[3];
          const pid = parseInt(parts[4], 10);
          if (localAddr.endsWith(`:${port}`) && state === 'LISTENING' && pid && pid !== process.pid) {
            pidsToKill.add(pid);
          }
        }
      }
      for (const pid of pidsToKill) {
        try {
          execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
          console.log(`${colors.gray}[PRE-FLIGHT] Cleared port ${port} (${serviceName || 'service'}, terminated stale PID: ${pid})${colors.reset}`);
        } catch (_) {}
      }
    } else {
      const output = execSync(`lsof -ti:${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      const pids = output.trim().split(/\s+/).filter(Boolean);
      for (const pidStr of pids) {
        const pid = parseInt(pidStr, 10);
        if (pid && pid !== process.pid) {
          try {
            process.kill(pid, 'SIGKILL');
            console.log(`${colors.gray}[PRE-FLIGHT] Cleared port ${port} (${serviceName || 'service'}, terminated stale PID: ${pid})${colors.reset}`);
          } catch (_) {}
        }
      }
    }
  } catch (_) {}
}

function shutdownAll() {
  console.log(`\n${colors.yellow}${colors.bold}Stopping all DFarm services...${colors.reset}`);
  for (const proc of activeProcesses) {
    try {
      if (proc.pid) {
        killProcessTree(proc.pid);
      }
    } catch (_err) {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdownAll);
process.on('SIGTERM', shutdownAll);

function formatLogLine(prefix, color, line) {
  return `${color}${colors.bold}${prefix}${colors.reset} ${line}`;
}

function startService(serviceDef) {
  const { prefix, color, cmd, args, cwd, name } = serviceDef;

  const child = spawn(cmd, args, {
    cwd,
    shell: true,
    env: { ...process.env, FORCE_COLOR: '1' },
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  activeProcesses.push(child);

  child.stdout?.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.log(formatLogLine(prefix, color, line));
      }
    }
  });

  child.stderr?.on('data', (data) => {
    const lines = data.toString().split(/\r?\n/);
    for (const line of lines) {
      if (line.trim().length > 0) {
        console.error(formatLogLine(prefix, colors.red, line));
      }
    }
  });

  child.on('close', (code) => {
    if (code !== null && code !== 0) {
      console.log(
        `${color}${prefix}${colors.reset} Process exited with code ${colors.red}${code}${colors.reset}`
      );
    }
  });

  return child;
}

const targetMode = (process.argv[2] || 'all').toLowerCase();

console.log(`${colors.cyan}${colors.bold}
╔════════════════════════════════════════════════════════════╗
║         DFARM SMART DAIRY MANAGEMENT PLATFORM              ║
╚════════════════════════════════════════════════════════════╝${colors.reset}`);

console.log(`${colors.gray}Target Mode: ${colors.bold}${targetMode.toUpperCase()}${colors.reset}\n`);

let selectedServices = [];

switch (targetMode) {
  case 'web':
    selectedServices = [
      SERVICES.backend,
      SERVICES.dairyAdmin,
      SERVICES.superAdmin,
      SERVICES.collectionApp,
      SERVICES.hub,
    ];
    break;
  case 'android':
    selectedServices = [SERVICES.backend, SERVICES.customerAppAndroid];
    break;
  case 'customer':
  case 'mobile':
    selectedServices = [SERVICES.backend, SERVICES.customerAppWeb];
    break;
  case 'backend':
    selectedServices = [SERVICES.backend];
    break;
  case 'all':
  default:
    selectedServices = [
      SERVICES.backend,
      SERVICES.dairyAdmin,
      SERVICES.superAdmin,
      SERVICES.collectionApp,
      SERVICES.customerAppWeb,
      SERVICES.hub,
    ];
    break;
}

console.log(`${colors.bold}Active Endpoints:${colors.reset}`);
for (const s of selectedServices) {
  console.log(`  ${s.color}●${colors.reset} ${s.name.padEnd(26)} -> ${colors.cyan}${s.url}${colors.reset}`);
}
console.log(`\n${colors.dim}Press Ctrl+C to stop all services simultaneously.${colors.reset}\n`);

// Pre-flight check: ensure target ports are clear before spawning services
for (const s of selectedServices) {
  if (s.port) {
    freePort(s.port, s.name);
  }
}

// Start all selected services
for (const s of selectedServices) {
  startService(s);
}
