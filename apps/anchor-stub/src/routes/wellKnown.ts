/** SEP-1: the anchor's own directory of its other SEP endpoints. */
import { Router } from "express";
import { config } from "../config.js";
import { anchorAccount } from "../stellarPayments.js";

export const wellKnownRouter = Router();

wellKnownRouter.get("/.well-known/stellar.toml", (_req, res) => {
  res.type("text/plain").send(`VERSION="2.7.0"
NETWORK_PASSPHRASE="${config.networkPassphrase}"
SIGNING_KEY="${anchorAccount()}"
WEB_AUTH_ENDPOINT="${config.baseUrl}/auth"
TRANSFER_SERVER_SEP0024="${config.baseUrl}/sep24"
KYC_SERVER="${config.baseUrl}/sep12"
ANCHOR_QUOTE_SERVER="${config.baseUrl}/sep38"
ACCOUNTS=["${anchorAccount()}"]

[DOCUMENTATION]
ORG_NAME="Depozito Anchor Stub (testnet sandbox)"
ORG_URL="${config.baseUrl}"
ORG_DESCRIPTION="Protocol-complete SEP-6/24/12/38 stub for the Depozito escrow project. The bank/TRY transfer leg is simulated; every Stellar transaction is real testnet activity. See CLAUDE.md 'Anchor Riski'."

[[CURRENCIES]]
code="${config.usdcAssetCode}"
issuer="${config.usdcIssuer}"
status="test"
display_decimals=2
is_asset_anchored=true
anchor_asset_type="fiat"
anchor_asset="TRY"
desc="Real testnet USDC. Deposits pay this out for real; withdrawals require really sending it to this anchor's account. The TRY side is simulated at a fixed rate — see ANCHOR_FX_RATE_TRY_PER_USDC."
`);
});
