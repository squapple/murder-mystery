"use client";

import { useEffect, useState } from "react";
import { PROSE_INTRO } from "@/lib/game-data/truth-bible";

interface IntroScreenProps {
  onContinue: () => void;
}

export default function IntroScreen({ onContinue }: IntroScreenProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center gap-8 px-4 py-16 text-center">
      <div
        className={`space-y-6 transition-all duration-700 ease-out ${
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        <p className="text-xs uppercase tracking-widest text-neutral-500">
          NAN 2026 · 머더 미스터리
        </p>
        <p className="whitespace-pre-line text-left text-[15px] leading-relaxed text-neutral-300">
          {PROSE_INTRO}
        </p>
      </div>

      <button
        onClick={onContinue}
        className={`rounded-md bg-blue-700 px-6 py-3 text-sm font-medium transition-all duration-700 ease-out hover:bg-blue-600 ${
          visible ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
        }`}
      >
        용의자 확인하기
      </button>
    </div>
  );
}
