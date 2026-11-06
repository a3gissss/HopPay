import { authed, readJson } from "@/lib/server/handler";
import { mh } from "@/lib/server/mh";
import { address, int, rawAmount } from "@/lib/server/validate";

export const POST = authed(async (req) => {
  const b = await readJson(req);
  const body: Record<string, unknown> = {
    tokenMint: address(b.tokenMint, "tokenMint"),
    amountRaw: rawAmount(b.amountRaw, "amountRaw").toString(),
    tokenDecimals: int(b.tokenDecimals, "tokenDecimals", 0, 18),
    hops: int(b.hops, "hops", 3, 10),
    arrivalSeconds: int(b.arrivalSeconds, "arrivalSeconds", 60, 2_592_000),
  };
  const destinationCount = int(b.destinationCount ?? 1, "destinationCount", 1, 20);
  if (destinationCount > 1) body.destinationCount = destinationCount;
  return mh("/transfers/estimate", { method: "POST", body });
});
