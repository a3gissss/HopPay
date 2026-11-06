import { createHmac, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

// Register this URL with POST /webhooks and put the returned whsec_ secret in MH_WEBHOOK_SECRET.
// The browser already polls transfer status; this endpoint is where server-side follow-ups
// (emails to recipients, accounting sync, Slack alerts) hook in.

export async function POST(req: Request) {
  const secret = process.env.MH_WEBHOOK_SECRET;
  if (!secret) return NextResponse.json({ error: "webhooks not configured" }, { status: 503 });

  const payload = await req.text();
  const signature = req.headers.get("x-multihopper-signature") ?? "";
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  let event: any;
  try {
    event = JSON.parse(payload);
  } catch {
    return NextResponse.json({ error: "bad payload" }, { status: 400 });
  }
  console.info("[multihopper webhook]", event?.type ?? event?.event, event?.data?.id ?? event?.transfer?.id ?? "");
  return NextResponse.json({ received: true });
}
