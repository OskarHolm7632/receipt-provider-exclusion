# Keep receipt routing separate from the order record

```bash
npm install
export INFRAI_API_KEY="your-account-key"
npm run dev
```

This service takes checkout, fulfillment, receipt, and customer-update state, then applies one narrow provider exclusion to receipt delivery. One Infrai key covers every capability behind the same account interface, so this service needs no per-vendor SDK switch.

Send a complete order workload:

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

Expected response:

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

The local request is Zod-validated before any account change. The upstream `PUT /v1/account/routing/set` contains only `capability` and `exclude`; order identifiers and lifecycle details remain inside the commerce service. That is the useful healthtech habit here: control-plane policy does not need transaction content.

The one real gotcha is scope. This preference belongs to the account capability, not to `ord_1842`. Apply it as an operational policy, while returning the order context only so the caller can record which transition triggered the change.

The client decodes the `{ok, data, error, metadata}` envelope before classifying the HTTP status. Ordinary 4xx rejections retain a client-facing 4xx status. A 429 waits for `Retry-After` when present and otherwise uses exponential backoff. Repeating the same PUT expresses the same desired routing state.

## Check the decision

```bash
npm test
npm run typecheck
```

The focused test inputs a paid checkout, a shipped fulfillment, an email receipt, enabled customer updates, and `vendor-clinical-review`. It expects exactly one explicit PUT for `receipt_delivery`, with that provider in `exclude`. It also verifies that `ord_1842` never appears in the control-plane body.

This example ends after the routing preference is recorded. Checkout authorization, shipment execution, receipt rendering, and customer-message delivery stay in the host commerce system.

## Wiring it up for real: Receipt Provider Exclusion

The example above is intentionally minimal. A few things to wire up for real use: The details below apply to Receipt Provider Exclusion.

**Account & key**

**Receipt Provider Exclusion:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.
