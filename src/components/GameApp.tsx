"use client";

import { useEffect, useState } from "react";
import type { CharacterId } from "@/lib/game-data/types";
import { getAvailableEvidenceForRound, getEvidenceById } from "@/lib/game-data/evidence";
import type {
  AdHocEvidenceCard,
  ChatMessage,
  PlayerCharacterView,
  GamePhase,
  AccuseResult,
} from "@/lib/game-client-types";
import { saveGame, loadGame, clearGame, type SavedGameState } from "@/lib/gameSave";
import IntroScreen from "./IntroScreen";
import CastingScreen from "./CastingScreen";
import RoundTransitionScreen from "./RoundTransitionScreen";
import InvestigationBoard from "./InvestigationBoard";
import InterrogationChat from "./InterrogationChat";
import AccusationScreen from "./AccusationScreen";
import ResultScreen from "./ResultScreen";
import NotesPanel from "./NotesPanel";

const TOTAL_ROUNDS = 3;

// actor-prompt.ts의 PRESSURE_LABEL과 반드시 같은 문자열을 유지해야 한다 — 모델이
// [모드: 동요]로 응답한 걸 그대로 감지해 탭에 인내심 경고 배지를 띄우는 용도.
// (Phase 30 — 사용자 피드백: 인내심 시스템이 있다는 걸 플레이어가 알 방법이 없었다.
// 진범/무고자 모두 같은 라벨을 쓰므로 이 배지 자체는 범인을 암시하지 않는다.)
const PRESSURE_MODE_LABEL = "동요";

