// 04_game_loop_flow.json proc-casting-reveal — 8개 페르소나 중 3개를 배역 3개에
// 매판 랜덤 배정한다 (02_persona_design.md §1: 페르소나(배우) ≠ 배역, 완전히 독립적).
//
// DB가 없는 서버리스 배포(Vercel) 환경이므로, 배정 결과를 서버 메모리에 유지할 수
// 없다. 대신 배정 결과를 base64 JSON 토큰(castingToken)으로 클라이언트에 내려주고,
// 이후 모든 /api/interrogate·/api/reflect 호출에 그대로 실어 보내게 한다.
//
// 트레이드오프(의도적, 문서화): 이 토큰은 서명·암호화되어 있지 않다. 개발자도구로
// 디코드하면 어떤 페르소나가 배정됐는지 미리 볼 수 있다 — 진범 여부·진실 성서처럼
// 절대 지켜야 하는 정보(ai_only 중에서도 is_culprit급)가 아니라, 원래도
// "player_post_game"으로 결과 화면에 공개될 예정이던 페르소나 정보이므로, 파티
// 게임 규모에서는 이 수준의 노출은 허용 가능한 리스크로 판단했다. 협업 대회처럼
// 부정행위 방지가 중요해지면 서명(HMAC) 또는 실제 세션 스토어로 교체할 것.

import { CHARACTER_LIST } from "./game-data/characters";
import { PERSONA_LIST } from "./game-data/personas";
import type { CharacterId, Persona } from "./game-data/types";

export interface CastingMap {
  [characterId: string]: string; // characterId -> personaKey (e.g. "ESTP")
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** 8개 페르소나 중 3개를 뽑아 3배역에 랜덤 배정한다. */
export function randomizeCasting(): CastingMap {
  const personaKeys = Object.keys(
    Object.fromEntries(PERSONA_LIST.map((p) => [p.mbtiType, p]))
  );
  const chosen = shuffle(personaKeys).slice(0, CHARACTER_LIST.length);
  const characterIds = CHARACTER_LIST.map((c) => c.characterId);

  const map: CastingMap = {};
  characterIds.forEach((id, i) => {
    map[id] = chosen[i];
  });
  return map;
}

export function encodeCastingToken(map: CastingMap): string {
  return Buffer.from(JSON.stringify(map), "utf-8").toString("base64url");
}

export function decodeCastingToken(token: string): CastingMap | null {
  try {
    const json = Buffer.from(token, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (typeof parsed !== "object" || parsed === null) return null;
    return parsed as CastingMap;
  } catch {
    return null;
  }
}

/** castingToken + characterId로부터 해당 배역에 배정된 페르소나를 조회한다. */
export function resolvePersonaForCharacter(
  castingToken: string,
  characterId: CharacterId,
  personas: Record<string, Persona>
): Persona | null {
  const map = decodeCastingToken(castingToken);
  if (!map) return null;
  const personaKey = map[characterId];
  if (!personaKey) return null;
  return personas[personaKey] ?? null;
}
