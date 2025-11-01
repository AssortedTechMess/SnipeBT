# SnipeBT (sanitized share)

This is a sanitized copy of the SnipeBT project suitable for sharing. Secrets are not included — use the `storeSecret.ts` helper to store secrets securely in the OS credential store.

## storeSecret helper

The project includes `src/storeSecret.ts`, a small CLI helper that stores, lists, shows, and deletes secrets using the OS credential store (via `keytar`). It also validates and normalizes Solana wallet private keys before storing them (accepted formats: base58, base64, JSON byte array, comma-separated bytes).

Install dependencies:

```powershell
cd 'C:\path\to\SnipeBT-share'
npm install
npm install keytar bs58
```

PowerShell examples (run with `npx ts-node src/storeSecret.ts` if you don't compile):

Store interactively:

```powershell
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY
```

Store from a file:

```powershell
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY --file C:\secrets\mykey.txt
```

List stored secrets for the service (default service: `snipebt`):

```powershell
npx ts-node src/storeSecret.ts --list
```

Show a secret value:

```powershell
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY --show
```

Delete a secret:

```powershell
npx ts-node src/storeSecret.ts --name WALLET_PRIVATE_KEY --delete
```

Notes:
- Do NOT commit `.env` or any file containing plaintext secrets.
- After storing your wallet with `storeSecret.ts`, remove any plaintext copy from disk and .env files.
- To push this sanitized repo to GitHub: initialize git, create a repo on GitHub, then set the remote and push. Example commands are provided in the project root.
# SnipeBT (sanitized share copy)

This is a sanitized copy of the SnipeBT trading bot prepared for sharing. It intentionally does not include any local secrets or .env files. Follow the instructions below to securely provide your credentials before running.

## Quick security notes
- Do NOT commit your private keys or API secrets to the repository.
- The recommended approach is to store the Solana private key in your OS credential store using the included `storeSecret.ts` script (requires `keytar`).
- Twitter keys and other API keys should be provided via environment variables and NOT committed.

## How to securely add your wallet private key (recommended)
1. Install `keytar` locally (if not already):

```powershell
npm install keytar
```

2. Run the helper to securely store your private key in the OS credential store:

```powershell
npm run store-secret
# or
npx ts-node src/storeSecret.ts
```

The script will prompt you to paste your private key in one of these formats: base58, base64, JSON array of bytes, or comma-separated bytes. It will then store it in the OS credential store.

3. Verify `WALLET_PRIVATE_KEY` is NOT present in a `.env` file before sharing or committing.

## Running the bot (after storing secrets)
1. Create a `.env` with non-sensitive runtime config (RPC endpoints, ENVIRONMENT):

```env
RPC_URL=https://api.mainnet-beta.solana.com
BACKUP_RPC_URL=https://solana-api.projectserum.com
ENVIRONMENT=development
```

2. Run the bot locally (dry-run by default; add `--live` to enable real trades):

```powershell
npx ts-node src/main.ts --auto-tp --multi-input --risk 0.02
```

## Files of interest
- `src/storeSecret.ts` — helper to store `WALLET_PRIVATE_KEY` in OS credential store using `keytar`.
- `src/secureConfig.ts` — loads `.env`, prefers OS credential store, and prevents leaking sensitive values.
- `src/config.ts` — runtime initialization and wallet loading (reads from `secureConfig`).

## Before pushing to GitHub
- Ensure `.gitignore` contains `.env` and other secret files (already included in this sanitized copy).
- Run a local search for secrets (see instructions in the original repo if needed).

If you want, I can also prepare a zipped archive of this sanitized copy ready to share, or create a new GitHub repo and push it (you'll need to authorize/allow push). Let me know which you prefer.
