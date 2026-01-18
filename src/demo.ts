import { TongoService } from './tongo-service';
import { starknetAccount, provider, TONGO_CONTRACT_ADDRESS, STRK_ADDRESS } from './config';

async function runDemoDonationFlow() {
  console.log('='.repeat(60));
  console.log('🎭 TONGO PRIVATE DONATION DEMO');
  console.log('='.repeat(60));
  
  if (!starknetAccount || !provider) {
    throw new Error(
      'Missing Starknet account or provider. Check STARKNET_ACCOUNT_ADDRESS and STARKNET_PRIVATE_KEY in .env.'
    );
  }

  const service = new TongoService(
    starknetAccount.address,
    starknetAccount,
    provider,
    TONGO_CONTRACT_ADDRESS,
    STRK_ADDRESS
  );
  
  // Refresh state from blockchain
  await service.refreshState();
  
  console.log(`\n📍 Your Tongo Public Key: ${service.getPublicKey()}`);
  console.log(`📍 Your Starknet Address: ${starknetAccount.address}`);
  
  const state = service.getState();
  console.log(`\n💰 Current Balance: ${state.currentBalance / BigInt(1e18)} STRK`);
  console.log(`📥 Pending Balance: ${state.pendingBalance / BigInt(1e18)} STRK`);
  console.log(`🔢 Nonce: ${state.nonce}\n`);

  try {
    // Step 1: Fund the account
    console.log('='.repeat(60));
    console.log('Step 1️⃣: FUNDING ACCOUNT WITH 100 STRK');
    console.log('='.repeat(60));
    
    const fundTx = await service.fundDonationAccount(
      BigInt('100000000000000000000') // 100 STRK (18 decimals)
    );
    console.log(`✅ Funded! TX: ${fundTx}\n`);

    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Refresh state
    await service.refreshState();

    // Step 2: Send private donation
    console.log('='.repeat(60));
    console.log('Step 2️⃣: SENDING PRIVATE DONATION (50 STRK, amount hidden)');
    console.log('='.repeat(60));
    
    // For demo, recipient public key is another Tongo account
    // In real scenario, recipient would provide their public key (base58 format)
    // Example: You would get this from the recipient's Tongo account
    const recipientPublicKey = 'example_recipient_tongo_address_base58'; // Replace with actual recipient
    
    console.log(`⚠️  Note: Using placeholder recipient key. Replace with actual recipient's TongoAddress.`);
    console.log(`⚠️  Skipping transfer step. Uncomment below to test with real recipient.\n`);
    
    // Uncomment when you have a real recipient:
    /*
    const transferTx = await service.sendPrivateDonation(
      recipientPublicKey,
      BigInt('50000000000000000000') // 50 STRK
    );
    console.log(`✅ Donated! TX: ${transferTx}\n`);
    
    // Wait for confirmation
    await new Promise(resolve => setTimeout(resolve, 5000));
    await service.refreshState();
    */

    // Step 3: View state
    console.log('='.repeat(60));
    console.log('Step 3️⃣: CURRENT STATE');
    console.log('='.repeat(60));
    const updatedState = service.getState();
    console.log(`Current Balance: ${updatedState.currentBalance / BigInt(1e18)} STRK`);
    console.log(`Pending Balance: ${updatedState.pendingBalance / BigInt(1e18)} STRK`);
    console.log(`Nonce: ${updatedState.nonce}\n`);

    // Step 4: Withdraw remaining balance (optional)
    console.log('='.repeat(60));
    console.log('Step 4️⃣: WITHDRAWING 25 STRK BACK TO WALLET');
    console.log('='.repeat(60));
    
    const currentBalance = updatedState.currentBalance;
    const withdrawAmount = BigInt('25000000000000000000'); // 25 STRK
    
    if (currentBalance >= withdrawAmount) {
      const withdrawTx = await service.withdrawDonations(withdrawAmount);
      console.log(`✅ Withdrawn! TX: ${withdrawTx}\n`);
      
      // Wait for confirmation
      await new Promise(resolve => setTimeout(resolve, 5000));
      await service.refreshState();
      
      const finalState = service.getState();
      console.log(`Final Balance: ${finalState.currentBalance / BigInt(1e18)} STRK`);
    } else {
      console.log(`⚠️  Insufficient balance to withdraw. Current: ${currentBalance / BigInt(1e18)} STRK\n`);
    }

    console.log('='.repeat(60));
    console.log('✨ DEMO COMPLETED SUCCESSFULLY ✨');
    console.log('='.repeat(60));
  } catch (error) {
    console.error('❌ Error during demo:', error);
    throw error;
  }
}

// Run demo
runDemoDonationFlow()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

