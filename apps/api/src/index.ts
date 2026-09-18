/**
 * Backend entry point. `anchor-integration` is the first real HTTP
 * service wired in (CLAUDE.md MVP step 2) — auth (Privy callback), lease
 * records, and the chain indexer land in later phases per CLAUDE.md's MVP
 * order. `escrow-orchestrator` (Soroswap/DeFindex) has no HTTP surface
 * yet; it's called as a library, not mounted here.
 */
import express from "express";
import { config as anchorIntegrationConfig } from "./services/anchor-integration/config.js";
import { anchorRouter } from "./services/anchor-integration/index.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(anchorRouter);

app.listen(anchorIntegrationConfig.port, () => {
  console.log(`[api] listening on ${anchorIntegrationConfig.baseUrl}`);
});
