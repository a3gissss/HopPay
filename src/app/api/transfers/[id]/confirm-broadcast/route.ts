import { authed, readJson } from "@/lib/server/handler";
import { getOwnedTransfer, mh, MhError } from "@/lib/server/mh";

type Ctx = { params: Promise<{ id: string }> };

const SIG = /^[1-9A-HJ-NP-Za-km-z]{64,90}$/;

function sigs(v: unknown, name: string): string[] | undefined {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.length > 64 || !v.every((s) => typeof s === "string" && SIG.test(s))) {
    throw new MhError(400, "INVALID_REQUEST", `${name} must be an array of signatures`);
  }
  return v;
}

function sig(v: unknown, name: string): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (typeof v !== "string" || !SIG.test(v)) throw new MhError(400, "INVALID_REQUEST", `${name} must be a signature`);
  return v;
}

export const POST = authed<Ctx>(async (req, wallet, { params }) => {
  const { id } = await params;
  const b = await readJson(req);
  await getOwnedTransfer(id, wallet);
  return mh(`/transfers/${id}/confirm-broadcast`, {
    method: "POST",
    body: {
      routeInitSignatures: sigs(b.routeInitSignatures ?? [], "routeInitSignatures"),
      keeperFundingSignature: sig(b.keeperFundingSignature, "keeperFundingSignature"),
      orchestratorInitSignature: sig(b.orchestratorInitSignature, "orchestratorInitSignature"),
      sessionInitSignatures: sigs(b.sessionInitSignatures, "sessionInitSignatures"),
      dispersionInitSignatures: sigs(b.dispersionInitSignatures, "dispersionInitSignatures"),
    },
  });
});
