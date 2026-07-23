"use client";

import { EVIDENCE, getAvailableEvidenceForRound } from "@/lib/game-data/evidence";

interface InvestigationBoardProps {
  round: number;
  collectedIds: Set<string>;
  onCollect: (evidenceId: string) => void;
}

export default function InvestigationBoard({
  round,
  collectedIds,
  onCollect,
}: InvestigationBoardProps) {
  const roundEvidence = getAvailableEvidenceForRound(round);
  // action_triggered 증거(예: 신발 요청)는 라운드와 무관하게 심문 중 행동으로만
  // 해금된다 — 실제로 확보된 것만 보드에 노출한다.
  const actionEvidence = EVIDENCE.filter(
    (e) => e.revealTiming === "action_triggered" && collectedIds.has(e.id)
  );
  const available = [...roundEvidence, ...actionEvidence];
  const physical = available.filter((e) => e.category === "physical");
  const statements = available.filter((e) => e.category === "statement");

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-3 font-semibold text-neutral-200">
        조사 모드 <span className="text-xs font-normal text-neutral-500">— 물증을 클릭해 확보하세요</span>
      </h2>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {physical.map((e) => {
          const locked = Boolean(e.requiresEvidenceId && !collectedIds.has(e.requiresEvidenceId));
          const collected = collectedIds.has(e.id);
          return (
            <button
              key={e.id}
              disabled={locked || collected}
              onClick={() => onCollect(e.id)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                collected
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-300"
                  : locked
                    ? "cursor-not-allowed border-neutral-800 bg-neutral-950/40 text-neutral-600"
                    : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-blue-600 hover:bg-neutral-900"
              }`}
            >
              <div className="font-medium">
                {collected ? "✓ " : locked ? "🔒 " : ""}
                {e.name}
              </div>
              {(collected || !locked) && (
                <div className="mt-0.5 text-xs text-neutral-400">{e.revealedFact}</div>
              )}
              {locked && (
                <div className="mt-0.5 text-xs text-neutral-600">다른 물증을 먼저 확보하세요</div>
              )}
            </button>
          );
        })}
      </div>

      {statements.length > 0 && (
        <div className="mt-4">
          <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            심문으로 파악 가능한 진술
          </h3>
          <ul className="space-y-1">
            {statements.map((e) => (
              <li key={e.id} className="text-xs text-neutral-400">
                · {e.name} — {e.revealedFact}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
