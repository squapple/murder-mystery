"use client";

import { useEffect, useState } from "react";
import type { CharacterId } from "@/lib/game-data/types";
import { getEvidenceById } from "@/lib/game-data/evidence";
import type {
  AdHocEvidenceCard,
  ChatMessage,
  PlayerCharacterView,
  GamePhase,
  AccuseResult,
} from "@/lib/game-client-types";
import { saveGame, loadGame, clearGame, type SavedGameState } from "@/lib/gameSave";
import { PATIENCE_MAX } from "@/lib/patience";
import IntroScreen from "./IntroScreen";
import CastingScreen from "./CastingScreen";
import RoundTransitionScreen from "./RoundTransitionScreen";
import InvestigationBoard from "./InvestigationBoard";
import InterrogationChat from "./InterrogationChat";
import AccusationScreen from "./AccusationScreen";
import ResultScreen from "./ResultScreen";
import NotesPanel from "./NotesPanel";

const TOTAL_ROUNDS = 3;

// Phase 39 — 인내심 게이지는 이제 서버(patience.ts)가 매 응답마다 내려주는 결정론적
// 수치를 그대로 저장해서 그린다. 예전엔 모델이 [모드: 동요]로 응답한 걸 클라이언트가
// 스캔해서 역산했는데, 이제 모델은 그런 신호를 아예 출력하지 않는다(actor-prompt.ts
// 참고) — 서버가 이미 계산을 끝낸 값을 그대로 신뢰한다.

/** 게이지 필 색상 — 단계가 오를수록 노랑→주황→빨강으로 escalate. */
function pressureSegmentColor(level: number, index: number, locked: boolean): string {
  if (index >= level) return "bg-neutral-700";
  if (locked) return "bg-rose-600";
  if (level >= 4) return "bg-rose-500";
  if (level >= 3) return "bg-orange-500";
  if (level >= 2) return "bg-amber-400";
  return "bg-yellow-300";
}

/** 아직 대화가 없는 캐릭터에 매번 새 배열을 만들어 넘기면(예: `?? []`) 참조가 매
 * 렌더마다 바뀌어, 그 배열을 effect 의존성으로 쓰는 자식 컴포넌트(InterrogationChat의
 * 자동 스크롤)가 불필요하게 재실행된다 — Phase 32에서 추가한 1초 타이머(nowTick)가
 * 매초 GameApp을 재렌더시키면서 이 문제가 실제로 "스크롤을 내려도 계속 위로
 * 튕겨 올라오는" 버그로 나타났다. 항상 같은 참조를 재사용해 이 재실행 자체를 없앤다. */
const EMPTY_MESSAGES: ChatMessage[] = [];

