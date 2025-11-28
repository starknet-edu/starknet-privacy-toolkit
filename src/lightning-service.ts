// src/lightning-service.ts

import { SwapperFactory, BitcoinNetwork } from '@atomiqlabs/sdk';
import { StarknetInitializer, StarknetInitializerType, StarknetSigner } from '@atomiqlabs/chain-starknet';
import { WalletAccount } from 'starknet';
import { NETWORKS } from './wallet-config';
import { getStrkToUsdcQuote, formatUsdcAmount } from './avnu-service';

// Types
export interface SwapDetails {
  lightningInvoice: string;
  qrCodeData: string;
  inputSats: string;
  outputAmount: string;
  outputToken: 'STRK' | 'USDC';
  outputDecimals: number;
  fee: string;
  expiryTimestamp: number;
  expiresIn: number;
  swap: any;
  // NEW: For mainnet STRK→USDC conversion
  needsSwapToUsdc: boolean;
  estimatedUsdcAmount?: string;
}

// Initialize Atomiq factory with Starknet support only
const Factory = new SwapperFactory<[StarknetInitializerType]>(
  [StarknetInitializer] as const
);

export const Tokens = Factory.Tokens;

let swapperInstance: Awaited<ReturnType<typeof Factory.newSwapper>> | null = null;
let currentSwapperNetwork: 'mainnet' | 'sepolia' | null = null;

// Status flags for Atomiq availability
let atomiqAvailable = false;
let atomiqError: string | null = null;

/**
 * Initialize the Atomiq swapper for Lightning ↔ Starknet swaps
 */
export async function initializeSwapper(network: 'mainnet' | 'sepolia' = 'mainnet') {
  // Reset error state
  atomiqError = null;
  
  // Reinitialize if network changed
  if (swapperInstance && currentSwapperNetwork === network && atomiqAvailable) {
    return swapperInstance;
  }

  // Close existing swapper if network changed
  if (swapperInstance && currentSwapperNetwork !== network) {
    console.log('[LIGHTNING] Network changed, reinitializing swapper...');
    swapperInstance = null;
    atomiqAvailable = false;
  }

  const config = NETWORKS[network];
  
  try {
    swapperInstance = Factory.newSwapper({
      chains: {
        STARKNET: {
          rpcUrl: config.rpcUrl
        }
      },
      bitcoinNetwork: network === 'mainnet' 
        ? BitcoinNetwork.MAINNET 
        : BitcoinNetwork.TESTNET
    });
    
    // Add timeout for init (15 seconds)
    const initPromise = swapperInstance.init();
    const timeoutPromise = new Promise<never>((_, reject) => 
      setTimeout(() => reject(new Error('Atomiq initialization timeout after 15 seconds')), 15000)
    );
    
    await Promise.race([initPromise, timeoutPromise]);
    
    currentSwapperNetwork = network;
    atomiqAvailable = true;
    
    console.log('[LIGHTNING] Atomiq swapper initialized for', network);
    
    return swapperInstance;
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.warn('[LIGHTNING] Failed to initialize Atomiq:', errorMsg);
    
    atomiqAvailable = false;
    atomiqError = errorMsg;
    swapperInstance = null;
    
    // Don't throw - return null so UI can handle gracefully
    return null;
  }
}

/**
 * Check if Atomiq Lightning service is available
 */
export function isAtomiqAvailable(): boolean {
  return atomiqAvailable;
}

/**
 * Get Atomiq error message if unavailable
 */
export function getAtomiqError(): string | null {
  return atomiqError;
}

/**
 * Create a Starknet signer from connected wallet
 */
export function createStarknetSigner(walletAccount: WalletAccount): StarknetSigner {
  return new StarknetSigner(walletAccount);
}

/**
 * Lightning → Starknet STRK swap
 * Note: SDK currently supports STRK. For mainnet USDC, additional AVNU swap step needed.
 */
