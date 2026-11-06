"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Batch, listBatches } from "@/lib/client/batches";
import { formatAmount, sum } from "@/lib/amounts";

export function BatchList({ wallet }: { wallet: string }) {
  const [batches, setBatches] = useState<Batch[]>([]);
  useEffect(() => setBatches(listBatches(wallet)), [wallet]);

  return (
    <aside className="card h-fit">
      <h2 className="font-bold">Recent batches</h2>
      {batches.length === 0 ? (
        <p className="mt-2 text-sm text-muted">Batches you start from this browser show up here.</p>
      ) : (
        <ul className="mt-3 divide-y divide-line">
          {batches.slice(0, 20).map((b) => {
            const done = b.chunks.filter((c) => c.status === "completed").length;
            return (
              <li key={b.id}>
                <Link href={`/batch/${b.id}`} className="-mx-2 block rounded-lg px-2 py-3 hover:bg-slate-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{b.name}</span>
                    <span className="shrink-0 text-xs text-muted">{new Date(b.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-0.5 flex justify-between text-xs text-muted">
                    <span>
                      {formatAmount(sum(b.recipients.map((r) => BigInt(r.targetRaw))), b.token.decimals, 2)} {b.token.symbol} to{" "}
                      {b.recipients.length}
                    </span>
                    <span>{done}/{b.chunks.length} routes done</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
