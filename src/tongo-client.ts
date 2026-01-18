import { Account, RpcProvider } from 'starknet';
import { TongoService } from './tongo-service';
import { getTongoNetworkConfig, type Network } from './tongo-config';

export type TongoClientError = {
  code: string;
  message: string;
  hint?: string;
};

export type TongoClient = {
  fund: (amountToken: bigint) => Promise<string>;
  transfer: (recipientPublicKey: string, amountToken: bigint) => Promise<string>;
  rollover: () => Promise<string>;
  withdraw: (amountToken: bigint) => Promise<string>;
  ragequit: () => Promise<string>;
  refresh: () => Promise<void>;
  getState: () => ReturnType<TongoService['getState']>;
  getPublicKey: () => string;
  getRateDisplay: () => Promise<string>;
  validateRecipientKey: (key: string) => { valid: boolean; error?: string };
};

export type CreateTongoClientOptions = {
  network: Network;
  walletAccount: Account;
  provider: RpcProvider;
  tongoPrivateKey: string;
};

export function normalizeTongoError(error: unknown): TongoClientError {
  const message = error instanceof Error ? error.message : String(error);

  if (message.includes('NotOwner') || message.includes('NowOwner')) {
    return {
      code: 'APPROVAL_FAILED',
      message: 'Token approval failed.',
      hint: 'Check wallet balance and network, then retry.',
    };
  }

  if (message.toLowerCase().includes('insufficient')) {
    return {
      code: 'INSUFFICIENT_BALANCE',
      message: 'Insufficient balance.',
      hint: 'Fund your account or lower the amount.',
    };
  }

  if (message.includes('Proof') || message.includes('proof')) {
    return {
      code: 'PROOF_ERROR',
      message: 'Zero-knowledge proof generation failed.',
      hint: 'Try regenerating your Tongo key and retry.',
    };
  }

  if (message.toLowerCase().includes('key')) {
    return {
      code: 'INVALID_KEY',
      message: 'Invalid Tongo private key.',
      hint: 'Generate a new key and retry.',
    };
  }

  return {
    code: 'UNKNOWN',
    message,
  };
}

function attachErrorDetails(err: unknown): never {
  const normalized = normalizeTongoError(err);
  const error = new Error(normalized.message);
  (error as any).code = normalized.code;
  if (normalized.hint) {
    (error as any).hint = normalized.hint;
  }
  throw error;
}

export function createTongoClient(options: CreateTongoClientOptions): TongoClient {
  const config = getTongoNetworkConfig(options.network);
  const service = new TongoService(
    options.walletAccount.address,
    options.walletAccount,
    options.provider,
    config.tongoContractAddress,
    config.strkAddress,
    options.tongoPrivateKey,
  );

  return {
    fund: async (amountToken) => {
      try {
        return await service.fundDonationAccount(amountToken);
      } catch (err) {
        attachErrorDetails(err);
      }
    },
    transfer: async (recipientPublicKey, amountToken) => {
      try {
        return await service.sendPrivateDonation(recipientPublicKey, amountToken);
      } catch (err) {
        attachErrorDetails(err);
      }
    },
    rollover: async () => {
      try {
        return await service.rolloverBalance();
      } catch (err) {
        attachErrorDetails(err);
      }
    },
    withdraw: async (amountToken) => {
      try {
        return await service.withdrawDonations(amountToken);
      } catch (err) {
        attachErrorDetails(err);
      }
    },
    ragequit: async () => {
      try {
        return await service.ragequitAll();
      } catch (err) {
        attachErrorDetails(err);
      }
    },
    refresh: async () => {
      try {
        await service.refreshState();
      } catch (err) {
        attachErrorDetails(err);
      }
    },
    getState: () => service.getState(),
    getPublicKey: () => service.getPublicKey(),
    getRateDisplay: () => service.getRateDisplay(),
    validateRecipientKey: (key) => service.validatePublicKeyFormat(key),
  };
}
