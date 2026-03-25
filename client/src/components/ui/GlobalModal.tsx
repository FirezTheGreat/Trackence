import { useEffect, useRef } from "react";
import { useModalStore } from "../../stores/modal.store";

export function GlobalModal() {
  const {
    isOpen,
    type,
    title,
    message,
    confirmText,
    cancelText,
    inputValue,
    placeholder,
    onConfirm,
    onCancel,
    setInputValue,
  } = useModalStore();

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen && type === "prompt" && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen, type]);

  if (!isOpen) return null;

  const isDestructive = /(delete|remove|leave|end)/i.test(title) || /(delete|remove|leave|end)/i.test(confirmText);
  const isPositive = /(add|approve|create|promote)/i.test(title) || /(add|approve|create|promote)/i.test(confirmText);
  const isWarning = /(demote|warning)/i.test(title) || /(demote|warning)/i.test(confirmText);

  let confirmButtonClass = "bg-accent/20 border-accent/40 text-accent hover:bg-accent/30";
  if (type === "confirm" || type === "prompt") {
    if (isDestructive) {
      confirmButtonClass = "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30";
    } else if (isPositive) {
      confirmButtonClass = "bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30";
    } else if (isWarning) {
      confirmButtonClass = "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30";
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      onConfirm();
    }
  };

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm perf-soft-glass bg-black/40 animate-fade-in cursor-default">
      <div className="backdrop-blur-2xl perf-soft-glass bg-secondary/60 border border-white/20 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-fade-in-up">
        <h3 className="text-xl text-white font-semibold mb-3 tracking-tight">
          {title}
        </h3>
        <p className="text-white/70 text-sm mb-6 whitespace-pre-wrap">
          {message}
        </p>

        {type === "prompt" && (
          <div className="mb-6">
            <input
              ref={inputRef}
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder || "Enter value..."}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-2.5 text-white placeholder-white/40 focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent transition"
            />
          </div>
        )}

        <div className="flex justify-end gap-3">
          {(type === "confirm" || type === "prompt") && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-white/15 text-white/60 text-sm font-medium hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={() => onConfirm()}
            className={`px-4 py-2 rounded-lg border font-medium text-sm transition cursor-pointer ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
