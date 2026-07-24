"use client";

import type { AccuseResult } from "@/lib/game-client-types";

interface ResultScreenProps {
  result: AccuseResult;
  accusedCharacterId: string;
  /**
   * 마지막 라운드(3라운드)에 요청한 소지품 이름 목록 — 다음 라운드 조사모드가 없어
   * 반영되지 못했으므로 점수에는 포함되지 않는다. 사용자 제안: "이건 좀 더 빨리
   * 요청했어야 했는데" 하는 아쉬움을 결과 화면에서 알려주면 재플레이 시 학습 효과가
   * 있을 것 같다는 아이디어 — GameApp.tsx의 advanceRound에서 3라운드 종료 시점에만
   * round-review를 collectedEvidenceIds에 반영하지 않고 여기로 따로 넘긴다.
   */
  lateRoundItemNames: string[];
}

const GRADE_COLOR: Record<string, string> = {
  S: "text-amber-300",
  A: "text-emerald-300",
  B: "text-blue-300",
  C: "text-neutral-300",
};

export default function ResultScreen({
  result,
  accusedCharacterId,
  lateRoundItemNames,
}: ResultScreenProps) {
  const accused = result.characters.find((c) => c.characterId === accusedCharacterId);
  const culprit = result.characters.find((c) => c.characterId === result.culpritCharacterId);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-500">결과</p>
        <h1 className={`text-3xl font-bold ${result.isCorrect ? "text-emerald-400" : "text-rose-400"}`}>
          {result.isCorrect ? "정답입니다" : "오답입니다"}
        </h1>
        <p className="text-sm text-neutral-400">
          지목: {accused?.displayName ?? accusedCharacterId} · 진범: {culprit?.displayName}
        </p>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-neutral-200">점수</h2>
          <span className={`text-2xl font-bold ${GRADE_COLOR[result.grade]}`}>{result.grade}</span>
        </div>
        <p className="mt-1 text-3xl font-bold text-neutral-100">
          {result.score.total}
          <span className="text-base font-normal text-neutral-500"> / {result.score.maxTotal}</span>
        </p>
        <dl className="mt-3 grid grid-cols-2 gap-y-1 text-xs text-neutral-400">
          <dt>기본물증</dt>
          <dd className="text-right text-neutral-200">{result.score.basicEvidencePoints}점</dd>
          <dt>연계물증</dt>
          <dd className="text-right text-neutral-200">{result.score.linkedEvidencePoints}점</dd>
          <dt>진술증거</dt>
          <dd className="text-right text-neutral-200">{result.score.statementEvidencePoints}점</dd>
          <dt>동기 파악</dt>
          <dd className="text-right text-neutral-200">{result.score.motivePoints}점</dd>
          <dt>붕괴 보너스</dt>
          <dd className="text-right text-neutral-200">{result.score.breakdownBonus}점</dd>
          <dt>심문 효율</dt>
          <dd className="text-right text-neutral-200">{result.score.efficiencyBonus}점</dd>
        </dl>
      </section>

      {lateRoundItemNames.length > 0 && (
        <section className="rounded-lg border border-amber-900 bg-amber-950/20 p-4">
          <h2 className="mb-1 font-semibold text-amber-300">마지막 라운드에 요청한 물품</h2>
          <p className="mb-2 text-xs text-neutral-400">
            아래 물품은 3라운드에 요청되어 조사에 반영할 다음 라운드가 없었습니다. 점수에는
            포함되지 않았습니다 — 더 일찍 확인했다면 도움이 됐을 수도 있습니다.
          </p>
          <ul className="space-y-1 text-sm text-neutral-200">
            {lateRoundItemNames.map((name, i) => (
              <li key={i}>· {name}</li>
            ))}
          </ul>
        </section>
      )}

      {result.confessionScene && (
        <section className="rounded-lg border border-rose-900 bg-rose-950/20 p-4">
          <h2 className="mb-2 font-semibold text-rose-300">
            {culprit?.displayName ?? "진범"}의 자백
          </h2>
          <p className="whitespace-pre-wrap text-sm text-neutral-200">{result.confessionScene}</p>
        </section>
      )}

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-3 font-semibold text-neutral-200">전체 진실 공개</h2>
        <div className="space-y-3">
          {result.characters.map((c) => (
            <div
              key={c.characterId}
              className={`rounded-md border p-3 ${
                c.isCulprit ? "border-rose-800 bg-rose-950/30" : "border-neutral-800 bg-neutral-950"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium text-neutral-100">
                  {c.displayName} <span className="text-xs text-neutral-500">({c.roleTitle})</span>
                </span>
                {c.isCulprit && (
                  <span className="rounded bg-rose-900/60 px-2 py-0.5 text-xs font-medium text-rose-300">
                    진범
                  </span>
                )}
              </div>
              <p className="mt-1 text-sm text-neutral-400">{c.motiveFull}</p>
              {c.personaTag && (
                <p className="mt-1 text-xs text-neutral-500">
                  성향(최초 공개): {c.personaTag} ({c.mbtiType})
                </p>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
