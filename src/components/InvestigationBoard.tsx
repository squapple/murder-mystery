"use client";

import { useState } from "react";
import { EVIDENCE, getAvailableEvidenceForRound, type EvidenceItem } from "@/lib/game-data/evidence";
import type { AdHocEvidenceCard } from "@/lib/game-client-types";

interface InvestigationBoardProps {
  round: number;
  collectedIds: Set<string>;
  /** 사전 등록되지 않은 임의의 소지품 요청 결과 카드("사건과 무관" 고정) */
  adHocEvidence: AdHocEvidenceCard[];
  onCollect: (evidenceId: string) => void;
}

export default function InvestigationBoard({
  round,
  collectedIds,
  adHocEvidence,
  onCollect,
}: InvestigationBoardProps) {
  const [selected, setSelected] = useState<EvidenceItem | null>(null);

  const roundEvidence = getAvailableEvidenceForRound(round);
  // action_triggered 증거(예: 신발 요청)는 라운드와 무관하게 심문 중 행동으로만
  // 해금된다 — 실제로 확보된 것만 보드에 노출한다.
  const actionEvidence = EVIDENCE.filter(
    (e) => e.revealTiming === "action_triggered" && collectedIds.has(e.id)
  );
  // 임의 소지품 요청 카드는 evidence.ts의 고정 목록에 없으므로 EvidenceItem 형태로
  // 변환해 같은 그리드에 얹는다 — 내용은 항상 "사건과 무관" 고정 문구.
  const adHocAsEvidence: EvidenceItem[] = adHocEvidence.map((e) => ({
    id: e.id,
    category: "physical",
    name: e.name,
    revealedFact: e.revealedFact,
    revealTiming: "action_triggered",
  }));
  const available = [...roundEvidence, ...actionEvidence, ...adHocAsEvidence];
  const physical = available.filter((e) => e.category === "physical");
  const statements = available.filter((e) => e.category === "statement");

  function handleCardClick(e: EvidenceItem, locked: boolean, collected: boolean) {
    if (locked) return;
    if (!collected) onCollect(e.id);
    setSelected(e);
  }

  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-1 font-semibold text-neutral-200">조사 모드</h2>
      <p className="mb-3 text-xs text-neutral-500">
        카드를 클릭하면 물증으로 확보되어 심문 중 근거로 제시할 수 있습니다. 확보된(✓) 카드를 다시
        클릭하면 상세 내용을 볼 수 있습니다.
      </p>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {physical.map((e) => {
          const locked = Boolean(e.requiresEvidenceId && !collectedIds.has(e.requiresEvidenceId));
          const collected = collectedIds.has(e.id);
          return (
            <button
              key={e.id}
              disabled={locked}
              onClick={() => handleCardClick(e, locked, collected)}
              className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                collected
                  ? "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:border-emerald-600"
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
              {!locked && (
                <div className="mt-1 text-[10px] text-neutral-500">
                  {collected ? "클릭해서 자세히 보기" : "클릭해서 확보하기"}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {statements.length > 0 && (
        <div className="mt-4">
          {/* 플레이어 피드백: "박서연 다툼 이유 — 박서연-김영훈 성과 갈등" 식으로
              사실 요약을 그대로 라벨로 노출하니 해설집을 보는 느낌이었다. 카드 제목을
              e.name(사건 핵심을 요약하는 메타 라벨) 대신, 다른 배역이 흘린 정보라는
              디제틱한 출처로만 통일해 스포일러성 라벨을 감춘다. */}
          <h3 className="mb-2 text-xs uppercase tracking-wide text-neutral-500">
            용의자 목록에 없는 다른 팀원의 증언
          </h3>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {statements.map((e) => (
              <button
                key={e.id}
                onClick={() => setSelected(e)}
                className="rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-left text-sm text-neutral-300 transition-colors hover:border-blue-600 hover:bg-neutral-900"
              >
                {e.revealedFact}
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => setSelected(null)}
        >
          <div
            className="w-full max-w-md rounded-lg border border-neutral-700 bg-neutral-900 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex items-start justify-between gap-3">
              <h3 className="font-semibold text-neutral-100">
                {selected.category === "statement" ? "용의자 목록에 없는 다른 팀원의 증언" : selected.name}
              </h3>
              <button
                onClick={() => setSelected(null)}
                className="text-neutral-500 hover:text-neutral-300"
                aria-label="닫기"
              >
                ✕
              </button>
            </div>
            <p className="text-sm leading-relaxed text-neutral-300 whitespace-pre-line">
              {selected.detail ?? selected.revealedFact}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
