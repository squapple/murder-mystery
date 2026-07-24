"use client";

interface RoundTransitionScreenProps {
  round: number;
  totalRounds: number;
  isFirst: boolean;
  /** 라운드 리뷰(round-review)로 새로 확보된 물증 이름 목록 — 없으면 표시 생략 */
  newEvidenceNames: string[];
  onContinue: () => void;
}

/**
 * 라운드 전환 화면 — 사용자 피드백: "화면의 큰 변화가 없어서 라운드가 바뀐 건지
 * 애매했다." 라운드가 바뀌는 순간을 명확한 화면 전환으로 표시하고, 그 라운드
 * 동안 라운드-종료 리뷰(round-review)로 새로 확보된 물증을 여기서 한 번에
 * 보여준다 — GameApp.tsx의 advanceRound가 그 타이밍에 맞춰 데이터를 채워 넘긴다.
 */
export default function RoundTransitionScreen({
  round,
  totalRounds,
  isFirst,
  newEvidenceNames,
  onContinue,
}: RoundTransitionScreenProps) {
  const isFinal = round === totalRounds;
  const message = isFirst
    ? "주어진 정보를 바탕으로 심문하세요."
    : isFinal
      ? "지금까지 수집한 증거를 바탕으로 최종 심문을 진행하세요."
      : "확보한 증거품과 새로 공개된 정보를 바탕으로 심문하세요.";

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
      {isFirst && (
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          총 {totalRounds}라운드로 진행됩니다
        </p>
      )}
      <div>
        <h1 className="text-2xl font-bold">
          라운드 {round} / {totalRounds}
          {isFinal && <span className="ml-2 text-base font-medium text-rose-400">(마지막 라운드)</span>}
        </h1>
        <p className="mt-3 text-sm text-neutral-400">{message}</p>
      </div>

      {newEvidenceNames.length > 0 && (
        <div className="w-full rounded-lg border border-emerald-800 bg-emerald-950/30 p-4 text-left">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-emerald-400">
            새로 확보된 증거
          </p>
          <ul className="space-y-1 text-sm text-emerald-200">
            {newEvidenceNames.map((name, i) => (
              <li key={i}>· {name}</li>
            ))}
          </ul>
        </div>
      )}

      <button
        onClick={onContinue}
        className="rounded-md bg-blue-700 px-6 py-3 text-sm font-medium transition-colors hover:bg-blue-600"
      >
        {isFirst ? "1라운드 시작" : "계속하기"}
      </button>
    </div>
  );
}
