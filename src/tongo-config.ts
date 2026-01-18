export type Network = 'sepolia' | 'mainnet';

export interface TongoNetworkConfig {
  name: string;
  rpcUrl: string;
  tongoContractAddress: string;
  strkAddress: string; // Token address (STRK on Sepolia, USDC on mainnet)
  chainId: string;
  tokenSymbol: 'STRK' | 'USDC';
  tokenDecimals: 18 | 6;
}

/**
 * Official Tongo contract addresses from Fat Solutions
 * Source: https://github.com/fatlabsxyz/tongo
 * 
 * Available mainnet contracts:
 * - STRK:   0x3a542d7eb73b3e33a2c54e9827ec17a6365e289ec35ccc94dde97950d9db498 (rate: 50000000000000000)
 * - ETH:    0x276e11a5428f6de18a38b7abc1d60abc75ce20aa3a925e20a393fcec9104f89 (rate: 3000000000000)
 * - wBTC:   0x6d82c8c467eac77f880a1d5a090e0e0094a557bf67d74b98ba1881200750e27 (rate: 10)
 * - USDC.e: 0x72098b84989a45cc00697431dfba300f1f5d144ae916e98287418af4e548d96 (rate: 10000)
 * - USDC:   0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a (rate: 10000) <-- Native!
 * - USDT:   0x659c62ba8bc3ac92ace36ba190b350451d0c767aa973dd63b042b59cc065da0 (rate: 10000)
 * - DAI:    0x511741b1ad1777b4ad59fbff49d64b8eb188e2aeb4fc72438278a589d8a10d8 (rate: 10000000000000000)
 */
export const TONGO_NETWORKS: Record<Network, TongoNetworkConfig> = {
  sepolia: {
    name: 'Sepolia Testnet',
    // Use v0_7 RPC version for better compatibility with wallets
    rpcUrl: 'https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/cf52O0RwFy1mEB0uoYsel',
    // Official Tongo STRK contract on Sepolia (verified deployed)
    tongoContractAddress: '0x00b4cca30f0f641e01140c1c388f55641f1c3fe5515484e622b6cb91d8cee585',
    strkAddress: '0x04718f5a0fc34cc1af16a1cdee98ffb20c31f5cd61d6ab07201858f4287c938d',
    chainId: 'SN_SEPOLIA',
    tokenSymbol: 'STRK',
    tokenDecimals: 18,
  },
  mainnet: {
    name: 'Starknet Mainnet',
    rpcUrl: 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/cf52O0RwFy1mEB0uoYsel',
    // Official Tongo contract for Native USDC (Circle)
    // Provided by Fat Solutions: https://github.com/fatlabsxyz/tongo
    tongoContractAddress: '0x026f79017c3c382148832c6ae50c22502e66f7a2f81ccbdb9e1377af31859d3a',
    // Native USDC (Circle) - this is what most wallets show as "USDC"
    strkAddress: '0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb',
    chainId: 'SN_MAIN',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
};

export function getTongoNetworkConfig(network: Network = 'mainnet'): TongoNetworkConfig {
  return TONGO_NETWORKS[network];
}
