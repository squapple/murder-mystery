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

export type GamePhase = "loading" | "casting" | "round" | "accusation" | "result";

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
