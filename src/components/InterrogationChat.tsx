"use client";

import { useRef, useEffect } from "react";
import type { ChatMessage } from "@/lib/game-client-types";

interface InterrogationChatProps {
  characterId: string;
  displayName: string;
  roleTitle: string;
  messages: ChatMessage[];
  loading: boolean;
  error: string | null;
  input: string;
  /** 심문종료(락아웃) 상태 — 진범 붕괴/무고자 비밀소진 모두 동일하게 처리되어
   * 이 값만으로는 어느 쪽인지 알 수 없다 (actor-prompt.ts 참고). */
  locked: boolean;
  onInputChange: (value: string) => void;
  onSend: () => void;
}

export default function InterrogationChat({
  displayName,
  roleTitle,
  messages,
  loading,
  error,
  input,
  locked,
  onInputChange,
  onSend,
}: InterrogationChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  }

  return (
    <div className="flex flex-col h-[60vh] rounded-lg border border-neutral-800 bg-neutral-900/60">
      <div className="flex items-center gap-3 border-b border-neutral-800 px-4 py-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-800 text-sm font-semibold">
          {displayName[0]}
        </div>
        <div>
          <div className="font-semibold">{displayName}</div>
          <div className="text-xs text-neutral-400">{roleTitle}</div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <p className="text-sm text-neutral-500">
            심문을 시작하세요. 확보한 물증을 근거로 질문을 던져보세요.
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                m.role === "user"
                  ? "bg-blue-700 text-white"
                  : "bg-neutral-800 text-neutral-100"
              }`}
            >
              <div>{m.content}</div>
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-neutral-800 px-3 py-2 text-sm text-neutral-400">
              {displayName}이(가) 생각하는 중...
            </div>
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-rose-900 bg-rose-950/50 px-3 py-2 text-sm text-rose-300">
            {error}
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {locked ? (
        <div className="border-t border-neutral-800 p-3 text-center text-sm text-neutral-500">
          이 용의자는 더 이상 심문에 응하지 않습니다.
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-neutral-800 p-3">
          <textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            rows={2}
            placeholder="질문을 입력하세요 (Enter로 전송, Shift+Enter로 줄바꿈)"
            className="flex-1 resize-none rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm outline-none focus:border-blue-600"
          />
          <button
            onClick={onSend}
            disabled={loading || !input.trim()}
            className="rounded-md bg-blue-700 px-4 py-2 text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
          >
            전송
          </button>
        </div>
      )}
    </div>
  );
}
