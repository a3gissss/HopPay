import { authed } from "@/lib/server/handler";
import { getOwnedTransfer, mh } from "@/lib/server/mh";

type Ctx = { params: Promise<{ id: string }> };

export const POST = authed<Ctx>(async (_req, wallet, { params }) => {
  const { id } = await params;
  await getOwnedTransfer(id, wallet);
  return mh(`/transfers/${id}/prepare`, { method: "POST" });
});
