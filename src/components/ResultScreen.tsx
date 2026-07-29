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
  /** 실전 리뷰 피드백: 결과 화면에 재도전 수단이 전혀 없었다 — 캐주얼 파티 게임에서
   * 치명적인 누락이라는 지적을 받아 추가했다. */
  onRestart: () => void;
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
  onRestart,
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
          <dt>증거 수집</dt>
          <dd className="text-right text-neutral-200">
            {result.score.evidenceFoundCount}/{result.score.evidenceTotalCount}개 ·{" "}
            {result.score.evidenceCollectionPoints}점
          </dd>
          <dt>동기 파악</dt>
          <dd className="text-right text-neutral-200">{result.score.motivePoints}점</dd>
          <dt>심문 효율(소요 시간)</dt>
          <dd className="text-right text-neutral-200">{result.score.efficiencyBonus}점</dd>
        </dl>
        {/* Phase 32 — 채점 기준은 이제 사건 브리핑 화면에서 게임 시작 전에 미리 공개된다
            (CastingScreen). 여기서는 실제 집계 결과만 다시 확인시켜준다. */}
        <p className="mt-3 text-[11px] leading-relaxed text-neutral-500">
          증거 수집은 확보한 증거 개수당 5점 · 동기 파악은 배역당 10점 · 심문 효율은 게임
          시작부터 최종 지목까지 걸린 시간이 짧을수록 최대 20점(15분 이내 만점, 이후
          구간별로 감점).
        </p>
      </section>

      {/* Phase 39 — 심문 중엔 아무도 무너지지 않고 최종 지목은 순수 정황 추리로
          이루어지는 새 설계라, 정답/오답과 무관하게 결정적 연결고리를 항상 여기서
          짚어준다(사용자 지시) — 트릭을 못 찾은 플레이어도 "돌아보니 다 맞아떨어졌다"고
          느끼도록. 이현우 개인 디브리핑(아래 뒤풀이 섹션)의 인게임 반응과는 별개로,
          여기는 게임 마스터 시점의 객관적 해설이다. */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
        <h2 className="mb-2 font-semibold text-neutral-200">사건의 결정적 연결고리</h2>
        <p className="text-sm leading-relaxed text-neutral-300">
          이현우의 숙소(302호)는 박서연의 숙소(202호) 바로 위층이었다. 사건 당일 밤,
          산책로에서 흉기를 휘두른 이현우는 자기 방으로 돌아가 흔적을 지운 뒤, 밤이
          깊어 박서연 방이 잠잠해지자 베란다에서 끈으로 흉기 손잡이의
          구멍을 꿰어 아래층 박서연의 베란다로 내려놓았다 — 바닥에 닿자 한쪽 끝만 당겨
          끈을 회수해, 흉기만 아래층에 남기고 자신은 흔적 없이 빠져나갔다. 숙소 배정표의
          호수, 베란다 난간에 남은 마찰 흔적, 그리고 이현우의 가방 속 등산장비(로프·
          카라비너) — 이 세 조각을 실제로 연결해서 캐물었는지가 이번 사건의 진짜 관건이었다.
        </p>
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

      <section className="space-y-3">
        <h2 className="font-semibold text-neutral-200">뒤풀이 — AI 친구들의 소감</h2>
        {/* 지목한 배역이 먼저 나오도록 API가 이미 순서를 정렬해서 내려준다(accuse/route.ts) —
            오답이었을 경우 "내가 지목한 사람의 해명 → 나머지 → 진짜 범인의 자백" 순서가
            자연스러운 반전 구조를 만든다. */}
        {result.characters.map((c) => (
          <div
            key={c.characterId}
            className={`rounded-lg border p-4 ${
              c.isCulprit ? "border-rose-800 bg-rose-950/20" : "border-neutral-800 bg-neutral-900/40"
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
            {c.friendName && (
              <p className="mt-1 text-xs text-neutral-500">
                이 역할을 연기한 AI 친구: {c.friendName} ({c.mbtiType}) — {c.personaTag}
              </p>
            )}
            <p className="mt-2 text-xs text-neutral-500">동기: {c.motiveFull}</p>
            {c.debrief && (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
                {c.debrief}
              </p>
            )}
          </div>
        ))}
      </section>

      <div className="flex justify-center pt-2">
        <button
          onClick={onRestart}
          className="rounded-md bg-blue-700 px-6 py-2.5 text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          다시 도전하기
        </button>
      </div>
    </div>
  );
}
