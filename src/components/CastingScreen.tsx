"use client";

import type { PlayerCharacterView } from "@/lib/game-client-types";
import { PUBLIC_CASE_BRIEF } from "@/lib/game-data/truth-bible";
import { SCORING_SUMMARY } from "@/lib/scoring";

interface CastingScreenProps {
  loading: boolean;
  error: string | null;
  characters: PlayerCharacterView[];
  onStart: () => void;
}

export default function CastingScreen({
  loading,
  error,
  characters,
  onStart,
}: CastingScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          NAN 2026 · 머더 미스터리
        </p>
        <h1 className="text-2xl font-bold">사건 브리핑</h1>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-200">사건 개요</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-neutral-400">
          <dt>피해자</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.victim}</dd>
          <dt>장소</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.location}</dd>
          <dt>사망 추정 시각</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.timeOfDeath}</dd>
          <dt>발견 시각</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.discoveredAt}</dd>
          <dt>배경</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.background}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
        <h2 className="mb-3 font-semibold text-neutral-200">용의자 3인</h2>
        {loading && <p className="text-neutral-500">캐스팅 중...</p>}
        {error && <p className="text-rose-400">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {characters.map((c) => (
            <div key={c.characterId} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold">
                {c.displayName[0]}
              </div>
              <div className="mt-2 font-medium text-neutral-100">{c.displayName}</div>
              <div className="text-xs text-neutral-500">{c.roleTitle}</div>
              <div className="mt-1 text-xs text-neutral-400">{c.motivePublic}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Phase 32 — 실전 리뷰 피드백: 채점 기준(특히 심문 효율의 시간 제한)이 게임
          중에는 전혀 안내되지 않다가 결과 화면에서야 처음 공개돼 "숨겨진 타임어택"처럼
          느껴진다는 지적. 진범 특정만 하면 끝나버리는 걸 막으려고 점수 시스템을 넣은
          것이었으니, 오히려 시작 전에 서브퀘스트처럼 미리 밝히는 게 취지에 맞다는
          판단(사용자)으로 여기 추가했다.
          Phase 58 — 채점 체계 전면 개편에 맞춰 문구 갱신. "핵심 단서 확보"가 특정
          인물에게 쏠려 있다는 사실은 여전히 밝히지 않는다(스포일러 방지) — 몇 개인지
          숫자만 공개하는 기존 원칙을 그대로 유지. 오답 시 등급/점수 상한도 새로
          추가했다 — "숨겨진 페널티" 원칙 위반을 막기 위해 이것도 사전 공개한다.
          Phase 59 — "심문 효율"을 "심문 강도"로 개명. 낭비 없이 던질수록(적을수록)
          유리하던 이전 방향에서 인내심을 실제로 얼마나 건드렸는지(많을수록 유리)로
          뒤집혀, "효율"이라는 이름이 더 이상 안 맞았다 — 심문을 아예 안 하면 0점이
          되므로 하한 보장 문구도 뺐다.
          Phase 61 — "수사 성실도" 문구가 "가방·신발·휴대폰을 확인하라"고 구체적
          방법까지 알려줘 스포일러라는 지적(사용자) — 소지품 요청은 UI 버튼 없이
          플레이어가 스스로 떠올려야 재미있는 자유 텍스트 메커니즘(Phase 39)인데,
          채점 기준에서 정확한 품목을 나열하면 그 발견의 재미가 죽는다. "소지품을
          확인할 때마다"로 일반화해 방법은 숨기고 존재(개수)만 남겼다 — "핵심 단서
          확보"가 대상 인물을 숨기는 것과 같은 원칙.
          Phase 63 — "직접 획득한 유의미한 증거물의 개수에 따라"로 재수정(사용자).
          "유의미한"은 "핵심 단서"급 중요도가 아니라 "시스템에 정의된 실제 증거
          항목이냐"는 뜻이다(예: "안경 보여주세요"처럼 requestableItems에 없는
          임의의 물건을 요청하면 아무 증거도 해금되지 않아 점수에 안 잡힌다 — 이런
          "무의미한" 시도와 구분하기 위한 단어 선택이라고 사용자가 명확히 함). */}
      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-200">채점 기준 (100점 만점)</h2>
        <ul className="space-y-1 text-xs text-neutral-400">
          <li>
            · 수사 성실도 — 직접 획득한 유의미한 증거물의 개수에 따라 점수가 쌓입니다 (전체{" "}
            {SCORING_SUMMARY.personalItemTotalCount}개, 개당 {SCORING_SUMMARY.pointsPerPersonalItem}점)
          </li>
          <li>
            · 핵심 단서 확보 — 사건 해결에 실제로 기여하는 결정적인 단서를 찾아내면 더 큰
            점수가 쌓입니다 (전체 {SCORING_SUMMARY.keyClueTotalCount}개, 개당{" "}
            {SCORING_SUMMARY.pointsPerKeyClue}점)
          </li>
          <li>
            · 동기 파악 — 용의자별 동기를 밝혀낼 때마다 점수가 쌓입니다 (배역당{" "}
            {SCORING_SUMMARY.pointsPerMotive}점)
          </li>
          <li>
            · 심문 강도 — 용의자를 실제로 압박해 흔들리게 만들수록 점수가 쌓입니다 (최대{" "}
            {SCORING_SUMMARY.efficiencyBonusMax}점)
          </li>
          <li className="pt-1 text-amber-500/80">
            · 최종 지목이 오답이면 수사를 아무리 잘했어도 등급은{" "}
            {SCORING_SUMMARY.wrongAnswerGrade}, 점수는 {SCORING_SUMMARY.wrongAnswerScoreCap}점을
            넘지 않습니다.
          </li>
        </ul>
      </section>

      <p className="text-center text-xs text-neutral-500">
        날카로운 질문을 던져 용의자를 굴복시키세요.
      </p>

      <button
        onClick={onStart}
        disabled={loading || characters.length === 0}
        className="w-full rounded-md bg-blue-700 px-4 py-3 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
      >
        조사 시작
      </button>
    </div>
  );
}
