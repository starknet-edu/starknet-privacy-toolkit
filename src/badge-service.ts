// src/badge-service.ts
// Donation Badge Service - handles proof generation + Starknet interaction

import { Account, Contract, RpcProvider } from 'starknet';
import { getContractAddress } from './deployments';

export enum BadgeTier {
  NONE = 0,
  BRONZE = 1,
  SILVER = 2,
  GOLD = 3,
}

const BADGE_CONTRACT_ADDRESS: Record<'mainnet' | 'sepolia', string> = {
  mainnet: getContractAddress('mainnet', 'DonationBadge'),
  sepolia: getContractAddress('sepolia', 'DonationBadge'),
};

// Full ABI fetched from deployed contract on Sepolia
// Class hash: 0x04bedab69579e1f888f408aa5a96462228ba94b91c736367664c0cb41460c36c
const BADGE_ABI = [
  {
    type: 'impl',
    name: 'DonationBadgeImpl',
    interface_name: 'donation_badge_verifier::badge_contract::IDonationBadge',
  },
  {
    type: 'struct',
    name: 'core::array::Span::<core::felt252>',
    members: [{ name: 'snapshot', type: '@core::array::Array::<core::felt252>' }],
  },
  {
    type: 'struct',
    name: 'core::integer::u256',
    members: [
      { name: 'low', type: 'core::integer::u128' },
      { name: 'high', type: 'core::integer::u128' },
    ],
  },
  {
    type: 'enum',
    name: 'core::bool',
    variants: [
      { name: 'False', type: '()' },
      { name: 'True', type: '()' },
    ],
  },
  {
    type: 'interface',
    name: 'donation_badge_verifier::badge_contract::IDonationBadge',
    items: [
      {
        type: 'function',
        name: 'claim_badge',
        inputs: [
          { name: 'full_proof_with_hints', type: 'core::array::Span::<core::felt252>' },
          { name: 'threshold', type: 'core::integer::u256' },
          { name: 'donation_commitment', type: 'core::integer::u256' },
          { name: 'badge_tier', type: 'core::integer::u8' },
        ],
        outputs: [{ type: 'core::bool' }],
        state_mutability: 'external',
      },
      {
        type: 'function',
        name: 'has_badge',
        inputs: [
          { name: 'address', type: 'core::starknet::contract_address::ContractAddress' },
          { name: 'tier', type: 'core::integer::u8' },
        ],
        outputs: [{ type: 'core::bool' }],
        state_mutability: 'view',
      },
      {
        type: 'function',
        name: 'get_badge_tier',
        inputs: [{ name: 'address', type: 'core::starknet::contract_address::ContractAddress' }],
        outputs: [{ type: 'core::integer::u8' }],
        state_mutability: 'view',
      },
      {
        type: 'function',
        name: 'is_commitment_used',
        inputs: [{ name: 'commitment', type: 'core::integer::u256' }],
        outputs: [{ type: 'core::bool' }],
        state_mutability: 'view',
      },
      {
        type: 'function',
        name: 'get_badge_counts',
        inputs: [],
        outputs: [{ type: '(core::integer::u64, core::integer::u64, core::integer::u64)' }],
        state_mutability: 'view',
      },
    ],
  },
  {
    type: 'constructor',
    name: 'constructor',
    inputs: [{ name: 'verifier', type: 'core::starknet::contract_address::ContractAddress' }],
  },
  {
    type: 'event',
    name: 'donation_badge_verifier::badge_contract::DonationBadge::BadgeClaimed',
    kind: 'struct',
    members: [
      { name: 'recipient', type: 'core::starknet::contract_address::ContractAddress', kind: 'key' },
      { name: 'tier', type: 'core::integer::u8', kind: 'data' },
      { name: 'commitment_low', type: 'core::felt252', kind: 'data' },
    ],
  },
  {
    type: 'event',
    name: 'donation_badge_verifier::badge_contract::DonationBadge::Event',
    kind: 'enum',
    variants: [
      {
        name: 'BadgeClaimed',
        type: 'donation_badge_verifier::badge_contract::DonationBadge::BadgeClaimed',
        kind: 'nested',
      },
    ],
  },
] as const;

export interface DonationProofInput {
  donationAmountCents: number;
  donorSecret: string;
  targetTier: BadgeTier;
}

export interface BadgeProof {
  fullProofWithHints: string[];
  threshold: string;
  donationCommitment: string;
  badgeTier: number;
}

export interface ProofGenerationStatus {
  stage: 'idle' | 'generating_proof' | 'complete' | 'error';
  message: string;
  progress?: number;
}

export class BadgeService {
  private provider: RpcProvider;
  private contract: Contract | null = null;
  private network: 'mainnet' | 'sepolia';
  private proofBackendUrl: string;
  private initPromise: Promise<void> | null = null;

