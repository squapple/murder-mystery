"use client";

import { useState } from "react";
import type { CharacterId } from "@/lib/game-data/types";
import type { PlayerCharacterView } from "@/lib/game-client-types";

interface AccusationScreenProps {
  characters: PlayerCharacterView[];
  loading: boolean;
  onAccuse: (characterId: CharacterId) => void;
}

export default function AccusationScreen({
  characters,
  loading,
  onAccuse,
}: AccusationScreenProps) {
  const [selected, setSelected] = useState<CharacterId | null>(null);

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-6 px-4 py-12">
      <header className="space-y-2 text-center">
        <p className="text-xs uppercase tracking-widest text-neutral-500">3라운드 종료</p>
        <h1 className="text-2xl font-bold">최종 지목</h1>
        <p className="text-sm text-neutral-400">진범이라고 생각하는 용의자를 선택하세요.</p>
      </header>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {characters.map((c) => (
          <button
            key={c.characterId}
            onClick={() => setSelected(c.characterId)}
            className={`rounded-md border p-4 text-left transition-colors ${
              selected === c.characterId
                ? "border-blue-600 bg-blue-950/40"
                : "border-neutral-800 bg-neutral-900/40 hover:border-neutral-600"
            }`}
          >
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold">
              {c.displayName[0]}
            </div>
            <div className="mt-2 font-medium text-neutral-100">{c.displayName}</div>
            <div className="text-xs text-neutral-500">{c.roleTitle}</div>
          </button>
        ))}
      </div>

      <button
        onClick={() => selected && onAccuse(selected)}
        disabled={!selected || loading}
        className="w-full rounded-md bg-rose-700 px-4 py-3 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-rose-600 transition-colors"
      >
        {loading ? "채점 중..." : "이 사람을 지목합니다"}
      </button>
    </div>
  );
}
