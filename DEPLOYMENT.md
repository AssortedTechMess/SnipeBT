# SnipeBT Deployment Guide

## DNS Resolution Workaround for Jupiter API

Your environment has DNS resolution issues preventing live trades. Here are your options:

### Option 1: System DNS Fix (Recommended - Most Reliable)

Update your network adapter DNS settings to use public resolvers:
1. Open Control Panel → Network and Sharing Center → Change adapter settings
2. Right-click your network adapter → Properties
3. Select "Internet Protocol Version 4 (TCP/IPv4)" → Properties
4. Choose "Use the following DNS server addresses":
   - Preferred DNS: `1.1.1.1` (Cloudflare)
   - Alternate DNS: `8.8.8.8` (Google)
5. Click OK and reconnect

### Option 2: Direct IP Override (Quick Test)

Use environment variables to bypass DNS resolution:

1. **Get Jupiter API IP** (run in PowerShell):
   ```powershell
   # Query using Node.js (more reliable in your environment)
   npx ts-node -e "import('https').then(h => import('axios').then(a => a.default.get('https://dns.google/resolve?name=quote-api.jup.ag&type=A', {timeout:5000}).then(r => console.log(r.data.Answer[0].data))))"
   ```

2. **Add to .env** (replace `<IP>` with result from step 1):
   ```env
   JUPITER_QUOTE_IP=<IP>
   ```

3. **Run tiny live test**:
   ```powershell
   npx ts-node src/main.ts --hours 0.02 --token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount-sol 0.001 --slippage-bps 30 --min-profit 0.0 --skip-validate --live
   ```

### Option 3: Code-Level Fallback (Already Enabled)

The bot now includes automatic DNS fallback logic:
- Custom DNS lookup using configured servers (1.1.1.1, 8.8.8.8)
- DNS-over-HTTPS (DoH) via Google and Cloudflare
- Direct-IP request with Host header and SNI for HTTPS

This runs automatically when DNS errors are detected in live mode.

## Current Status

- ✅ Dry-run mode works (simulates trades when Jupiter is unreachable)
- ✅ Wallet loaded from OS credential store
- ✅ CLI flags for safe tiny trades (--amount-sol, --slippage-bps, --live)
- ⚠️ Live trades blocked by DNS resolution to `quote-api.jup.ag`

## Safe Testing Command

Once DNS is fixed (via Option 1, 2, or automatic fallback succeeds):

```powershell
# Tiny live trade: 0.001 SOL, 0.3% slippage
npx ts-node src/main.ts --hours 0.02 --token EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v --amount-sol 0.001 --slippage-bps 30 --min-profit 0.0 --skip-validate --live
```

## Environment Variables Reference

```env
# Jupiter API endpoints (optional overrides)
JUPITER_QUOTE_URL=https://quote-api.jup.ag
JUPITER_SWAP_URL=https://quote-api.jup.ag

# Direct IP bypass (if DNS fails)
JUPITER_QUOTE_IP=<resolved_ip>

# DNS servers for custom lookup (comma-separated)
JUPITER_DNS_SERVERS=1.1.1.1,1.0.0.1,8.8.8.8,8.8.4.4

# Solana RPC
RPC_URL=https://api.mainnet-beta.solana.com
BACKUP_RPC_URL=https://solana-api.projectserum.com

# Environment
ENVIRONMENT=development

# Wallet key (stored in OS credential store, not .env)
WALLET_PRIVATE_KEY=REDACTED_FOR_SECURITY
```

## Troubleshooting

### "queryA ENODATA quote-api.jup.ag"
- DNS servers cannot resolve Jupiter domain
- **Fix**: Use Option 1 (system DNS) or Option 2 (direct IP)

### "getaddrinfo ENOTFOUND quote-api.jup.ag"
- OS resolver can't find the host
- **Fix**: Use Option 1 (system DNS) or let code fallback attempt DoH resolution

### Direct IP method not working
- Jupiter API may use CDN/load balancing with multiple IPs
- **Fix**: Use Option 1 (system DNS) for most reliable solution

## Next Steps

1. Choose Option 1 (system DNS) or Option 2 (direct IP) above
2. Run the safe testing command with tiny amounts
3. Verify the trade executes (check logs for signature)
4. If successful, adjust amounts/slippage for production runs
