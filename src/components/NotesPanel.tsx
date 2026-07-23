"use client";

interface NotesPanelProps {
  value: string;
  onChange: (value: string) => void;
}

export default function NotesPanel({ value, onChange }: NotesPanelProps) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 p-4">
      <h2 className="mb-1 font-semibold text-neutral-200">수사 메모</h2>
      <p className="mb-2 text-xs text-neutral-500">
        알게 된 사실이나 의심되는 점을 자유롭게 적어두세요. 채점에는 영향을 주지 않습니다.
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={8}
        placeholder="예: 박서연은 이현우를 싫어함. 이현우는 관리실 방문 이유를 얼버무림..."
        className="w-full resize-y rounded-md border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm text-neutral-200 outline-none focus:border-blue-600"
      />
    </div>
  );
}
