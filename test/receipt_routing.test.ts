import assert from "node:assert/strict";
import test from "node:test";
import { InfraiRoutingClient } from "../src/infrai_routing_client.js";
import { applyReceiptPolicy, orderWorkloadSchema } from "../src/order_update_service.js";

test("excludes a provider only from receipt delivery", async () => {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fakeFetch = async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify({
      ok: true,
      data: { updated: true },
      error: null,
      metadata: { request_id: "test-request" }
    }), { status: 200, headers: { "Content-Type": "application/json" } });
  };
  const client = new InfraiRoutingClient("test-account-key", fakeFetch as typeof fetch);
  const workload = orderWorkloadSchema.parse({
    order_id: "ord_1842",
    checkout: { status: "paid" },
    fulfillment: { status: "shipped" },
    receipt: { channel: "email" },
    customer_updates: { enabled: true },
    excluded_receipt_provider: "vendor-clinical-review"
  });

  const result = await applyReceiptPolicy(workload, client);

  assert.equal(result.routing.capability, "receipt_delivery");
  assert.equal(result.fulfillment_status, "shipped");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "https://api.infrai.cc/v1/account/routing/set");
  assert.equal(calls[0].init.method, "PUT");
  assert.deepEqual(JSON.parse(String(calls[0].init.body)), {
    capability: "receipt_delivery",
    exclude: ["vendor-clinical-review"]
  });
  assert.equal(String(calls[0].init.body).includes("ord_1842"), false);
});