export async function createLightningToStarknetSwap(
  amountSats: bigint,
  destinationAddress: string,
  network: 'mainnet' | 'sepolia' = 'mainnet'
): Promise<SwapDetails> {
  const swapper = await initializeSwapper(network);
  
  if (!swapper || !isAtomiqAvailable()) {
    throw new Error(`Atomiq Lightning service is unavailable: ${getAtomiqError() || 'Service offline'}`);
  }
  
  // Atomiq always outputs STRK
  const outputToken = Tokens.STARKNET.STRK;

  console.log('[LIGHTNING] Creating swap:', {
    from: 'BTC-LN',
    to: 'STRK',
    amountSats: amountSats.toString(),
    destination: destinationAddress,
    network
  });

  const swap = await swapper.swap(
    Tokens.BITCOIN.BTCLN,
    outputToken,
    amountSats,
    true,
    undefined,
    destinationAddress
  );

  const strkOutput = swap.getOutput().toString();
  const needsSwapToUsdc = network === 'mainnet'; // Mainnet Tongo = USDC only

  let estimatedUsdcAmount: string | undefined;

  // For mainnet, get estimated USDC output
  if (needsSwapToUsdc) {
    try {
      const { usdcAmount } = await getStrkToUsdcQuote(
        BigInt(strkOutput),
        destinationAddress
      );
      estimatedUsdcAmount = usdcAmount.toString();
      console.log('[LIGHTNING] Estimated USDC after swap:', formatUsdcAmount(usdcAmount));
    } catch (e) {
      console.warn('[LIGHTNING] Could not get USDC estimate:', e);
    }
  }

  const swapDetails: SwapDetails = {
    lightningInvoice: swap.getAddress(),
    qrCodeData: swap.getHyperlink(),
    inputSats: swap.getInput().toString(),
    outputAmount: strkOutput,
    outputToken: needsSwapToUsdc ? 'USDC' : 'STRK', // Final token after full flow
    outputDecimals: needsSwapToUsdc ? 6 : 18,
    fee: swap.getFee().amountInSrcToken.toString(),
    expiryTimestamp: swap.getQuoteExpiry(),
    expiresIn: Math.floor((swap.getQuoteExpiry() - Date.now()) / 1000),
    swap,
    needsSwapToUsdc,
    estimatedUsdcAmount,
  };

  console.log('[LIGHTNING] Swap created:', {
    invoice: swapDetails.lightningInvoice.substring(0, 50) + '...',
    inputSats: swapDetails.inputSats,
    strkOutput: strkOutput,
    finalToken: swapDetails.outputToken,
    estimatedUsdc: estimatedUsdcAmount ? formatUsdcAmount(BigInt(estimatedUsdcAmount)) : 'N/A',
    needsSwapToUsdc,
  });

  return swapDetails;
}

/**
 * Wait for Lightning payment and claim tokens on Starknet
 */
export async function waitForLightningPaymentAndClaim(
  swap: any,
  starknetSigner: StarknetSigner,
  onStatusUpdate?: (status: string, details?: any) => void
): Promise<{ success: boolean; error?: string }> {
  try {
    onStatusUpdate?.('waiting', { message: 'Waiting for Lightning payment...' });
    
    const paymentReceived = await swap.waitForPayment();
    
    if (!paymentReceived) {
      onStatusUpdate?.('expired', { message: 'Lightning invoice expired' });
      return { success: false, error: 'Lightning invoice expired without payment' };
    }

    onStatusUpdate?.('received', { message: 'Payment received! Claiming on Starknet...' });

    // Claim requires 2 transactions on Starknet
    await swap.commit(starknetSigner);
    onStatusUpdate?.('committed', { message: 'Commit transaction sent...' });
    
    await swap.claim(starknetSigner);
    onStatusUpdate?.('claimed', { message: 'Tokens claimed successfully!' });

    return { success: true };
    
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    onStatusUpdate?.('error', { message: errorMessage });
    return { success: false, error: errorMessage };
  }
}

/**
 * Get claimable swaps for recovery
 */
export async function getClaimableSwaps(network: 'mainnet' | 'sepolia' = 'mainnet') {
  const swapper = await initializeSwapper(network);
  if (!swapper || !isAtomiqAvailable()) {
    return null;
  }
  return swapper.getClaimableSwaps();
}

/**
 * Get swap limits for Lightning → STRK
 */
export async function getLightningSwapLimits(network: 'mainnet' | 'sepolia' = 'mainnet') {
  const swapper = await initializeSwapper(network);
  
  if (!swapper || !isAtomiqAvailable()) {
    // Return default limits if Atomiq is unavailable
    return {
      minInputSats: '1000',
      maxInputSats: '10000000',
      minOutputSTRK: undefined,
      maxOutputSTRK: undefined
    };
  }
  
  const limits = swapper.getSwapLimits(
    Tokens.BITCOIN.BTCLN,
    Tokens.STARKNET.STRK
  );

  return {
    minInputSats: limits.input.min?.toString() || '1000',
    maxInputSats: limits.input.max?.toString() || '10000000',
    minOutputSTRK: limits.output.min?.toString(),
    maxOutputSTRK: limits.output.max?.toString()
  };
}

// Utility functions

export function satsToUSD(sats: bigint, btcPriceUSD: number = 95000): string {
  const btc = Number(sats) / 100_000_000;
  return (btc * btcPriceUSD).toFixed(2);
}

export function usdToSats(usd: number, btcPriceUSD: number = 95000): bigint {
  const btc = usd / btcPriceUSD;
  return BigInt(Math.floor(btc * 100_000_000));
}

export async function fetchBTCPrice(): Promise<number> {
  try {
    const response = await fetch(
      'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd'
    );
    const data = await response.json();
    return data.bitcoin.usd || 95000;
  } catch {
    console.warn('[LIGHTNING] Could not fetch BTC price, using fallback');
    return 95000;
  }
}
