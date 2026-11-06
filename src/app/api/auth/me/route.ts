import { NextResponse } from "next/server";
import { endSession, sessionWallet } from "@/lib/server/session";

export async function GET() {
  return NextResponse.json({ wallet: await sessionWallet() });
}

/** Sign out. */
export async function DELETE() {
  await endSession();
  return NextResponse.json({ wallet: null });
}