/** MM:SS 형식으로 경과 시간 표시 — 헤더의 실시간 타이머용(Phase 32). */
function formatElapsedTime(elapsedMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(elapsedMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

interface InterrogateStreamResult {
  text: string;
  locked: boolean;
  patienceLevel: number;
}

/**
 * /api/interrogate가 NDJSON(줄바꿈 구분 JSON)으로 스트리밍하는 응답을 읽는다
 * (Phase 30 후속 — 모바일 와이파이에서 응답을 오래 기다리는 동안 공유기/통신사가
 * "조용한 연결"로 판단해 끊어버리는 사례가 있어, 서버가 대기 중 주기적으로
 * {"type":"heartbeat"} 줄을 흘려보내도록 바꿨다). heartbeat 줄은 무시하고,
 * 마지막에 오는 {"type":"result",...} 한 줄만 실제 결과로 사용한다.
 */
async function readNdjsonResult(res: Response): Promise<InterrogateStreamResult> {
  if (!res.body) throw new Error("응답 스트림을 읽을 수 없습니다.");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: InterrogateStreamResult | null = null;
  let streamError: string | null = null;

  const processLine = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let parsed: { type: string; [key: string]: unknown };
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return;
    }
    if (parsed.type === "result") {
      result = parsed as unknown as InterrogateStreamResult;
    } else if (parsed.type === "error") {
      streamError = typeof parsed.error === "string" ? parsed.error : "알 수 없는 오류";
    }
    // "heartbeat" 타입은 연결 유지 목적일 뿐이라 그냥 무시한다.
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf("\n")) >= 0) {
      processLine(buffer.slice(0, newlineIdx));
      buffer = buffer.slice(newlineIdx + 1);
    }
  }
  if (buffer.trim()) processLine(buffer);

  if (streamError) throw new Error(streamError);
  if (!result) throw new Error("서버로부터 응답을 받지 못했습니다.");
  return result;
}

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
  // Phase 39 — 서버(patience.ts)가 매 응답마다 내려주는 결정론적 인내심 수치를
  // 그대로 저장한다. 예전 2단계 경고(warnedCharacters) 개념은 없앴다 — 게이지 숫자
  // 자체가 곧 경고이므로 별도 상태가 필요 없다.
  const [patienceLevels, setPatienceLevels] = useState<Record<string, number>>({});
  const [collectedEvidenceIds, setCollectedEvidenceIds] = useState<Set<string>>(new Set());
  // Phase 36 — 실전 리포트: 심문 중 "가방 보여달라"고 요청해 round-review로
  // 해금된 물증이 다음 라운드에 클릭하지도 않았는데 이미 확보(✓, 초록색)된 채로
  // 나타났다. 요청은 "조사 모드에 이 카드가 나타나게" 만드는 것까지만 하고, 실제
  // "확보"(채점 반영 + ✓ 표시)는 다른 카드처럼 직접 클릭해야만 되도록 분리했다 —
  // action_triggered 물증의 가시성은 이제 이 목록으로, 확보 여부는 여전히
  // collectedEvidenceIds로 따로 관리한다.
  const [unlockedActionIds, setUnlockedActionIds] = useState<Set<string>>(new Set());
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
    setPatienceLevels(resumeCandidate.patienceLevels ?? {});
    setCollectedEvidenceIds(new Set(resumeCandidate.collectedEvidenceIds));
    setUnlockedActionIds(new Set(resumeCandidate.unlockedActionIds ?? []));
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

  /**
   * 결과 화면 "다시 도전하기" — 실전 리뷰 피드백(Phase 32): 결과 화면에서 재도전할
   * 방법이 전혀 없었다는 지적. castingToken을 비워 캐스팅 재요청 useEffect가 다시
   * 돌게 하고 나머지 라운드 상태를 전부 초기화한다. introSeen은 유지해 프롤로그를
   * 또 보여주지 않는다.
   */
  function restartGame() {
    clearGame();
    setPhase("loading");
    setCastingToken(null);
    setCharacters([]);
    setRound(1);
    setActiveCharacterId(null);
    setConversations({});
    setInputs({});
    setLoadingMap({});
    setErrorMap({});
    setLockedCharacters(new Set());
    setPatienceLevels({});
    setCollectedEvidenceIds(new Set());
    setUnlockedActionIds(new Set());
    setAdHocEvidence([]);
    setInvestigationStartedAt(null);
    setNotes("");
    setTransitionScreen(null);
    setLateRoundItemNames([]);
    setAccuseError(null);
    setResult(null);
    setAccusedCharacterId(null);
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
      patienceLevels,
      collectedEvidenceIds: Array.from(collectedEvidenceIds),
      unlockedActionIds: Array.from(unlockedActionIds),
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
    patienceLevels,
    collectedEvidenceIds,
    unlockedActionIds,
    adHocEvidence,
    investigationStartedAt,
    notes,
  ]);

  // 게임이 끝나면(결과 화면 도달) 저장된 이어하기 데이터를 지운다 — 끝난 게임을 다시
  // "이어하기"로 제안하지 않기 위함.
  useEffect(() => {
    if (phase === "result") clearGame();
  }, [phase]);

  // Phase 35 — 진술 증거(다른 팀원의 증언)를 라운드 전환 시 자동 확보하던 로직을
  // 없앴다. 실전 리뷰: "지금은 클릭하는 게 의미가 없다"(이미 자동으로 확보돼 있어서)
  // — 이제 물증과 똑같이 InvestigationBoard에서 직접 클릭해야 확보된다
  // (getAvailableEvidenceForRound가 라운드별로 "보이는" 시점만 결정하고, "확보됨"
  // 여부는 물증과 동일하게 onCollect 클릭으로만 결정된다).

  // Phase 32 — 채점 기준을 시작 전에 미리 공개하기로 하면서, 소요 시간도 결과 화면에서만
  // 알게 되는 대신 진행 중 헤더에 실시간으로 보여주기로 했다(사용자 요청). 1초마다
  // 현재 시각을 갱신해 investigationStartedAt과의 차이를 렌더링에 반영한다.
  const [nowTick, setNowTick] = useState(Date.now());
  useEffect(() => {
    if (investigationStartedAt === null || phase === "result") return;
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [investigationStartedAt, phase]);

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
      if (!res.ok) {
        // 요청 검증 실패(4xx) 등 스트리밍 시작 전 단계에서만 나오는 일반 JSON 에러 응답.
        const data = await res.json().catch(() => ({}) as { error?: string });
        throw new Error(data.error ?? `요청 실패 (HTTP ${res.status})`);
      }
      const data = await readNdjsonResult(res);

      setConversations((prev) => ({
        ...prev,
        [characterId]: [...nextHistory, { role: "assistant", content: data.text }],
      }));

      // Phase 39 — 서버가 이미 계산해서 내려준 결정론적 인내심 수치를 그대로 저장한다.
      setPatienceLevels((prev) => ({ ...prev, [characterId]: data.patienceLevel }));

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
          // Phase 36 — 여기서는 "조사 모드에 카드가 나타나게"만 하고, 실제 확보(✓,
          // 채점 반영)는 물증과 똑같이 플레이어가 직접 클릭해야 되도록 바꿨다.
          // collectedEvidenceIds에는 손대지 않는다.
          if (unlockedIds.length > 0) {
            setUnlockedActionIds((prev) => {
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
        onRestart={restartGame}
      />
    );
  }

  const activeCharacter = characters.find((c) => c.characterId === activeCharacterId);
  const activeLocked = activeCharacter ? lockedCharacters.has(activeCharacter.characterId) : false;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-4 px-4 py-6 xl:max-w-7xl">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-xs uppercase tracking-widest text-neutral-500">
            NAN 2026 · 머더 미스터리
          </p>
          <h1 className="text-xl font-bold">라운드 {round} / {TOTAL_ROUNDS}</h1>
        </div>
        <div className="flex items-center gap-3">
          {investigationStartedAt !== null && (
            <span className="font-mono text-sm text-neutral-400" title="경과 시간(심문 효율 점수에 반영됩니다)">
              ⏱ {formatElapsedTime(nowTick - investigationStartedAt)}
            </span>
          )}
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
        </div>
      </header>

      {/* Phase 35 — 넓은 화면(xl)에서는 왼쪽 열을 넓혀 조사 모드/다른 팀원의 증언이
          나란히 들어갈 공간을 준다(사용자 요청: "화면 넓을 때는 옆에, 창모드일 땐 지금처럼"). */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[320px_1fr] xl:grid-cols-[640px_1fr]">
        <div className="flex flex-col gap-4">
          <InvestigationBoard
            round={round}
            collectedIds={collectedEvidenceIds}
            unlockedActionIds={unlockedActionIds}
            adHocEvidence={adHocEvidence}
            onCollect={handleCollectEvidence}
          />
          <NotesPanel value={notes} onChange={setNotes} />
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            {characters.map((c) => {
              const isLocked = lockedCharacters.has(c.characterId);
              // Phase 39 — 서버가 매 응답마다 내려주는 결정론적 수치를 그대로 쓴다.
              // 잠긴 캐릭터는 마지막 응답에서 이미 최대치가 왔겠지만, 방어적으로 한 번 더 고정한다.
              const level = isLocked ? PATIENCE_MAX : (patienceLevels[c.characterId] ?? 0);
              return (
                <button
                  key={c.characterId}
                  onClick={() => setActiveCharacterId(c.characterId)}
                  title={
                    isLocked
                      ? "더 이상 심문에 응하지 않습니다"
                      : `인내심 ${level}/${PATIENCE_MAX} — 관련 키워드를 언급하거나 같은 질문을 반복하면 차오릅니다`
                  }
                  className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                    activeCharacterId === c.characterId
                      ? "border-blue-600 bg-blue-950/40 text-blue-200"
                      : "border-neutral-800 bg-neutral-900/40 text-neutral-300 hover:border-neutral-600"
                  } ${isLocked ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-center gap-1">
                    <span>{c.displayName}</span>
                    {isLocked && <span>🔒</span>}
                  </div>
                  <div className="mt-1.5 flex justify-center gap-0.5" aria-hidden="true">
                    {Array.from({ length: PATIENCE_MAX }, (_, i) => (
                      <span
                        key={i}
                        className={`h-1.5 w-3 rounded-sm transition-colors ${pressureSegmentColor(level, i, isLocked)}`}
                      />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>

          {activeCharacter && (
            <InterrogationChat
              characterId={activeCharacter.characterId}
              displayName={activeCharacter.displayName}
              roleTitle={activeCharacter.roleTitle}
              messages={conversations[activeCharacter.characterId] ?? EMPTY_MESSAGES}
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
