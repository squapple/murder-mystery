// POST /api/casting — 04_game_loop_flow.json proc-casting-reveal.
// 8개 페르소나 중 3개를 3배역에 랜덤 배정하고, 플레이어 공개 뷰 + castingToken을 반환한다.
// persona_tag(성향)는 반환하지 않는다 — 결과 화면에서만 공개(player_post_game).

import { NextResponse } from "next/server";
import { randomizeCasting, encodeCastingToken } from "@/lib/casting";
import { CHARACTER_LIST, getPlayerView } from "@/lib/game-data/characters";

// Edge 런타임 되돌림 — 05_history_nan2026.md Phase 18 참고. Edge가 NVIDIA 호출의
// 네트워크 변동성은 줄여줬지만 25초 응답 마감이 있어, 콜을 줄여도 매번
// FUNCTION_INVOCATION_TIMEOUT이 재현됐다. Node.js/Fluid Compute(300초 한도)로 복귀.
// 이 라우트 자체는 NVIDIA를 호출하지 않아 원래도 영향은 없었지만 일관성을 위해 통일한다.

export async function POST() {
  const castingMap = randomizeCasting();
  const castingToken = encodeCastingToken(castingMap);
  const characters = CHARACTER_LIST.map((c) => getPlayerView(c));

  return NextResponse.json({ characters, castingToken });
}
