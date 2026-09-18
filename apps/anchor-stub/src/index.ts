/**
 * Depozito Anchor Stub — entry point. See config.ts's module comment for
 * why this exists (CLAUDE.md "Anchor Riski") and each route file for the
 * SEP it implements: SEP-1 (wellKnown), SEP-10 (sep10), SEP-12 (sep12),
 * SEP-24 (sep24), SEP-38 (sep38).
 */
import express from "express";
import { config } from "./config.js";
import { wellKnownRouter } from "./routes/wellKnown.js";
import { sep10Router } from "./routes/sep10.js";
import { sep12Router } from "./routes/sep12.js";
import { sep24Router } from "./routes/sep24.js";
import { sep38Router } from "./routes/sep38.js";
import { anchorAccount } from "./stellarPayments.js";

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(wellKnownRouter);
app.use(sep10Router);
// Mounted with a path prefix (unlike the other routers, which bake their
// full path into each route) so sep12's blanket `requireAuth` middleware
// — applied via `router.use()` with no path of its own — only intercepts
// requests actually under /sep12, instead of shadowing every router
// mounted after it.
app.use("/sep12", sep12Router);
app.use(sep24Router);
app.use(sep38Router);

app.listen(config.port, () => {
  console.log(`[anchor-stub] listening on ${config.baseUrl} (account ${anchorAccount()})`);
});
