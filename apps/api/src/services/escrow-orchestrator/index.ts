/**
 * The escrow orchestrator — off-chain glue between the anchor, Soroswap,
 * DeFindex, and the escrow contract (CLAUDE.md's architecture doc). Only
 * the Soroswap leg exists so far (Prompt 2.2); anchor and contract-call
 * orchestration land in later phases per CLAUDE.md's MVP order.
 */
export * from "./soroswap.js";
