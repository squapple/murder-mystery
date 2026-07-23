// 임시 진단용 라우트 — Vercel 배포 환경에서 NVIDIA NIM API 단일 호출 지연시간만 측정한다.
// 로컬(3~4초)과 Vercel 배포(110초) 간 20배 격차의 원인을 좁히기 위한 용도.
// 원인 확인 후 삭제할 것 (05_history_nan2026.md Phase 12 참고).

import { NextResponse } from "next/server";
import { getNimClient, NIM_MODEL } from "@/lib/nim-client";

export async function GET() {
  const startedAt = Date.now();
  try {
    const client = getNimClient();
    const completion = await client.chat.completions.create({
      model: NIM_MODEL,
      max_tokens: 50,
      temperature: 1,
      messages: [{ role: "user", content: "안녕하세요, 간단히 인사만 해주세요." }],
    });
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json({
      ok: true,
      elapsedMs,
      region: process.env.VERCEL_REGION ?? "unknown",
      text: completion.choices[0]?.message?.content ?? "",
    });
  } catch (err) {
    const elapsedMs = Date.now() - startedAt;
    return NextResponse.json(
      {
        ok: false,
        elapsedMs,
        region: process.env.VERCEL_REGION ?? "unknown",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 }
    );
  }
}
