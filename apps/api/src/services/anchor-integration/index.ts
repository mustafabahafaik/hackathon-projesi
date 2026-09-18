/**
 * anchor-integration — the API's SEP-24 leg: starts interactive deposit/
 * withdraw flows against whichever anchor `ANCHOR_HOME_DOMAIN` names, and
 * listens for that anchor's status-change webhook. See routes.ts and
 * client.ts for the flow and CLAUDE.md "Anchor Riski" for why the anchor
 * itself may be a stub (`apps/anchor-stub`) rather than a real one.
 */
export * from "./routes.js";
export * from "./client.js";
