import dotenv from 'dotenv';
import { RpcProvider, Account } from 'starknet';
import { createTongoClient } from '../src/tongo-client';
import { getTongoNetworkConfig } from '../src/tongo-config';

dotenv.config();

async function main() {
  const network = (process.env.TONGO_NETWORK || 'sepolia') as 'sepolia' | 'mainnet';
  const config = getTongoNetworkConfig(network);

  if (!process.env.STARKNET_RPC_URL || !process.env.STARKNET_ACCOUNT_ADDRESS || !process.env.STARKNET_PRIVATE_KEY) {
    throw new Error('Missing STARKNET_RPC_URL / STARKNET_ACCOUNT_ADDRESS / STARKNET_PRIVATE_KEY in .env');
  }

  if (!process.env.TONGO_PRIVATE_KEY) {
    throw new Error('Missing TONGO_PRIVATE_KEY in .env');
  }

  const provider = new RpcProvider({ nodeUrl: process.env.STARKNET_RPC_URL });
  const wallet = new Account({
    provider,
    address: process.env.STARKNET_ACCOUNT_ADDRESS,
    signer: process.env.STARKNET_PRIVATE_KEY,
  });

  const client = createTongoClient({
    network,
    walletAccount: wallet,
    provider,
    tongoPrivateKey: process.env.TONGO_PRIVATE_KEY,
  });

  await client.refresh();
  const state = client.getState();

  console.log('Tongo public key:', client.getPublicKey());
  console.log('Current balance (tongo units):', state.currentBalance.toString());
  console.log('Pending balance (tongo units):', state.pendingBalance.toString());
  console.log('Rate:', await client.getRateDisplay());

  console.log(`Network: ${config.name} (${config.tokenSymbol})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
