// 클라이언트(브라우저) 전용 게임 세션 상태 타입.
// ai_only 필드는 절대 포함하지 않는다 — 이 파일은 "use client" 컴포넌트에서 import된다.

import type { CharacterId } from "./game-data/types";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  mode?: string;
}

export interface PlayerCharacterView {
  characterId: CharacterId;
  displayName: string;
  roleTitle: string;
  motivePublic: string;
}

export type GamePhase =
  | "loading"
  | "casting"
  | "round-transition"
  | "round"
  | "accusation"
  | "result";

/**
 * 사전 등록되지 않은 임의의 소지품을 요청해 서버가 즉석에서 만든 조사모드 카드.
 * 내용은 항상 "사건과 무관" 고정 문구다(액터-프롬프트 이력 9번 참고) — evidence.ts의
 * 고정 EVIDENCE 배열에는 들어있지 않으므로 별도로 클라이언트 상태에 보관한다.
 */
export interface AdHocEvidenceCard {
  id: string;
  name: string;
  revealedFact: string;
}

export interface ResultCharacterView {
  characterId: CharacterId;
  displayName: string;
  roleTitle: string;
  isCulprit: boolean;
  motiveFull: string;
  personaTag: string | null;
  mbtiType: string | null;
}

export interface ScoreBreakdown {
  basicEvidencePoints: number;
  linkedEvidencePoints: number;
  statementEvidencePoints: number;
  motivePoints: number;
  breakdownBonus: number;
  efficiencyBonus: number;
  total: number;
  maxTotal: number;
}

export interface AccuseResult {
  isCorrect: boolean;
  culpritCharacterId: CharacterId;
  score: ScoreBreakdown;
  grade: "S" | "A" | "B" | "C";
  characters: ResultCharacterView[];
  confessionScene: string;
}
