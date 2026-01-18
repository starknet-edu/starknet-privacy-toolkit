import dotenv from 'dotenv';
import { RpcProvider } from 'starknet';
import { Account as TongoAccount } from '@fatsolutions/tongo-sdk';
import { pubKeyBase58ToAffine } from '@fatsolutions/tongo-sdk/dist/types.js';

dotenv.config();

const REQUIRED_ENV = [
  'STARKNET_RPC_URL',
  'STARKNET_ACCOUNT_ADDRESS',
  'TONGO_CONTRACT_ADDRESS',
  'STRK_ADDRESS',
  'TONGO_PRIVATE_KEY',
];

function getEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function parseAmountToUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error('Amount is empty');
  }
  const [wholePart, fractionPart = ''] = trimmed.split('.');
  if (!/^\d+$/.test(wholePart || '0')) {
    throw new Error(`Invalid amount: ${value}`);
  }
  if (!/^\d*$/.test(fractionPart)) {
    throw new Error(`Invalid amount: ${value}`);
  }
  if (fractionPart.length > decimals) {
    throw new Error(`Amount has too many decimals (max ${decimals})`);
  }
  const whole = BigInt(wholePart || '0');
  const fraction = BigInt((fractionPart + '0'.repeat(decimals)).slice(0, decimals) || '0');
  const multiplier = 10n ** BigInt(decimals);
  return whole * multiplier + fraction;
}

function parseRecipientKey(pubKey: string): { x: bigint; y: bigint } {
  const trimmed = pubKey.trim();
  if (trimmed.startsWith('0x')) {
    const hex = trimmed.slice(2);
    if (!/^[0-9a-fA-F]+$/.test(hex)) {
      throw new Error('Invalid hex characters in public key');
    }
    if (hex.length !== 128) {
      throw new Error('Hex public key must be 128 chars (x+y)');
    }
    return {
      x: BigInt('0x' + hex.slice(0, 64)),
      y: BigInt('0x' + hex.slice(64)),
    };
  }
  return pubKeyBase58ToAffine(trimmed);
}