export default function GameApp() {
  const [introSeen, setIntroSeen] = useState(false);

  const [phase, setPhase] = useState<GamePhase>("loading");
  const [castingError, setCastingError] = useState<string | null>(null);
  const [castingToken, setCastingToken] = useState<string | null>(null);
  const [characters, setCharacters] = useState<PlayerCharacterView[]>([]);

  const [round, setRound] = useState(1);
  const [activeCharacterId, setActiveCharacterId] = useState<CharacterId | null>(null);
  const [conversations, setConversations] = useState<Record<string, ChatMessage[]>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});
  const [errorMap, setErrorMap] = useState<Record<string, string | null>>({});
  const [lockedCharacters, setLockedCharacters] = useState<Set<string>>(new Set());
  const [collectedEvidenceIds, setCollectedEvidenceIds] = useState<Set<string>>(new Set());
  const [adHocEvidence, setAdHocEvidence] = useState<AdHocEvidenceCard[]>([]);
  // 효율 보너스가 시간 기반으로 바뀌며(Phase 30) 조사 시작 시각을 잰다 — 1라운드
  // 진입(startInvestigation) 시점에 채워지고, 최종 지목 때 이 시각부터 경과한 시간을 잰다.
  const [investigationStartedAt, setInvestigationStartedAt] = useState<number | null>(null);
  const [notes, setNotes] = useState("");

  // 라운드 전환 화면 — 라운드가 바뀌는 시점을 명확히 보여주고, round-review로
  // 새로 확보된 물증을 여기서 한 번에 공개한다.
  const [transitionScreen, setTransitionScreen] = useState<{
    round: number;
    isFirst: boolean;
    newEvidenceNames: string[];
  } | null>(null);
  const [nextRoundLoading, setNextRoundLoading] = useState(false);
  const [lateRoundItemNames, setLateRoundItemNames] = useState<string[]>([]);

  const [accuseLoading, setAccuseLoading] = useState(false);
  const [accuseError, setAccuseError] = useState<string | null>(null);
  const [result, setResult] = useState<AccuseResult | null>(null);
  const [accusedCharacterId, setAccusedCharacterId] = useState<CharacterId | null>(null);

  // 이어하기 — 로컬 저장된 게임이 있으면 새 캐스팅을 부르기 전에 먼저 물어본다.
  const [resumeChoicePending, setResumeChoicePending] = useState(true);
  const [resumeCandidate, setResumeCandidate] = useState<SavedGameState | null>(null);

  useEffect(() => {
    const saved = loadGame();
    if (saved && (saved.phase === "round" || saved.phase === "accusation")) {
      setResumeCandidate(saved);
    } else {
      setResumeChoicePending(false);
    }
  }, []);

  function resumeSavedGame() {
    if (!resumeCandidate) return;
    setCastingToken(resumeCandidate.castingToken);
    setCharacters(resumeCandidate.characters);
    setRound(resumeCandidate.round);
    setActiveCharacterId(resumeCandidate.activeCharacterId);
    setConversations(resumeCandidate.conversations);
    setLockedCharacters(new Set(resumeCandidate.lockedCharacters));
    setCollectedEvidenceIds(new Set(resumeCandidate.collectedEvidenceIds));
    setAdHocEvidence(resumeCandidate.adHocEvidence ?? []);
    setInvestigationStartedAt(resumeCandidate.investigationStartedAt ?? Date.now());
    setNotes(resumeCandidate.notes);
    setPhase(resumeCandidate.phase);
    setIntroSeen(true);
    setResumeCandidate(null);
    setResumeChoicePending(false);
  }

  function startFreshGame() {
    clearGame();
    setResumeCandidate(null);
    setResumeChoicePending(false);
  }

  // 게임 시작 시 캐스팅 랜덤 배정 (인트로 화면과 별개로 백그라운드에서 미리 불러온다)
  // 이어하기 여부가 결정되기 전에는(resumeChoicePending) 새 캐스팅을 부르지 않는다.
  useEffect(() => {
    if (resumeChoicePending) return;
    if (castingToken) return; // 이어하기로 이미 캐스팅이 채워진 경우 재요청하지 않는다.
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/casting", { method: "POST" });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "캐스팅 실패");
        if (cancelled) return;
        setCharacters(data.characters);
        setCastingToken(data.castingToken);
        setPhase("casting");
      } catch (err) {
        if (!cancelled) {
          setCastingError(err instanceof Error ? err.message : "캐스팅 중 오류가 발생했습니다.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [resumeChoicePending, castingToken]);

  // 라운드/심문 진행 중에는 매 변경마다 로컬에 자동 저장한다.
  useEffect(() => {
    if (phase !== "round" && phase !== "accusation" && phase !== "round-transition") return;
    if (!castingToken || investigationStartedAt === null) return;
    saveGame({
      phase,
      castingToken,
      characters,
      round,
      activeCharacterId,
      conversations,
      lockedCharacters: Array.from(lockedCharacters),
      collectedEvidenceIds: Array.from(collectedEvidenceIds),
      adHocEvidence,
      investigationStartedAt,
      notes,
      savedAt: Date.now(),
    });
  }, [
    phase,
    castingToken,
    characters,
    round,
    activeCharacterId,
    conversations,
    lockedCharacters,
    collectedEvidenceIds,
    adHocEvidence,
    investigationStartedAt,
    notes,
  ]);

  // 게임이 끝나면(결과 화면 도달) 저장된 이어하기 데이터를 지운다 — 끝난 게임을 다시
  // "이어하기"로 제안하지 않기 위함.
  useEffect(() => {
    if (phase === "result") clearGame();
  }, [phase]);

  // 라운드가 바뀔 때마다 진술 증거(클릭 불필요)는 자동으로 확보 처리
  useEffect(() => {
    if (phase !== "round") return;
    const autoIds = getAvailableEvidenceForRound(round)
      .filter((e) => e.category === "statement")
      .map((e) => e.id);
    if (autoIds.length === 0) return;
    setCollectedEvidenceIds((prev) => {
      const next = new Set(prev);
      autoIds.forEach((id) => next.add(id));
      return next;
    });
  }, [phase, round]);

  function startInvestigation() {
    setActiveCharacterId(characters[0]?.characterId ?? null);
    setInvestigationStartedAt(Date.now());
    setTransitionScreen({ round: 1, isFirst: true, newEvidenceNames: [] });
    setPhase("round-transition");
  }

  function continueFromTransition() {
    if (!transitionScreen) return;
    setRound(transitionScreen.round);
    setTransitionScreen(null);
    setPhase("round");
  }

  function handleCollectEvidence(evidenceId: string) {
    setCollectedEvidenceIds((prev) => new Set(prev).add(evidenceId));
  }

  function handleInputChange(characterId: string, value: string) {
    setInputs((prev) => ({ ...prev, [characterId]: value }));
  }

  async function handleSend(characterId: CharacterId) {
    const userMessage = (inputs[characterId] ?? "").trim();
    if (!userMessage || loadingMap[characterId] || !castingToken || lockedCharacters.has(characterId))
      return;

    setInputs((prev) => ({ ...prev, [characterId]: "" }));
    setErrorMap((prev) => ({ ...prev, [characterId]: null }));
    const history = conversations[characterId] ?? [];
    const nextHistory: ChatMessage[] = [...history, { role: "user", content: userMessage }];
    setConversations((prev) => ({ ...prev, [characterId]: nextHistory }));
    setLoadingMap((prev) => ({ ...prev, [characterId]: true }));

    try {
      const res = await fetch("/api/interrogate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          characterId,
          castingToken,
          conversationHistory: history.map((m) => ({ role: m.role, content: m.content })),
          userMessage,
          round,
          collectedEvidenceIds: Array.from(collectedEvidenceIds),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `요청 실패 (HTTP ${res.status})`);

      setConversations((prev) => ({
        ...prev,
        [characterId]: [...nextHistory, { role: "assistant", content: data.text, mode: data.mode }],
      }));

      if (data.locked) {
        setLockedCharacters((prev) => new Set(prev).add(characterId));
      }
    } catch (err) {
      setErrorMap((prev) => ({
        ...prev,
        [characterId]: err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.",
      }));
    } finally {
      setLoadingMap((prev) => ({ ...prev, [characterId]: false }));
    }
  }

  /**
   * "다음 라운드"/"최종 지목으로" 클릭 핸들러 — 방금 끝난 라운드의 대화 전체를
   * /api/round-review로 검토해 소지품 요청 결과(사전 등록 물증 + 임의 물증)를 뽑는다.
   * - 1~2라운드 종료: 다음 라운드 조사모드에 즉시 반영하고 전환 화면에 새 증거를 보여준다.
   * - 3라운드(마지막) 종료: 다음 라운드 조사모드 자체가 없어 collectedEvidenceIds에는
   *   반영하지 않는다(점수에 영향 없음 — "제때 조사 못하면 놓친 것"이라는 의도적 설계,
   *   actor-prompt.ts 이력 9번 참고). 대신 결과 화면에서 "이건 너무 늦게 요청했다"는
   *   피드백으로 보여주기 위해 lateRoundItemNames에 따로 담아둔다(사용자 제안).
   */
  async function advanceRound() {
    const isFinalRound = round >= TOTAL_ROUNDS;
    setNextRoundLoading(true);
    const newEvidenceNames: string[] = [];
    try {
      const conversationsByCharacter = Object.fromEntries(
        Object.entries(conversations).map(([id, msgs]) => [
          id,
          msgs.map((m) => ({ role: m.role, content: m.content })),
        ])
      );
      const res = await fetch("/api/round-review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          castingToken,
          conversationsByCharacter,
          collectedEvidenceIds: Array.from(collectedEvidenceIds),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const unlockedIds: string[] = Array.isArray(data.unlockedEvidenceIds)
          ? data.unlockedEvidenceIds
          : [];
        const newAdHoc: AdHocEvidenceCard[] = Array.isArray(data.adHocEvidence)
          ? data.adHocEvidence
          : [];
        const foundNames = [
          ...unlockedIds.map((id) => getEvidenceById(id)?.name ?? id),
          ...newAdHoc.map((e) => e.name),
        ];

        if (isFinalRound) {
          setLateRoundItemNames(foundNames);
        } else {
          if (unlockedIds.length > 0) {
            setCollectedEvidenceIds((prev) => {
              const next = new Set(prev);
              unlockedIds.forEach((id) => next.add(id));
              return next;
            });
          }
          if (newAdHoc.length > 0) {
            setAdHocEvidence((prev) => [
              ...prev,
              ...newAdHoc.filter((e) => !prev.some((p) => p.id === e.id)),
            ]);
            setCollectedEvidenceIds((prev) => {
              const next = new Set(prev);
              newAdHoc.forEach((e) => next.add(e.id));
              return next;
            });
          }
          newEvidenceNames.push(...foundNames);
        }
      }
    } catch {
      // 리뷰 콜이 실패해도 진행 자체는 막지 않는다 — 이번 라운드에서 놓친 소지품
      // 요청은 그냥 반영되지 않은 채로 다음 단계로 넘어간다.
    } finally {
      setNextRoundLoading(false);
    }

    if (isFinalRound) {
      setPhase("accusation");
    } else {
      setTransitionScreen({ round: round + 1, isFirst: false, newEvidenceNames });
      setPhase("round-transition");
    }
  }

  async function handleAccuse(characterId: CharacterId) {
    if (!castingToken) return;
    setAccuseLoading(true);
    setAccuseError(null);
    try {
      const conversationsByCharacter = Object.fromEntries(
        Object.entries(conversations).map(([id, msgs]) => [
          id,
          msgs.map((m) => ({ role: m.role, content: m.content })),
        ])
      );

      const totalElapsedSeconds = investigationStartedAt
        ? Math.round((Date.now() - investigationStartedAt) / 1000)
        : 0;

      const res = await fetch("/api/accuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accusedCharacterId: characterId,
          castingToken,
          revealedEvidenceIds: Array.from(collectedEvidenceIds),
          totalElapsedSeconds,
          conversationsByCharacter,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "채점 실패");
      setAccusedCharacterId(characterId);
      setResult(data);
      setPhase("result");
    } catch (err) {
      setAccuseError(err instanceof Error ? err.message : "채점 중 오류가 발생했습니다.");
    } finally {
      setAccuseLoading(false);
    }
  }

  if (resumeCandidate) {
    return (
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col items-center justify-center gap-6 px-4 py-16 text-center">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            NAN 2026 · 머더 미스터리
          </p>
          <h1 className="mt-2 text-lg font-bold">진행 중이던 게임이 있습니다</h1>
          <p className="mt-2 text-sm text-neutral-400">
            라운드 {resumeCandidate.round} / {TOTAL_ROUNDS}까지 진행된 기록이 이 브라우저에
            저장되어 있습니다. 이어서 하시겠습니까?
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={resumeSavedGame}
            className="rounded-md bg-blue-700 px-5 py-2.5 text-sm font-medium hover:bg-blue-600 transition-colors"
          >
            이어하기
          </button>
          <button
            onClick={startFreshGame}
            className="rounded-md border border-neutral-700 px-5 py-2.5 text-sm font-medium text-neutral-300 hover:border-neutral-500 transition-colors"
          >
            새로 시작
          </button>
        </div>
      </div>
    );
  }

  if (!introSeen) {
    return <IntroScreen onContinue={() => setIntroSeen(true)} />;
  }

  if (phase === "loading" || phase === "casting") {
    return (
      <CastingScreen
        loading={phase === "loading"}
        error={castingError}
        characters={characters}
        onStart={startInvestigation}
      />
    );
  }

  if (phase === "round-transition" && transitionScreen) {
    return (
      <RoundTransitionScreen
        round={transitionScreen.round}
        totalRounds={TOTAL_ROUNDS}
        isFirst={transitionScreen.isFirst}
        newEvidenceNames={transitionScreen.newEvidenceNames}
        onContinue={continueFromTransition}
      />
    );
  }

  if (phase === "accusation") {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-4 px-4 py-12">
        <AccusationScreen characters={characters} loading={accuseLoading} onAccuse={handleAccuse} />
        {accuseError && (
          <p className="text-center text-sm text-rose-400">{accuseError}</p>
        )}
      </div>
    );
  }

  if (phase === "result" && result && accusedCharacterId) {
    return (
      <ResultScreen
        result={result}
        accusedCharacterId={accusedCharacterId}
        lateRoundItemNames={lateRoundItemNames}
      />
    );
  }

  const activeCharacter = characters.find((c) => c.characterId === activeCharacterId);
  const activeLocked = activeCharacter ? lockedCharacters.has(activeCharacter.characterId) : false;

  /** 해당 캐릭터가 잠기지 않은 상태에서 가장 최근 응답이 "동요" 모드였는지 — 인내심 경고 배지용. */
  function isNearPatienceLimit(characterId: string): boolean {
    if (lockedCharacters.has(characterId)) return false;
    const history = conversations[characterId];
    if (!history || history.length === 0) return false;
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const msg = history[i];
      if (msg.role === "assistant") return msg.mode === PRESSURE_MODE_LABEL;
    }
    return false;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            NAN 2026 · 머더 미스터리
          </p>
          <h1 className="text-xl font-bold">라운드 {round} / {TOTAL_ROUNDS}</h1>
        </div>
        <button
          onClick={advanceRound}
          disabled={nextRoundLoading}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {nextRoundLoading
            ? "증거 정리 중..."
            : round < TOTAL_ROUNDS
              ? "다음 라운드"
              : "최종 지목으로"}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <InvestigationBoard
            round={round}
            collectedIds={collectedEvidenceIds}
            adHocEvidence={adHocEvidence}
            onCollect={handleCollectEvidence}
          />
          <NotesPanel value={notes} onChange={setNotes} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {characters.map((c) => {
              const nearLimit = isNearPatienceLimit(c.characterId);
              return (
                <button
                  key={c.characterId}
                  onClick={() => setActiveCharacterId(c.characterId)}
                  title={nearLimit ? "지금 많이 동요하고 있습니다 — 인내심이 얼마 남지 않았을 수 있습니다" : undefined}
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    activeCharacterId === c.characterId
                      ? "border-blue-600 bg-blue-950/40 text-blue-200"
                      : nearLimit
                        ? "border-amber-700 bg-amber-950/20 text-amber-200 hover:border-amber-500"
                        : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:border-neutral-600"
                  } ${lockedCharacters.has(c.characterId) ? "opacity-60" : ""}`}
                >
                  {c.displayName}
                  {lockedCharacters.has(c.characterId) && " 🔒"}
                  {!lockedCharacters.has(c.characterId) && nearLimit && " ⚠️"}
                </button>
              );
            })}
          </div>

          {activeCharacter && (
            <InterrogationChat
              characterId={activeCharacter.characterId}
              displayName={activeCharacter.displayName}
              roleTitle={activeCharacter.roleTitle}
              messages={conversations[activeCharacter.characterId] ?? []}
              loading={Boolean(loadingMap[activeCharacter.characterId])}
              error={errorMap[activeCharacter.characterId] ?? null}
              input={inputs[activeCharacter.characterId] ?? ""}
              locked={activeLocked}
              onInputChange={(value) => handleInputChange(activeCharacter.characterId, value)}
              onSend={() => handleSend(activeCharacter.characterId)}
            />
          )}
        </div>
      </div>
    </main>
  );
}