  constructor(
    provider: RpcProvider,
    network: 'mainnet' | 'sepolia' = 'sepolia',
    // Local proof backend (run `bun run api`)
    proofBackendUrl: string = 'http://localhost:3001/api/generate-proof',
  ) {
    this.provider = provider;
    // Force Sepolia for badges until mainnet deployment is ready
    this.network = 'sepolia';
    this.proofBackendUrl = proofBackendUrl;
    console.log('[BADGE] Proof backend URL:', this.proofBackendUrl);

    const contractAddress = BADGE_CONTRACT_ADDRESS[this.network];
    console.log('[BADGE] Initializing BadgeService...', { contractAddress, network: this.network });
    
    if (contractAddress && contractAddress !== '0x0') {
      // Start async initialization to fetch ABI from chain
      this.initPromise = this.initContract(contractAddress);
    }
  }

  private async initContract(contractAddress: string): Promise<void> {
    try {
      console.log('[BADGE] Fetching contract class from chain...');
      
      // Get the class (includes ABI) from the deployed contract
      const classHash = await this.provider.getClassHashAt(contractAddress);
      console.log('[BADGE] Contract class hash:', classHash);
      
      const contractClass = await this.provider.getClass(classHash);
      let abi = (contractClass as any).abi;
      
      // ABI from RPC can come as a JSON string - parse it if needed
      if (typeof abi === 'string') {
        console.log('[BADGE] ABI is a string, parsing JSON...');
        abi = JSON.parse(abi);
      }
      
      console.log('[BADGE] Got contract class, ABI entries:', abi?.length || 0);
      console.log('[BADGE] ABI type:', typeof abi, Array.isArray(abi) ? 'is array' : 'not array');
      console.log('[BADGE] First ABI entry type:', abi?.[0]?.type);
      
      // Create contract with the fetched ABI
      // starknet.js v8+ uses object-based constructor: new Contract({ abi, address, providerOrAccount })
      this.contract = new Contract({
        abi,
        address: contractAddress,
        providerOrAccount: this.provider,
      });
      console.log('[BADGE] Contract initialized successfully');
    } catch (error) {
      console.error('[BADGE] Failed to initialize contract from chain:', error);
      console.log('[BADGE] Trying fallback with hardcoded ABI...');
      
      try {
        // starknet.js v8+ uses object-based constructor
        this.contract = new Contract({
          abi: BADGE_ABI as any,
          address: contractAddress,
          providerOrAccount: this.provider,
        });
        console.log('[BADGE] Fallback initialization succeeded');
      } catch (fallbackError) {
        console.error('[BADGE] Fallback also failed:', fallbackError);
        this.contract = null;
      }
    }
  }

