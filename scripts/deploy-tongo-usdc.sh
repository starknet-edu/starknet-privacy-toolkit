#!/bin/bash
# =============================================================================
# Deploy Tongo Contract for Native USDC on Starknet Mainnet
# =============================================================================
#
# This script deploys a new instance of the Tongo contract configured for
# Circle's native USDC token instead of USDC.e (bridged).
#
# PREREQUISITES:
# 1. Install starkli: curl https://get.starkli.sh | sh && starkliup
# 2. Set up a Starknet account with STRK for gas
# 3. Export environment variables (see below)
#
# =============================================================================

set -e

echo "============================================================"
echo "TONGO NATIVE USDC DEPLOYMENT"
echo "============================================================"

# Configuration
CLASS_HASH="0x00936cd93063f89a17072791b15f3fecc28079e9cd629a8e5ddbaa1a9569b5a5"
NATIVE_USDC="0x033068F6539f8e6e6b131e6B2B814e6c34A5224bC66947c47DaB9dFeE93b35fb"
RATE_LOW="1"      # u256 low part
RATE_HIGH="0"     # u256 high part  
BIT_SIZE="32"     # u32
AUDITOR_OPTION="0"  # 0 = None (no auditor)

# Check for required environment variables
if [ -z "$STARKNET_ACCOUNT" ]; then
    echo "ERROR: STARKNET_ACCOUNT not set"
    echo ""
    echo "Set up your account:"
    echo "  export STARKNET_ACCOUNT=~/.starkli-wallets/account.json"
    echo "  export STARKNET_KEYSTORE=~/.starkli-wallets/keystore.json"
    echo ""
    echo "Or create a new account:"
    echo "  starkli account fetch <YOUR_WALLET_ADDRESS> --output ~/.starkli-wallets/account.json"
    exit 1
fi

if [ -z "$STARKNET_KEYSTORE" ]; then
    echo "ERROR: STARKNET_KEYSTORE not set"
    exit 1
fi

# Get owner address from account file
OWNER=$(cat $STARKNET_ACCOUNT | grep -o '"address": "[^"]*"' | cut -d'"' -f4)
if [ -z "$OWNER" ]; then
    echo "ERROR: Could not extract owner address from account file"
    exit 1
fi

echo ""
echo "Deployment Parameters:"
echo "  Class Hash:  $CLASS_HASH"
echo "  Owner:       $OWNER"
echo "  ERC20:       $NATIVE_USDC (Native USDC)"
echo "  Rate:        $RATE_LOW (1:1)"
echo "  Bit Size:    $BIT_SIZE"
echo "  Auditor:     None"
echo ""
echo "Network: Starknet Mainnet"
echo ""

read -p "Deploy contract? (y/n) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "Deploying contract..."
echo ""

# Deploy command
# Constructor args: owner, ERC20, rate (u256), bit_size, auditor_key (Option)
starkli deploy \
    $CLASS_HASH \
    $OWNER \
    $NATIVE_USDC \
    $RATE_LOW $RATE_HIGH \
    $BIT_SIZE \
    $AUDITOR_OPTION \
    --account $STARKNET_ACCOUNT \
    --keystore $STARKNET_KEYSTORE \
    --rpc https://starknet-mainnet.public.blastapi.io \
    --watch

echo ""
echo "============================================================"
echo "DEPLOYMENT COMPLETE!"
echo "============================================================"
echo ""
echo "Next steps:"
echo "1. Save the contract address from above"
echo "2. Update src/tongo-config.ts with the new address"
echo "3. Test with the tutorial!"
echo ""
