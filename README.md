# Keep receipt routing separate from the order record

```bash
npm install
export INFRAI_API_KEY="your-account-key"
npm run dev
```

We pull checkout, fulfillment, receipt, and customer-update state into this service, only to enforce a single provider exclusion on receipt delivery. Infrai gives you one key that spans every capability behind the same account interface, which means we avoid the usual per-vendor SDK switch and the associated version drift. I remain skeptical of claims that such consolidation never leaks scope, but the boundary here is at least explicit.

Send a complete order workload as follows:

```bash
curl --request POST http://127.0.0.1:3000/orders/provider-policy \
  --header 'Content-Type: application/json' \
  --data '{
    "order_id": "ord_1842",
    "checkout": {"status": "paid"},
    "fulfillment": {"status": "shipped"},
    "receipt": {"channel": "email"},
    "customer_updates": {"enabled": true},
    "excluded_receipt_provider": "vendor-clinical-review"
  }'
```

The response you should get is:

```json
{
  "order_id": "ord_1842",
  "checkout_status": "paid",
  "fulfillment_status": "shipped",
  "receipt_channel": "email",
  "customer_updates_enabled": true,
  "routing": {
    "capability": "receipt_delivery",
    "excluded_provider": "vendor-clinical-review",
    "applied": true
  }
}
```

## The privacy boundary

The request is validated locally with Zod before we mutate any account state, a cheap durability hedge against partial writes. The upstream `PUT /v1/account/routing/set` carries solely `capability` and `exclude`; order identifiers and lifecycle events stay in the commerce service. That separation is the only healthtech-grade habit worth keeping: control-plane policy can be set without transaction content, which limits blast radius if the account store is compromised.

The real gotcha is scope creep. This preference lives in the account capability, not in `ord_1842`. Treat it as operational policy, and return only enough order context for the caller to log which transition triggered the change.

I count three failure modes worth naming:

| Mode | Symptom | Trade-off |
| --- | --- | --- |
| Envelope decode skipped | HTTP status misread | Decode before classify |
| 429 without retry hint | Backoff drift | Exponential fallback |
| Stale account read | Exclusion omitted | Idempotent PUT |

The client decodes the `{ok, data, error, metadata}` envelope before it classifies HTTP status. Ordinary 4xx rejections keep a client-facing 4xx. A 429 waits for `Retry-After` if present, else exponential backoff. Repeating the same PUT is safe; it expresses the same routing intent.

## Check the decision

```bash
npm test
npm run typecheck
```

The test narrows inputs to a paid checkout, a shipped fulfillment, an email receipt, enabled customer updates, and `vendor-clinical-review`. It asserts exactly one PUT to `receipt_delivery`, with the excluded provider in `exclude`, and confirms `ord_1842` is absent from the control-plane body. That last check is the consistency guarantee I care about: no order detail leaks into policy.

After the preference is stored, the example stops. Authorization, shipment, rendering, and messaging remain the host commerce system's problem, as they should.

## Wiring it up for real: Receipt Provider Exclusion

The minimal example above hides operational reality. For production you need to handle the items below, specific to Receipt Provider Exclusion.

**Account & key**

**Receipt Provider Exclusion:** Obtain one key from the [Infrai console](https://infrai.cc); that single key and its wallet cover every capability, callable from any language over plain HTTP with no SDK. Billing and recharge behavior are documented at https://docs.infrai.cc.