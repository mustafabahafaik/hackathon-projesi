/**
 * SEP-12: KYC customer info. No real KYC checks — this stub accepts
 * whatever's submitted and marks it ACCEPTED, since the whole point is
 * proving the protocol wiring, not gatekeeping fake users. A production
 * anchor plugs a real KYC provider in here without changing this shape.
 */
import { Router } from "express";
import { requireAuth, type AuthedRequest } from "../jwt.js";
import { store } from "../store.js";

export const sep12Router = Router();
sep12Router.use(requireAuth);

sep12Router.put("/customer", (req: AuthedRequest, res) => {
  const account = req.account!;
  const body = req.body ?? {};
  const customer = store.customers.upsert(account, {
    firstName: body.first_name,
    lastName: body.last_name,
    emailAddress: body.email_address,
  });
  res.status(202).json({ id: customer.id });
});

sep12Router.get("/customer", (req: AuthedRequest, res) => {
  const account = req.account!;
  const customer = store.customers.get(account);
  if (!customer) {
    res.json({
      status: "NEEDS_INFO",
      fields: {
        first_name: { type: "string", description: "First name" },
        last_name: { type: "string", description: "Last name" },
        email_address: { type: "string", description: "Email address" },
      },
    });
    return;
  }
  res.json({ id: customer.id, status: customer.status });
});
