"use client";

import { useState } from "react";
import { EVIDENCE, getAvailableEvidenceForRound, type EvidenceItem } from "@/lib/game-data/evidence";
import type { AdHocEvidenceCard } from "@/lib/game-client-types";

interface InvestigationBoardProps {
  round: number;
  collectedIds: Set<string>;
  /** Phase 36 — action_triggered 물증이 조사 모드에 "나타나는지" 여부. 심문 중
   * 요청으로 round-review가 해금하면 여기 채워진다 — 확보(collectedIds) 여부와는
   * 별개다. 실제 확보는 다른 카드와 마찬가지로 직접 클릭해야만 이루어진다. */
  unlockedActionIds: Set<string>;
  /** 사전 등록되지 않은 임의의 소지품 요청 결과 카드("사건과 무관" 고정) */
  adHocEvidence: AdHocEvidenceCard[];
  onCollect: (evidenceId: string) => void;
}

export default function InvestigationBoard({
  round,
  collectedIds,
  unlockedActionIds,
  adHocEvidence,
  onCollect,
}: InvestigationBoardProps) {
  const [selected, setSelected] = useState<EvidenceItem | null>(null);

  const roundEvidence = getAvailableEvidenceForRound(round);
  // action_triggered 증거(예: 가방 확인 요청)는 라운드와 무관하게 심문 중 행동으로만
  // 해금된다 — Phase 36: "해금됨"과 "확보됨"을 분리했다. 여기서는 보드에 카드가
  // 나타나는 시점만 결정하고, ✓ 확보는 renderCard의 클릭 로직이 collectedIds로
  // 별도 판단한다.
  const actionEvidence = EVIDENCE.filter(
    (e) => e.revealTiming === "action_triggered" && unlockedActionIds.has(e.id)
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

  function handleCardClick(e: EvidenceItem, collected: boolean) {
    if (!collected) onCollect(e.id);
    setSelected(e);
  }

  /** 물증/진술 공통 카드 렌더러 — Phase 35: 진술 증거도 물증과 동일하게 클릭해야
   * 확보(✓)되도록 통일했다(이전엔 진술 증거가 라운드 전환 시 자동 확보돼, 카드를
   * 클릭하는 행위 자체가 무의미했다는 지적을 반영). */
  function renderCard(e: EvidenceItem) {
    const collected = collectedIds.has(e.id);
    return (
      <button
        key={e.id}
        onClick={() => handleCardClick(e, collected)}
        className={`rounded-md border px-3 py-2 text-left text-sm transition-colors ${
          collected
            ? "border-emerald-800 bg-emerald-950/40 text-emerald-300 hover:border-emerald-600"
            : "border-neutral-700 bg-neutral-950 text-neutral-200 hover:border-blue-600 hover:bg-neutral-900"
        }`}
      >
        <div className="font-medium">
          {collected ? "✓ " : ""}
          {e.name}
        </div>
        <div className="mt-0.5 text-xs text-neutral-400">{e.revealedFact}</div>
        <div className="mt-1 text-[10px] text-neutral-500">
          {collected ? "클릭해서 자세히 보기" : "클릭해서 확보하기"}
        </div>
      </button>
    );
  }

  return (
    <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
      <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 xl:flex-1">
        <h2 className="mb-1 font-semibold text-neutral-200">조사 모드</h2>
        <p className="mb-3 text-xs text-neutral-500">
          카드를 클릭하면 물증으로 확보되어 심문 중 근거로 제시할 수 있습니다. 확보된(✓) 카드를 다시
          클릭하면 상세 내용을 볼 수 있습니다.
        </p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{physical.map(renderCard)}</div>
      </div>

      {statements.length > 0 && (
        // Phase 32 — 실전 리뷰 피드백: "확보된 카드를 클릭하라"는 안내문은 조사 모드
        // 섹션에만 있고, 이 섹션엔 클릭 가능하다는 안내 자체가 없어서 플레이어가 아예
        // 클릭해볼 생각을 못 했다는 지적. 조사 모드와 똑같이 독립된 박스 + 안내문을
        // 갖춘 별도 섹션으로 분리했다.
        // Phase 35 — 넓은 화면(xl 이상)에서는 조사 모드 옆에 나란히 배치하고, 좁은
        // 화면에서는 기존처럼 아래로 쌓이게 한다(사용자 요청).
        <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 xl:flex-1">
          <h2 className="mb-1 font-semibold text-neutral-200">다른 팀원의 증언</h2>
          <p className="mb-3 text-xs text-neutral-500">
            사건과 관련된 다른 팀원들의 증언입니다. 클릭하면 확보되어 심문 중 근거로 제시할 수
            있습니다.
          </p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{statements.map(renderCard)}</div>
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
              <h3 className="font-semibold text-neutral-100">{selected.name}</h3>
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
