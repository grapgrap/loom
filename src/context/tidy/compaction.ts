import type { Scope } from "../model.ts";
import type { Memory, ConsolidationHistory } from "./model.ts";
import { matchesContextScope } from "../sources/sources.ts";
import type { SearchContent } from "../sources/search.ts";
import { extractSearchText } from "../sources/search.ts";

// UTF-8 byte counts are review signals, not model token counts or storage limits.
const contextSizeThreshold = 24_000;
const contextGrowthThreshold = 8_000;

export function contextSelection({ work, query }: { work?: string; query?: string } = {}) {
  const words = (query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  return (entry: SearchContent & { scope?: Scope }) =>
    (work === undefined || matchesContextScope(entry, work)) &&
    words.every((word) => extractSearchText(entry).toLowerCase().includes(word));
}

function memoryBytes(memory: Exclude<Memory, { status: "absorbed" }>) {
  return Buffer.byteLength(
    JSON.stringify({
      text: memory.text,
      reason: memory.reason,
      sources: memory.sources,
      supersedes: memory.supersedes,
    }),
  );
}

export function measureContext(
  memories: Memory[],
  pending: unknown[],
  history?: ConsolidationHistory | null,
) {
  const selected = memories.filter(
    (memory): memory is Exclude<Memory, { status: "absorbed" }> =>
      memory.status !== "retired" && memory.status !== "absorbed",
  );
  const selectedIds = new Set(selected.map(({ id }) => id));
  const baselines = new Map<string, { bytes: number; latestBytes: number; reduced: boolean }>();
  for (const revision of history?.revisions ?? []) {
    for (const memory of revision.memories) {
      if (
        !selectedIds.has(memory.id) ||
        memory.status === "retired" ||
        memory.status === "absorbed"
      )
        continue;
      const bytes = memoryBytes(memory);
      const previous = baselines.get(memory.id);
      if (!previous || bytes < previous.latestBytes) {
        baselines.set(memory.id, { bytes, latestBytes: bytes, reduced: Boolean(previous) });
      } else {
        previous.latestBytes = bytes;
      }
    }
  }
  const currentBytes = selected.reduce((sum, memory) => sum + memoryBytes(memory), 0);
  const baselineBytes = selected.reduce(
    (sum, memory) => sum + (baselines.get(memory.id)?.bytes ?? memoryBytes(memory)),
    0,
  );
  const pendingBytes = pending.reduce<number>(
    (sum, source) => sum + Buffer.byteLength(JSON.stringify(source)),
    0,
  );
  const growthBytes = Math.max(0, currentBytes - baselineBytes) + pendingBytes;
  const totalBytes = currentBytes + pendingBytes;
  const unreducedBytes = selected.reduce(
    (sum, memory) => sum + (baselines.get(memory.id)?.reduced ? 0 : memoryBytes(memory)),
    0,
  );
  const reasons = [];
  // After a reduction, a still-large but unchanged context does not request another pass.
  if (
    totalBytes >= contextSizeThreshold &&
    (baselineBytes < contextSizeThreshold || unreducedBytes >= contextSizeThreshold)
  )
    reasons.push("context-size");
  if (growthBytes >= contextGrowthThreshold) reasons.push("context-growth");
  return { memoryBytes: currentBytes, pendingBytes, totalBytes, growthBytes, reasons };
}
