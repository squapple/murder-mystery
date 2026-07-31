// Phase 65 — "메시지가 플레이어에게 나가기까지의 과정(원문→교정→검증)을 보고 싶다"는
// 요청으로 신설. 실제로 무슨 일이 일어나는지 파일로 남겨 단계별로 대조할 수 있게
// 한다. Cloudflare Workers는 로컬 파일 시스템이 없으므로(node:fs 자체를 못 씀),
// 배포 환경에서는 이 로거가 조용히 아무 일도 하지 않는다 — 지금 단계에서는
// `npm run dev`로 로컬에서 돌려야만 실제로 logs/quality-pipeline.log가 쌓인다
// (사용자도 "당분간은 로컬에서 실행해도 된다"고 명시).
//
// 포맷은 grep/jq로 보기 쉽게 한 줄에 JSON 객체 하나(JSON Lines)로 남긴다.

import { appendFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";

const LOG_PATH = join(process.cwd(), "logs", "quality-pipeline.log");

function ensureLogDir() {
  mkdirSync(dirname(LOG_PATH), { recursive: true });
}

/**
 * 파이프라인 단계 하나를 로그에 한 줄 남긴다. 실패해도(Cloudflare Workers처럼
 * fs 자체가 없는 환경 등) 절대 예외를 던지지 않는다 — 로깅 때문에 실제 요청이
 * 실패하면 안 된다.
 */
export function logPipelineStep(event: Record<string, unknown>): void {
  try {
    ensureLogDir();
    const line = `${JSON.stringify({ ts: new Date().toISOString(), ...event })}\n`;
    appendFileSync(LOG_PATH, line, "utf-8");
  } catch {
    // 로컬 파일 시스템이 없는 환경(Cloudflare Workers 등)에서는 조용히 무시한다.
  }
}
