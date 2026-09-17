/**
 * Backend entry point — placeholder.
 *
 * Real services land here per CLAUDE.md's MVP order: auth (Privy callback),
 * lease records, the escrow orchestrator (anchor -> Soroswap -> DeFindex ->
 * contract calls), and the chain indexer. Nothing below talks to a real
 * service yet — this only proves the API resolves the shared `@depozito/sdk`
 * workspace package.
 */
import { LeaseStatus, type Lease } from "@depozito/sdk";

const placeholder: Lease = {
  id: "LSE-0000",
  address: "—",
  landlord: "—",
  tenant: "—",
  arbiter: "—",
  depositAmount: 0n,
  termStart: 0,
  termEnd: 0,
  status: LeaseStatus.Created,
  createdAt: 0,
};

console.log("Depozito API — placeholder, henüz servis yok.", placeholder.status);
