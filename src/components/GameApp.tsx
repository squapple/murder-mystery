"use client";

import { useEffect, useState } from "react";
import type { CharacterId } from "@/lib/game-data/types";
import { getAvailableEvidenceForRound } from "@/lib/game-data/evidence";
import type {
  ChatMessage,
  PlayerCharacterView,
  GamePhase,
  AccuseResult,
} from "@/lib/game-client-types";
import { saveGame, loadGame, clearGame, type SavedGameState } from "@/lib/gameSave";
import IntroScreen from "./IntroScreen";
import CastingScreen from "./CastingScreen";
import InvestigationBoard from "./InvestigationBoard";
import InterrogationChat from "./InterrogationChat";
import AccusationScreen from "./AccusationScreen";
import ResultScreen from "./ResultScreen";
import NotesPanel from "./NotesPanel";

const TOTAL_ROUNDS = 3;

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
  const [totalQuestionChars, setTotalQuestionChars] = useState(0);
  const [notes, setNotes] = useState("");

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
    setTotalQuestionChars(resumeCandidate.totalQuestionChars);
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
    if (phase !== "round" && phase !== "accusation") return;
    if (!castingToken) return;
    saveGame({
      phase,
      castingToken,
      characters,
      round,
      activeCharacterId,
      conversations,
      lockedCharacters: Array.from(lockedCharacters),
      collectedEvidenceIds: Array.from(collectedEvidenceIds),
      totalQuestionChars,
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
    totalQuestionChars,
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
    setRound(1);
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
    setTotalQuestionChars((prev) => prev + userMessage.length);

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
      if (data.unlockedEvidenceId) {
        setCollectedEvidenceIds((prev) => new Set(prev).add(data.unlockedEvidenceId));
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

  function goNextRound() {
    if (round < TOTAL_ROUNDS) {
      setRound((r) => r + 1);
    } else {
      setPhase("accusation");
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

      const res = await fetch("/api/accuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accusedCharacterId: characterId,
          castingToken,
          revealedEvidenceIds: Array.from(collectedEvidenceIds),
          totalQuestionChars,
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
    return <ResultScreen result={result} accusedCharacterId={accusedCharacterId} />;
  }

  const activeCharacter = characters.find((c) => c.characterId === activeCharacterId);
  const activeLocked = activeCharacter ? lockedCharacters.has(activeCharacter.characterId) : false;

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
          onClick={goNextRound}
          className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium hover:bg-blue-600 transition-colors"
        >
          {round < TOTAL_ROUNDS ? "다음 라운드" : "최종 지목으로"}
        </button>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr]">
        <div className="flex flex-col gap-4">
          <InvestigationBoard
            round={round}
            collectedIds={collectedEvidenceIds}
            onCollect={handleCollectEvidence}
          />
          <NotesPanel value={notes} onChange={setNotes} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {characters.map((c) => (
              <button
                key={c.characterId}
                onClick={() => setActiveCharacterId(c.characterId)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  activeCharacterId === c.characterId
                    ? "border-blue-600 bg-blue-950/40 text-blue-200"
                    : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:border-neutral-600"
                } ${lockedCharacters.has(c.characterId) ? "opacity-60" : ""}`}
              >
                {c.displayName}
                {lockedCharacters.has(c.characterId) && " 🔒"}
              </button>
            ))}
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
