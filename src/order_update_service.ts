import { createServer, type ServerResponse } from "node:http";
import { z } from "zod";
import { InfraiError, InfraiRoutingClient } from "./infrai_routing_client.js";

export const orderWorkloadSchema = z.object({
  order_id: z.string().min(1),
  checkout: z.object({ status: z.enum(["authorized", "paid"]) }),
  fulfillment: z.object({ status: z.enum(["queued", "shipped", "delivered"]) }),
  receipt: z.object({ channel: z.enum(["email", "sms"]) }),
  customer_updates: z.object({ enabled: z.boolean() }),
  excluded_receipt_provider: z.string().min(1)
}).strict();

export type OrderWorkload = z.infer<typeof orderWorkloadSchema>;

export async function applyReceiptPolicy(
  input: OrderWorkload,
  routing: Pick<InfraiRoutingClient, "excludeProvider">
) {
  await routing.excludeProvider("receipt_delivery", input.excluded_receipt_provider);
  return {
    order_id: input.order_id,
    checkout_status: input.checkout.status,
    fulfillment_status: input.fulfillment.status,
    receipt_channel: input.receipt.channel,
    customer_updates_enabled: input.customer_updates.enabled,
    routing: {
      capability: "receipt_delivery" as const,
      excluded_provider: input.excluded_receipt_provider,
      applied: true as const
    }
  };
}

async function readJson(request: import("node:http").IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json" });
  response.end(JSON.stringify(body));
}

export function startOrderUpdateService(port = 3000) {
  const apiKey = process.env.INFRAI_API_KEY;
  if (!apiKey) throw new Error("INFRAI_API_KEY is required");
  const routing = new InfraiRoutingClient(apiKey);

  return createServer(async (request, response) => {
    if (request.method !== "POST" || request.url !== "/orders/provider-policy") {
      json(response, 404, { error: "not_found" });
      return;
    }

    try {
      const input = orderWorkloadSchema.parse(await readJson(request));
      json(response, 200, await applyReceiptPolicy(input, routing));
    } catch (error) {
      if (error instanceof z.ZodError) {
        json(response, 400, { error: "invalid_request", issues: error.issues });
      } else if (error instanceof InfraiError) {
        const status = error.status >= 400 && error.status < 500 ? error.status : 502;
        json(response, status, { error: error.code, details: error.details });
      } else {
        json(response, 502, { error: "upstream_transport_error" });
      }
    }
  }).listen(port, "127.0.0.1", () => {
    console.log(`Order update service listening on http://127.0.0.1:${port}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) startOrderUpdateService();
