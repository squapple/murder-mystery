// POST /api/casting — 04_game_loop_flow.json proc-casting-reveal.
// 8개 페르소나 중 3개를 3배역에 랜덤 배정하고, 플레이어 공개 뷰 + castingToken을 반환한다.
// persona_tag(성향)는 반환하지 않는다 — 결과 화면에서만 공개(player_post_game).

import { NextResponse } from "next/server";
import { randomizeCasting, encodeCastingToken } from "@/lib/casting";
import { CHARACTER_LIST, getPlayerView } from "@/lib/game-data/characters";

export async function POST() {
  const castingMap = randomizeCasting();
  const castingToken = encodeCastingToken(castingMap);
  const characters = CHARACTER_LIST.map((c) => getPlayerView(c));

  return NextResponse.json({ characters, castingToken });
}
