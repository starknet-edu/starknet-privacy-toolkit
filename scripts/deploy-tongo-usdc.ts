/**
 * Deploy Tongo Contract for Native USDC on Starknet Mainnet
 * 
 * This script deploys a new instance of the Tongo contract configured for
 * Circle's native USDC token instead of USDC.e (bridged).
 * 
 * Usage:
 *   DEPLOYER_PRIVATE_KEY=0x... DEPLOYER_ADDRESS=0x... bun run scripts/deploy-tongo-usdc.ts
 */

import { Account, RpcProvider, CallData, hash } from 'starknet';

// Configuration
const CONFIG = {
  // Existing Tongo class hash (already declared on mainnet)
  classHash: '0x00936cd93063f89a17072791b15f3fecc28079e9cd629a8e5ddbaa1a9569b5a5',
  
  // Native USDC (Circle) on Starknet mainnet
  nativeUsdc: '0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb',
  
  // Rate: 1:1 (1 Tongo unit = 1 USDC base unit = 0.000001 USDC)
  rate: { low: 1n, high: 0n },
  
  // Bit size: 32 (max balance ~4.29B units)
  bitSize: 32,
  
  // Auditor key: None (no auditor)
  // Set to { x: '0x...', y: '0x...' } if you want an auditor
  auditorKey: null as { x: string; y: string } | null,
  
  // RPC endpoint
  rpcUrl: 'https://starknet-mainnet.public.blastapi.io',
};

async function main() {
  console.log('='.repeat(60));
  console.log('TONGO NATIVE USDC DEPLOYMENT');
  console.log('='.repeat(60));
  
  // Get deployer credentials from environment
  const deployerPrivateKey = process.env.DEPLOYER_PRIVATE_KEY;
  const deployerAddress = process.env.DEPLOYER_ADDRESS;
  
  if (!deployerPrivateKey || !deployerAddress) {
    console.error('\nERROR: Missing environment variables\n');
    console.log('Required:');
    console.log('  DEPLOYER_PRIVATE_KEY=0x... (your wallet private key)');
    console.log('  DEPLOYER_ADDRESS=0x... (your wallet address)');
    console.log('\nExample:');
    console.log('  DEPLOYER_PRIVATE_KEY=0x123... DEPLOYER_ADDRESS=0x456... bun run scripts/deploy-tongo-usdc.ts');
    process.exit(1);
  }
  
  // Connect to Starknet
  const provider = new RpcProvider({ nodeUrl: CONFIG.rpcUrl });
  const account = new Account(provider, deployerAddress, deployerPrivateKey);
  
  console.log('\nDeployment Parameters:');
  console.log(`  Class Hash:  ${CONFIG.classHash}`);
  console.log(`  Owner:       ${deployerAddress}`);
  console.log(`  ERC20:       ${CONFIG.nativeUsdc} (Native USDC)`);
  console.log(`  Rate:        1:1`);
  console.log(`  Bit Size:    ${CONFIG.bitSize}`);
  console.log(`  Auditor:     ${CONFIG.auditorKey ? 'Set' : 'None'}`);
  console.log(`\nNetwork: Starknet Mainnet`);
  
  // Verify account has STRK for gas
  const balance = await provider.getBalance(deployerAddress);
  console.log(`\nDeployer STRK balance: ${(Number(balance) / 1e18).toFixed(4)} STRK`);
  
  if (BigInt(balance) < BigInt(1e16)) { // 0.01 STRK minimum
    console.error('\nERROR: Insufficient STRK for gas. Send some STRK to your deployer address.');
    process.exit(1);
  }
  
  // Build constructor calldata
  // Constructor: owner, ERC20, rate (u256), bit_size (u32), auditor_key (Option<PubKey>)
  const constructorCalldata = CallData.compile({
    owner: deployerAddress,
    ERC20: CONFIG.nativeUsdc,
    rate: CONFIG.rate,
    bit_size: CONFIG.bitSize,
    auditor_key: CONFIG.auditorKey 
      ? { Some: { x: CONFIG.auditorKey.x, y: CONFIG.auditorKey.y } }
      : { None: {} },
  });
  
  console.log('\nConstructor calldata:', constructorCalldata);
  
  // Confirm deployment
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const answer = await new Promise<string>((resolve) => {
    rl.question('\nDeploy contract? (y/n) ', resolve);
  });
  rl.close();
  
  if (answer.toLowerCase() !== 'y') {
    console.log('Deployment cancelled.');
    process.exit(0);
  }
  
  console.log('\nDeploying contract...');
  
  try {
    // Calculate contract address (deterministic)
    const contractAddress = hash.calculateContractAddressFromHash(
      0, // salt (0 for default)
      CONFIG.classHash,
      constructorCalldata,
      deployerAddress
    );
    console.log(`\nPredicted contract address: ${contractAddress}`);
    
    // Deploy
    const deployResponse = await account.deployContract({
      classHash: CONFIG.classHash,
      constructorCalldata,
    });
    
    console.log(`\nDeployment transaction: ${deployResponse.transaction_hash}`);
    console.log('Waiting for confirmation...');
    
    await provider.waitForTransaction(deployResponse.transaction_hash);
    
    console.log('\n' + '='.repeat(60));
    console.log('DEPLOYMENT SUCCESSFUL!');
    console.log('='.repeat(60));
    console.log(`\nContract Address: ${deployResponse.contract_address}`);
    console.log(`Transaction Hash: ${deployResponse.transaction_hash}`);
    console.log(`\nView on Starkscan: https://starkscan.co/contract/${deployResponse.contract_address}`);
    
    console.log('\n--- UPDATE YOUR CONFIG ---');
    console.log('\nAdd to src/tongo-config.ts:');
    console.log(`
  'mainnet-native-usdc': {
    name: 'Starknet Mainnet (Native USDC)',
    rpcUrl: 'https://starknet-mainnet.g.alchemy.com/starknet/version/rpc/v0_10/YOUR_KEY',
    tongoContractAddress: '${deployResponse.contract_address}',
    strkAddress: '${CONFIG.nativeUsdc}', // Native USDC
    chainId: 'SN_MAIN',
    tokenSymbol: 'USDC',
    tokenDecimals: 6,
  },
`);
    
  } catch (error) {
    console.error('\nDeployment failed:', error);
    process.exit(1);
  }
}

main().catch(console.error);
