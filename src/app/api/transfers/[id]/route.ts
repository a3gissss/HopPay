import { authed } from "@/lib/server/handler";
import { getOwnedTransfer } from "@/lib/server/mh";

type Ctx = { params: Promise<{ id: string }> };

export const GET = authed<Ctx>(async (_req, wallet, { params }) => {
  return getOwnedTransfer((await params).id, wallet);
});
