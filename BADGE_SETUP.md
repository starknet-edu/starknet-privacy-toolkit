# 🏅 Verified Donor Badge System Setup Guide

This guide walks you through setting up the complete Verified Donor Badge system using Noir + Garaga + Starknet.

## Prerequisites

- Node.js 18+ and Bun
- Python 3.10+ (for Garaga)
- Rust (for Noir/Barretenberg)

## Step 1: Install Noir (nargo)

```bash
# Install noirup
curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash

# Reload shell
source ~/.bashrc  # or ~/.zshrc

# Install latest stable Noir
noirup --version 1.0.0-beta.5

# Verify installation
nargo --version
# Expected: nargo version = 1.0.0-beta.5
```

## Step 2: Install Barretenberg (bb)

```bash
# Install bbup (auto-detects compatible version with your Noir)
curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/refs/heads/master/barretenberg/bbup/install | bash

# Reload shell
source ~/.bashrc

# Install bb (auto-matches Noir version)
bbup

# Verify installation
bb --version
# Expected: v0.82.2 or compatible
```

## Step 3: Install Garaga (Python 3.10 required)

```bash
# Create Python 3.10 virtual environment
python3.10 -m venv garaga-env
source garaga-env/bin/activate

# Install Garaga
pip install garaga==0.15.5

# Verify installation
garaga --help
```

## Step 4: Install Starknet Foundry (for contract deployment)

```bash
# Install snfoundryup
curl -L https://raw.githubusercontent.com/foundry-rs/starknet-foundry/master/scripts/install.sh | sh

# Reload shell
source ~/.bashrc

# Install starknet foundry
snfoundryup

# Verify
snforge --version
sncast --version
```

## Step 5: Compile the Noir Circuit

```bash
cd zk-badges/donation_badge

# Compile the circuit
nargo compile

# Run tests
nargo test

# Expected output:
# [donation_badge] Compiling...
# [donation_badge] Testing...
# test test_valid_silver_badge ... ok
# test test_valid_gold_badge ... ok
```

## Step 6: Generate Proof and Verification Key

```bash
# Execute circuit with inputs to generate witness
nargo execute witness

# Generate proof using UltraHonk (required for Garaga)
bb prove_ultra_keccak_honk \
    -b ./target/donation_badge.json \
    -w ./target/witness.gz \
    -o ./target/proof.bin

# Generate verification key
bb write_vk_ultra_keccak_honk \
    -b ./target/donation_badge.json \
    -o ./target/vk.bin

# Verify proof locally (sanity check)
bb verify_ultra_keccak_honk \
    -k ./target/vk.bin \
    -p ./target/proof.bin

# Expected: Proof verified successfully
```

## Step 7: Generate Cairo Verifier Contract

```bash
# Activate Python environment
source ../garaga-env/bin/activate

# Generate Cairo verifier contract
cd ../..
garaga gen \
    --system ultra_keccak_honk_starknet \
    --vk zk-badges/donation_badge/target/vk.bin \
    --project-name donation_badge_verifier

# This creates a new Scarb project in ./donation_badge_verifier/
```

## Step 8: Integrate Badge Contract

After Garaga generates the verifier:

1. Copy `donation_badge_verifier/src/badge_contract.cairo` to the generated project
2. Update `donation_badge_verifier/src/lib.cairo` to import the verifier
3. Update `badge_contract.cairo` to use the generated verifier

```bash
cd donation_badge_verifier

# Build with Scarb
scarb build

# Output: Compiled donation_badge_verifier.contract_class.json
```

## Step 9: Deploy to Starknet

### Configure Deployment Account

Create `snfoundry.toml`:

```toml
[profile.sepolia]
account = "deployer"
accounts-file = "./accounts.json"
url = "https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/YOUR_ALCHEMY_KEY"
```

### Deploy Contract

```bash
# Declare the contract class
sncast --profile sepolia declare \
    --contract-name DonationBadge

# Note the class_hash from output
# Deploy instance
sncast --profile sepolia deploy \
    --class-hash <CLASS_HASH_FROM_ABOVE>

# Note the contract address
```

## Step 10: Update Badge Service

Update `src/badge-service.ts` with the deployed contract address:

```typescript
const BADGE_CONTRACT_ADDRESS = {
  mainnet: '0x...', // Update after mainnet deployment
  sepolia: '0x...'  // Update after testnet deployment
};
```

## Step 11: Install Browser Dependencies (Optional)

For browser-based proof generation, install:

```bash
npm install @noir-lang/noir_js @aztec/bb.js circomlibjs
```

Then copy the compiled circuit to `public/circuits/`:

```bash
cp zk-badges/donation_badge/target/donation_badge.json public/circuits/
```

## Testing End-to-End

1. Start the app: `bun run dev:web`
2. Connect your wallet
3. Navigate to the "Donation Badges" section
4. Enter donation amount and secret
5. Generate proof (may take 30-60 seconds)
6. Claim badge on-chain

## Project Structure

```
tongo-donation-demo/
├── src/
│   ├── index.html          # Updated with badge UI
│   ├── badge-service.ts    # Badge claiming logic
│   └── ...
├── zk-badges/
│   └── donation_badge/
│       ├── src/
│       │   └── main.nr     # Noir circuit
│       ├── Nargo.toml
│       └── target/
│           ├── donation_badge.json  # Compiled circuit
│           ├── vk.bin               # Verification key
│           └── proof.bin             # Sample proof
├── donation_badge_verifier/        # Generated by Garaga
│   ├── src/
│   │   ├── lib.cairo              # Auto-generated verifier
│   │   └── badge_contract.cairo   # Badge minting logic
│   └── Scarb.toml
└── public/
    └── circuits/
        └── donation_badge.json    # Served for browser proving
```

## Troubleshooting

### Noir compilation errors
- Ensure you're using Noir 1.0.0-beta.5 or compatible
- Check that all dependencies are installed

### Garaga errors
- Ensure Python 3.10+ is used
- Check that verification key was generated correctly
- Verify the system flag matches your proof system

### Contract deployment errors
- Ensure you have sufficient STRK for gas
- Check network configuration in `snfoundry.toml`
- Verify contract compiled successfully

### Browser proof generation
- Ensure circuit JSON is accessible at `/circuits/donation_badge.json`
- Check browser console for WASM loading errors
- Consider using a backend service for proof generation in production

## Next Steps

- [ ] Deploy to testnet (Sepolia)
- [ ] Test badge claiming flow
- [ ] Deploy to mainnet
- [ ] Update contract addresses in badge-service.ts
- [ ] Add badge display to user profiles
- [ ] Implement badge verification API

