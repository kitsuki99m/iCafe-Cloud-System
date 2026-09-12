import test from "node:test";
import assert from "node:assert/strict";
import { ratePlanEligibility } from "./rateEligibility.js";

test("Gold holiday promo is visible to Gold and VIP", () => {
  const goldPromo = {
    is_active: true,
    customer_self_service: true,
    customer_tier: "Gold",
    promo_kind: "holiday",
    starts_at: null,
    ends_at: null,
  };

  assert.equal(
    ratePlanEligibility(
      goldPromo,
      { tier: "Gold" },
      "2026-08-16T12:00:00+08:00",
    ).eligible,
    true,
  );
  assert.equal(
    ratePlanEligibility(goldPromo, { tier: "VIP" }, "2026-08-16T12:00:00+08:00")
      .eligible,
    true,
  );
  assert.equal(
    ratePlanEligibility(
      goldPromo,
      { tier: "Regular" },
      "2026-08-16T12:00:00+08:00",
    ).eligible,
    false,
  );
});

test("VIP promo is visible only to VIP", () => {
  const vipPromo = {
    is_active: true,
    customer_self_service: true,
    customer_tier: "VIP",
    promo_kind: "just_because",
    starts_at: null,
    ends_at: null,
  };

  assert.equal(
    ratePlanEligibility(vipPromo, { tier: "VIP" }, "2026-08-16T12:00:00+08:00")
      .eligible,
    true,
  );
  assert.equal(
    ratePlanEligibility(vipPromo, { tier: "Gold" }, "2026-08-16T12:00:00+08:00")
      .eligible,
    false,
  );
  assert.equal(
    ratePlanEligibility(
      vipPromo,
      { tier: "Regular" },
      "2026-08-16T12:00:00+08:00",
    ).eligible,
    false,
  );
});
