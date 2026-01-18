import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TONGO_NETWORKS } from '../src/tongo-config';
import { getContractAddress } from '../src/deployments';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');

function isHexAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

function requireHttpUrl(value: string, label: string) {
  assert.ok(value.startsWith('http'), `${label} must start with http/https`);
}

function checkNetworkConfig(name: string) {
  const config = TONGO_NETWORKS[name as keyof typeof TONGO_NETWORKS];
  assert.ok(config, `Missing config for ${name}`);

  requireHttpUrl(config.rpcUrl, `${name}.rpcUrl`);
  assert.ok(isHexAddress(config.tongoContractAddress), `${name}.tongoContractAddress invalid`);
  assert.ok(isHexAddress(config.strkAddress), `${name}.strkAddress invalid`);
  assert.ok(config.chainId.length > 0, `${name}.chainId missing`);
  assert.ok(['STRK', 'USDC'].includes(config.tokenSymbol), `${name}.tokenSymbol invalid`);
  assert.ok([6, 18].includes(config.tokenDecimals), `${name}.tokenDecimals invalid`);
}

async function checkDeployments() {
  const deploymentsPath = path.join(repoRoot, 'deployments', 'sepolia.json');
  const raw = await readFile(deploymentsPath, 'utf-8');
  const parsed = JSON.parse(raw);

  assert.equal(parsed.network, 'sepolia', 'deployments/sepolia.json network mismatch');
  assert.ok(parsed.contracts?.DonationBadge?.address, 'DonationBadge address missing');
  assert.ok(parsed.contracts?.UltraKeccakHonkVerifier?.address, 'Verifier address missing');

  const badgeAddress = getContractAddress('sepolia', 'DonationBadge');
  assert.ok(isHexAddress(badgeAddress), 'getContractAddress returned invalid badge address');
  assert.notEqual(badgeAddress, '0x0', 'Badge address fallback used');
}

async function checkRequiredFiles() {
  const files = [
    path.join(repoRoot, 'api', 'server.ts'),
    path.join(repoRoot, 'donation_badge_verifier', 'api', 'generate-proof.ts'),
  ];

  await Promise.all(files.map((file) => access(file)));
}

async function run() {
  checkNetworkConfig('sepolia');
  checkNetworkConfig('mainnet');
  await checkDeployments();
  await checkRequiredFiles();

  console.log('✅ Health check passed');
}

run().catch((error) => {
  console.error('❌ Health check failed');
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
