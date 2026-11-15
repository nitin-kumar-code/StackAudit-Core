import { spawn } from 'node:child_process';
import { isIP } from 'node:net';
import { validateDeploymentMode } from '../lib/deployment';

export function validateServerAddress(host: string, port: string): { host: string; port: string } {
  const normalizedHost = host.trim();
  const normalizedPort = port.trim();
  const validHostname = /^(?=.{1,253}$)(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)(?:\.(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?))*\.?$/;

  if (!normalizedHost || (isIP(normalizedHost) === 0 && !validHostname.test(normalizedHost))) {
    throw new Error('STACKAUDIT_HOST must be an IP address or a valid hostname.');
  }

  if (!/^\d{1,5}$/.test(normalizedPort)) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  const numericPort = Number(normalizedPort);
  if (numericPort < 1 || numericPort > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return { host: normalizedHost, port: String(numericPort) };
}

function main() {
  const command = process.argv[2] || 'dev';
  if (command !== 'dev' && command !== 'start') {
    console.error(`Invalid command '${command}'. Usage: tsx scripts/run-server.ts [dev|start]`);
    process.exit(1);
  }

  // Enforce private network deployment mode validation
  let mode: string;
  try {
    mode = validateDeploymentMode();
  } catch (error) {
    console.error('\n❌ [StackAudit Configuration Error]');
    console.error(error instanceof Error ? error.message : String(error));
    console.error('\nTo run StackAudit locally on loopback (127.0.0.1), use:');
    console.error('  npm run dev');
    console.error('  npm start\n');
    process.exit(1);
  }

  if (mode !== 'private-network') {
    console.error('\n❌ [StackAudit Security Violation]');
    console.error('The private-network runner is only permitted when STACKAUDIT_DEPLOYMENT_MODE=private-network');
    console.error('and STACKAUDIT_ALLOW_PRIVATE_NETWORK=true are explicitly configured.');
    console.error('\nFor local loopback execution, use:');
    console.error('  npm run dev   (or npm start)\n');
    process.exit(1);
  }

  let host: string;
  let port: string;
  try {
    ({ host, port } = validateServerAddress(
      process.env.STACKAUDIT_HOST || process.env.HOST || '0.0.0.0',
      process.env.PORT || '3000'
    ));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  console.log('\n================================================================');
  console.log('🔒 StackAudit V0 — Private-Network Deployment Mode');
  console.log('================================================================');
  console.log(`Binding listener to: ${host}:${port}`);
  console.log('⚠️  CRITICAL SECURITY NOTICE:');
  console.log('  1. StackAudit V0 is an unauthenticated single-operator ledger.');
  console.log('  2. ALL users within this network boundary have full operator access.');
  console.log('  3. Ensure this host is strictly isolated via firewall, VPN, or private VLAN.');
  console.log('  4. NEVER expose this port directly to the public internet.');
  console.log('================================================================\n');

  const args = command === 'dev'
    ? ['dev', '-H', host, '-p', port, '--webpack']
    : ['start', '-H', host, '-p', port];

  const child = spawn('next', args, {
    stdio: 'inherit',
    shell: false,
    env: process.env,
  });

  child.on('exit', (code, signal) => {
    if (code !== null) process.exit(code);
    if (signal) process.kill(process.pid, signal);
  });

  process.on('SIGINT', () => child.kill('SIGINT'));
  process.on('SIGTERM', () => child.kill('SIGTERM'));
}

if (!process.env.VITEST) {
  main();
}