async function runPreflight() {
  for (const envVar of REQUIRED_ENV) {
    if (!process.env[envVar]) {
      throw new Error(`Missing required env var: ${envVar}`);
    }
  }

  const rpcUrl = getEnv('STARKNET_RPC_URL');
  const accountAddress = getEnv('STARKNET_ACCOUNT_ADDRESS');
  const tongoContractAddress = getEnv('TONGO_CONTRACT_ADDRESS');
  const tokenAddress = getEnv('STRK_ADDRESS');
  const tongoPrivateKey = getEnv('TONGO_PRIVATE_KEY');

  const provider = new RpcProvider({ nodeUrl: rpcUrl });

  const isMainnet =
    tokenAddress.toLowerCase() ===
    '0x053c91253bc9682c04929ca02ed00b3e423f6710d2ee7e0d5ebb06f3ecf368a8';
  const tokenSymbol = isMainnet ? 'USDC' : 'STRK';
  const tokenDecimals = isMainnet ? 6 : 18;

  const amountInput = process.env.TEST_TOKEN_AMOUNT || (isMainnet ? '1' : '1');
  const tokenAmount = parseAmountToUnits(amountInput, tokenDecimals);

  console.log('='.repeat(70));
  console.log('TONGO TX PREFLIGHT (NO ON-CHAIN TX)');
  console.log('='.repeat(70));
  console.log('RPC:', rpcUrl);
  console.log('Account:', accountAddress);
  console.log('Tongo:', tongoContractAddress);
  console.log(`${tokenSymbol} token:`, tokenAddress);
  console.log(`Test amount: ${amountInput} ${tokenSymbol} (${tokenAmount} base units)`);
  console.log('='.repeat(70));

  // Basic RPC + contract checks
  const chainId = await provider.getChainId();
  console.log('[OK] Chain ID:', chainId);

  try {
    await provider.getClassAt(tongoContractAddress);
    console.log('[OK] Tongo contract class found');
  } catch (error) {
    throw new Error(`Failed to fetch Tongo contract class: ${error instanceof Error ? error.message : String(error)}`);
  }

  try {
    await provider.getClassAt(tokenAddress);
    console.log(`[OK] ${tokenSymbol} token contract class found`);
  } catch (error) {
    throw new Error(`Failed to fetch token contract class: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Build Tongo account + state
  // Tongo SDK ships its own starknet.js dependency; cast to avoid type mismatch.
  const tongoAccount = new TongoAccount(
    tongoPrivateKey,
    tongoContractAddress,
    provider as any,
  );
  const state = await tongoAccount.state();
  const rate = await tongoAccount.rate();
  const bitSize = await tongoAccount.bit_size();

  console.log('[OK] Tongo account initialized');
  console.log('Balance (tongo):', state.balance.toString());
  console.log('Pending (tongo):', state.pending.toString());
  console.log('Nonce:', state.nonce.toString());
  console.log('Rate:', rate.toString());
  console.log('Bit size:', bitSize.toString());

  const tongoAmount = await tongoAccount.erc20ToTongo(tokenAmount);
  console.log('Converted amount (tongo units):', tongoAmount.toString());

  // Fund operation (build only)
  console.log('\n[CHECK] Fund operation...');
  const fundOperation = await tongoAccount.fund({
    amount: tongoAmount,
    sender: accountAddress,
  });
  const fundCalldata = fundOperation.toCalldata();
  console.log('[OK] Fund calldata built', {
    hasApprove: !!fundOperation.approve,
    calldataType: Array.isArray(fundCalldata) ? 'array' : 'call',
  });

  // Transfer operation (build only, requires recipient + balance)
  console.log('\n[CHECK] Transfer operation...');
  const recipient = process.env.TEST_RECIPIENT_PUBLIC_KEY;
  if (!recipient) {
    console.log('[SKIP] No TEST_RECIPIENT_PUBLIC_KEY set');
  } else if (state.balance < tongoAmount) {
    console.log('[SKIP] Insufficient balance for transfer preflight');
  } else {
    const recipientPubKey = parseRecipientKey(recipient);
    const transferOperation = await tongoAccount.transfer({
      to: recipientPubKey,
      amount: tongoAmount,
      sender: accountAddress,
    });
    const transferCalldata = transferOperation.toCalldata();
    console.log('[OK] Transfer calldata built', {
      calldataType: Array.isArray(transferCalldata) ? 'array' : 'call',
    });
  }

  // Rollover operation (build only, requires pending > 0)
  console.log('\n[CHECK] Rollover operation...');
  if (state.pending === 0n) {
    console.log('[SKIP] No pending balance to rollover');
  } else {
    const rolloverOperation = await tongoAccount.rollover({
      sender: accountAddress,
    });
    const rolloverCalldata = rolloverOperation.toCalldata();
    console.log('[OK] Rollover calldata built', {
      calldataType: Array.isArray(rolloverCalldata) ? 'array' : 'call',
    });
  }

  // Withdraw operation (build only, requires balance)
  console.log('\n[CHECK] Withdraw operation...');
  if (state.balance < tongoAmount) {
    console.log('[SKIP] Insufficient balance for withdraw preflight');
  } else {
    const withdrawOperation = await tongoAccount.withdraw({
      to: accountAddress,
      amount: tongoAmount,
      sender: accountAddress,
    });
    const withdrawCalldata = withdrawOperation.toCalldata();
    console.log('[OK] Withdraw calldata built', {
      calldataType: Array.isArray(withdrawCalldata) ? 'array' : 'call',
    });
  }

  // Ragequit operation (build only, requires balance and opt-in)
  console.log('\n[CHECK] Ragequit operation...');
  const enableRagequit = process.env.TEST_ENABLE_RAGEQUIT === 'true';
  if (!enableRagequit) {
    console.log('[SKIP] Set TEST_ENABLE_RAGEQUIT=true to build ragequit operation');
  } else if (state.balance === 0n) {
    console.log('[SKIP] No balance for ragequit preflight');
  } else {
    const ragequitOperation = await tongoAccount.ragequit({
      to: accountAddress,
      sender: accountAddress,
    });
    const ragequitCalldata = ragequitOperation.toCalldata();
    console.log('[OK] Ragequit calldata built', {
      calldataType: Array.isArray(ragequitCalldata) ? 'array' : 'call',
    });
  }

  console.log('\n✅ Preflight completed (no transactions sent).');
}

runPreflight().catch((error) => {
  console.error('\n❌ Preflight failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
