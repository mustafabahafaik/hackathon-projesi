import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";
import { config } from "./config.js";

export function issueToken(account: string): string {
  return jwt.sign({ sub: account }, config.jwtSecret, { expiresIn: "1h" });
}

export interface AuthedRequest extends Request {
  account?: string;
}

/** SEP-10 bearer-JWT guard, required by SEP-12/24/38's authenticated endpoints. */
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction): void {
  const header = req.header("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;
  if (!token) {
    res.status(401).json({ error: "missing bearer token — authenticate via SEP-10 (/auth) first" });
    return;
  }
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { sub: string };
    req.account = payload.sub;
    next();
  } catch {
    res.status(401).json({ error: "invalid or expired token" });
  }
}
