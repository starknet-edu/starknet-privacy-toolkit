import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile } from 'fs/promises';
import path from 'path';

const execAsync = promisify(exec);
const ROOT_DIR = path.join(process.cwd(), 'zk-badges', 'donation_badge');

export interface ProofRequest {
  donation_amount: number;
  donor_secret: string;
  threshold: number;
  badge_tier: number;
  donation_commitment: string;
}

export interface ProofResponse {
  success: boolean;
  calldata?: string[];
  error?: string;
}

export async function generateProof(request: ProofRequest): Promise<ProofResponse> {
  try {
    const proverToml = `
donation_amount = "${request.donation_amount}"
donor_secret = "${request.donor_secret}"
threshold = "${request.threshold}"
badge_tier = "${request.badge_tier}"
donation_commitment = "${request.donation_commitment}"
`;

    await writeFile(path.join(ROOT_DIR, 'Prover.toml'), proverToml);

    await execAsync('nargo execute witness', { cwd: ROOT_DIR });

    await execAsync(
      'bb prove -s ultra_honk --oracle_hash keccak ' +
        '-b ./target/donation_badge.json ' +
        '-w ./target/witness.gz ' +
        '-o ./target/proof.bin',
      { cwd: ROOT_DIR, timeout: 120000 }
    );

    await execAsync(
      'bb verify -s ultra_honk --oracle_hash keccak ' +
        '-k ./target/vk.bin ' +
        '-p ./target/proof.bin',
      { cwd: ROOT_DIR }
    );

    const calldataCommand =
      'garaga calldata ' +
      '--system ultra_keccak_honk ' +
      `--vk ${path.join(ROOT_DIR, 'target', 'vk.bin')} ` +
      `--proof ${path.join(ROOT_DIR, 'target', 'proof.bin')} ` +
      '--format starkli';
    const { stdout: calldataStdout } = await execAsync(calldataCommand, {
      cwd: path.join(ROOT_DIR, '..'),
    });

    const calldata = calldataStdout
      .trim()
      .split(/\s+/)
      .filter((value) => value.length > 0);

    return { success: true, calldata };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message };
  }
}

export async function handleProofRequest(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }

  try {
    const body = (await req.json()) as ProofRequest;
    const result = await generateProof(body);
    const payload = JSON.stringify(result);
    return new Response(payload, {
      status: result.success ? 200 : 500,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

