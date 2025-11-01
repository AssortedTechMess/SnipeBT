# Setup Instructions for Collaborators

## Initial Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/AssortedTechMess/SnipeBT.git
   cd SnipeBT
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Install keytar for secure credential storage:
   ```bash
   npm install keytar
   ```

## Setting up your credentials

**IMPORTANT**: Never commit private keys or API secrets to the repository!

### Store your Solana wallet private key securely:
```bash
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY
```

The script accepts multiple formats:
- Base58 string
- Base64 string  
- JSON array of bytes
- Comma-separated bytes

### Set up environment variables:
Create a `.env` file (this is in .gitignore, so it won't be committed):

```env
# RPC Configuration
RPC_URL=https://api.mainnet-beta.solana.com
BACKUP_RPC_URL=https://solana-api.projectserum.com

# Environment
ENVIRONMENT=development

# Twitter API Keys (if using Twitter features)
TWITTER_API_KEY=your_api_key_here
TWITTER_API_SECRET=your_api_secret_here
TWITTER_ACCESS_TOKEN=your_access_token_here
TWITTER_ACCESS_TOKEN_SECRET=your_access_token_secret_here
```

## Running the bot

### Development mode (dry run):
```bash
npm run dev
# or
npx ts-node src/main.ts --auto-tp --multi-input --risk 0.02
```

### Live trading (be careful!):
```bash
npx ts-node src/main.ts --live --auto-tp --multi-input --risk 0.02
```

## Key Files

- `src/main.ts` - Main bot entry point
- `src/config.ts` - Configuration management
- `src/secureConfig.ts` - Secure credential loading
- `src/storeSecret.ts` - Helper for storing secrets securely
- `src/positionManager.ts` - Trading position management
- `src/stream.ts` - Price streaming and monitoring

## Development Guidelines

1. Always test in dry-run mode first
2. Never commit `.env` files or private keys
3. Use the `storeSecret.ts` helper for storing sensitive data
4. Keep risk parameters conservative during testing
5. Check the logs for any errors before live trading

## Getting Help

If you run into issues:
1. Check the README.md for detailed documentation
2. Ensure all dependencies are installed
3. Verify your credentials are stored correctly
4. Test with small amounts first