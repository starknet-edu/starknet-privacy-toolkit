export interface TongoDonationState {
  tongoPublicKey: string;
  starknetAddress: string;
  currentBalance: bigint;
  pendingBalance: bigint;
  nonce: number;
}

export interface DonationRecord {
  id: string;
  recipient: string;
  amount: bigint; // hidden in Tongo, shown in logs
  timestamp: number;
  transactionHash: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface TongoOperation {
  type: 'fund' | 'transfer' | 'rollover' | 'withdraw' | 'ragequit';
  amount: bigint;
  recipient?: string;
  proof?: any;
  timestamp: number;
}

