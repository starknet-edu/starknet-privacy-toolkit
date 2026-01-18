import { RpcProvider, Account } from 'starknet';
import { createTongoClient } from '../src/tongo-client';

// Drop-in snippet:
// 1) Create provider + wallet
// 2) Create Tongo client
// 3) Fund / transfer / withdraw

const provider = new RpcProvider({ nodeUrl: 'https://sepolia.starknet.io/rpc/v0_8_1' });
const wallet = new Account({
  provider,
  address: '0xYOUR_WALLET',
  signer: '0xYOUR_STARKNET_PRIVATE_KEY',
});

const client = createTongoClient({
  network: 'sepolia',
  walletAccount: wallet,
  provider,
  tongoPrivateKey: '0xYOUR_TONGO_PRIVATE_KEY',
});

await client.refresh();
const txHash = await client.fund(1_000_000_000_000_000_000n); // 1 STRK in base units
console.log('Fund tx:', txHash);
