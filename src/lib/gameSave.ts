// 로컬 저장(이어하기) — DB 없이 브라우저 localStorage만 사용한다.
// 실전 피드백: "게임을 이어서 할 수 있으면 좋겠다"는 요청에, 파티 게임 규모에서는
// 기기 간 이동(컴퓨터→아이패드)까지 지원할 필요는 크지 않다고 판단해 DB 대신
// 같은 기기·같은 브라우저 안에서만 이어할 수 있는 가장 가벼운 방식을 택했다.

import type { CharacterId } from "./game-data/types";
import type {
  AdHocEvidenceCard,
  ChatMessage,
  GamePhase,
  PlayerCharacterView,
} from "./game-client-types";

const SAVE_KEY = "nan2026-save-v1";

export interface SavedGameState {
  phase: GamePhase;
  castingToken: string;
  characters: PlayerCharacterView[];
  round: number;
  activeCharacterId: CharacterId | null;
  conversations: Record<string, ChatMessage[]>;
  lockedCharacters: string[];
  /** Phase 32 — 진범 하드게이트 2단계(경고 후 잠금) 도입으로 추가. 구버전 저장 데이터엔
   * 없을 수 있어 GameApp.tsx에서 읽을 때 `?? []`로 방어한다. */
  warnedCharacters?: string[];
  collectedEvidenceIds: string[];
  /** Phase 36 — 심문 중 요청으로 해금된 action_triggered 물증이 조사 모드에 "나타나는지"
   * 여부만 관리한다(확보 여부는 여전히 collectedEvidenceIds). 구버전 저장 데이터엔
   * 없을 수 있어 GameApp.tsx에서 읽을 때 `?? []`로 방어한다. */
  unlockedActionIds?: string[];
  adHocEvidence: AdHocEvidenceCard[];
  /** 게임 시작 시각(epoch ms) — 효율 보너스가 시간 기반으로 바뀌며(Phase 30) 이어하기 시에도
   * 원래 시작 시점부터 경과 시간을 잴 수 있도록 totalQuestionChars 대신 이걸 저장한다. */
  investigationStartedAt: number;
  notes: string;
  savedAt: number;
}

export function saveGame(state: SavedGameState): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // 저장 실패(프라이빗 모드 등)가 게임 진행을 막아서는 안 되므로 조용히 무시한다.
  }
}

export function loadGame(): SavedGameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedGameState;
  } catch {
    return null;
  }
}

export function clearGame(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // 무시
  }
}
