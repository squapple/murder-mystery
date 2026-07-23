"use client";

import type { PlayerCharacterView } from "@/lib/game-client-types";
import { PUBLIC_CASE_BRIEF } from "@/lib/game-data/truth-bible";

interface CastingScreenProps {
  loading: boolean;
  error: string | null;
  characters: PlayerCharacterView[];
  onStart: () => void;
}

export default function CastingScreen({
  loading,
  error,
  characters,
  onStart,
}: CastingScreenProps) {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          NAN 2026 · 머더 미스터리
        </p>
        <h1 className="text-2xl font-bold">사건 브리핑</h1>
      </header>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
        <h2 className="mb-2 font-semibold text-neutral-200">사건 개요</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-neutral-400">
          <dt>피해자</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.victim}</dd>
          <dt>장소</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.location}</dd>
          <dt>사망 추정 시각</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.timeOfDeath}</dd>
          <dt>발견 시각</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.discoveredAt}</dd>
          <dt>배경</dt>
          <dd className="text-neutral-200">{PUBLIC_CASE_BRIEF.background}</dd>
        </dl>
      </section>

      <section className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4 text-sm">
        <h2 className="mb-3 font-semibold text-neutral-200">용의자 3인</h2>
        {loading && <p className="text-neutral-500">캐스팅 중...</p>}
        {error && <p className="text-rose-400">{error}</p>}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {characters.map((c) => (
            <div key={c.characterId} className="rounded-md border border-neutral-800 bg-neutral-950 p-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold">
                {c.displayName[0]}
              </div>
              <div className="mt-2 font-medium text-neutral-100">{c.displayName}</div>
              <div className="text-xs text-neutral-500">{c.roleTitle}</div>
              <div className="mt-1 text-xs text-neutral-400">{c.motivePublic}</div>
            </div>
          ))}
        </div>
      </section>

      <p className="text-center text-xs text-neutral-500">
        날카로운 질문을 던져 용의자를 굴복시키세요.
      </p>

      <button
        onClick={onStart}
        disabled={loading || characters.length === 0}
        className="w-full rounded-md bg-blue-700 px-4 py-3 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
      >
        조사 시작
      </button>
    </div>
  );
}