  async ensureInitialized(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  isContractDeployed(): boolean {
    const address = BADGE_CONTRACT_ADDRESS[this.network];
    return Boolean(address && address !== '0x0');
  }

  getTierThreshold(tier: BadgeTier): number {
    switch (tier) {
      case BadgeTier.BRONZE:
        return 1000;
      case BadgeTier.SILVER:
        return 10000;
      case BadgeTier.GOLD:
        return 100000;
      default:
        return 0;
    }
  }

  getTierName(tier: BadgeTier): string {
    switch (tier) {
      case BadgeTier.BRONZE:
        return '🥉 Bronze Donor ($10+)';
      case BadgeTier.SILVER:
        return '🥈 Silver Donor ($100+)';
      case BadgeTier.GOLD:
        return '🥇 Gold Donor ($1000+)';
      default:
        return 'No Badge';
    }
  }

  getEligibleTier(amountCents: number): BadgeTier {
    if (amountCents >= 100000) return BadgeTier.GOLD;
    if (amountCents >= 10000) return BadgeTier.SILVER;
    if (amountCents >= 1000) return BadgeTier.BRONZE;
    return BadgeTier.NONE;
  }

  /**
   * Convert a secret string to a numeric value for the ZK circuit.
   * Uses a simple deterministic hash that produces a safe integer.
   */
  private secretToNumber(secret: string): number {
    // Simple hash that produces a 32-bit integer from the secret
    let hash = 0;
    for (let i = 0; i < secret.length; i++) {
      const char = secret.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    // Ensure positive number in safe range
    return Math.abs(hash) % 1000000000;
  }

  async generateProof(
    input: DonationProofInput,
    onStatusUpdate?: (status: ProofGenerationStatus) => void,
  ): Promise<BadgeProof> {
    const threshold = this.getTierThreshold(input.targetTier);

    if (input.donationAmountCents < threshold) {
      throw new Error(
        `Donation amount $${(input.donationAmountCents / 100).toFixed(2)} is below ` +
          `threshold $${(threshold / 100).toFixed(2)} for ${this.getTierName(input.targetTier)}`,
      );
    }

    onStatusUpdate?.({
      stage: 'generating_proof',
      message: 'Generating ZK proof (up to 60 seconds)...',
      progress: 30,
    });

    // Convert secret to a numeric value for the ZK circuit
    const donorSecretNum = this.secretToNumber(input.donorSecret);
    console.log('[BADGE] Converted secret to number:', donorSecretNum);

    // Server expects: donationamount, donorsecret, threshold, badgetier (no underscores, lowercase)
    const payload = {
      donationamount: input.donationAmountCents,
      donorsecret: donorSecretNum,
      threshold: threshold,
      badgetier: input.targetTier,
    };

    console.log('[BADGE] Calling proof backend:', this.proofBackendUrl);
    console.log('[BADGE] Request payload:', payload);
    
    let response: Response;
    try {
      response = await fetch(this.proofBackendUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      console.error('[BADGE] Network error calling proof backend:', networkError);
      onStatusUpdate?.({ stage: 'error', message: 'Proof backend unreachable' });
      throw new Error(
        `Proof backend unreachable (${this.proofBackendUrl}). ` +
        `Run locally: bun run api (api/server.ts)`
      );
    }

    if (!response.ok) {
      const error = await response.text();
      onStatusUpdate?.({ stage: 'error', message: error });
      throw new Error(`Proof generation failed: ${error}`);
    }

    const result = await response.json();

    onStatusUpdate?.({
      stage: 'complete',
      message: 'Proof generated successfully!',
      progress: 100,
    });

    const donationCommitment =
      result.donation_commitment ?? result.commitment ?? result.commitment_hex;

    if (!donationCommitment) {
      throw new Error('Proof generation response missing commitment');
    }

    return {
      fullProofWithHints: result.calldata,
      threshold: threshold.toString(),
      donationCommitment: donationCommitment.toString(),
      badgeTier: input.targetTier,
    };
  }

  async claimBadge(account: Account, badgeProof: BadgeProof): Promise<string> {
    await this.ensureInitialized();
    
    if (!this.contract || !this.isContractDeployed()) {
      throw new Error(
        'Badge contract not deployed. Please deploy and update BADGE_CONTRACT_ADDRESS.',
      );
    }

    this.contract.connect(account);

    const thresholdBigInt = BigInt(badgeProof.threshold);
    const commitmentBigInt = BigInt(badgeProof.donationCommitment);

    const tx = await this.contract.invoke('claim_badge', [
      badgeProof.fullProofWithHints,
      {
        low: thresholdBigInt & ((1n << 128n) - 1n),
        high: thresholdBigInt >> 128n,
      },
      {
        low: commitmentBigInt & ((1n << 128n) - 1n),
        high: commitmentBigInt >> 128n,
      },
      badgeProof.badgeTier,
    ]);

    await this.provider.waitForTransaction(tx.transaction_hash);
    return tx.transaction_hash;
  }

  async getUserBadgeTier(address: string): Promise<BadgeTier> {
    await this.ensureInitialized();
    
    if (!this.contract || !this.isContractDeployed()) {
      return BadgeTier.NONE;
    }

    try {
      const tier = await this.contract.call('get_badge_tier', [address]);
      return Number(tier) as BadgeTier;
    } catch {
      return BadgeTier.NONE;
    }
  }

  async hasBadge(address: string, tier: BadgeTier): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.contract || !this.isContractDeployed()) {
      return false;
    }
    try {
      const result = await this.contract.call('has_badge', [address, tier]);
      return Boolean(result);
    } catch {
      return false;
    }
  }

  async isCommitmentUsed(commitment: string): Promise<boolean> {
    await this.ensureInitialized();
    
    if (!this.contract || !this.isContractDeployed()) {
      return false;
    }
    try {
      const commitmentBigInt = BigInt(commitment);
      const result = await this.contract.call('is_commitment_used', [
        {
          low: commitmentBigInt & ((1n << 128n) - 1n),
          high: commitmentBigInt >> 128n,
        },
      ]);
      return Boolean(result);
    } catch {
      return false;
    }
  }

  async getBadgeCounts(): Promise<{ bronze: number; silver: number; gold: number }> {
    await this.ensureInitialized();
    
    if (!this.contract || !this.isContractDeployed()) {
      return { bronze: 0, silver: 0, gold: 0 };
    }
    try {
      const result = (await this.contract.call('get_badge_counts', [])) as [
        bigint,
        bigint,
        bigint,
      ];
      return {
        bronze: Number(result[0]),
        silver: Number(result[1]),
        gold: Number(result[2]),
      };
    } catch {
      return { bronze: 0, silver: 0, gold: 0 };
    }
  }
}

