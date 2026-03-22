import { useModalStore } from "../../stores/modal.store";

export function GlobalModal() {
  const {
    isOpen,
    type,
    title,
    message,
    confirmText,
    cancelText,
    onConfirm,
    onCancel,
  } = useModalStore();

  if (!isOpen) return null;

  const isDestructive = /(delete|remove|leave|end)/i.test(title) || /(delete|remove|leave|end)/i.test(confirmText);
  const isPositive = /(add|approve|create|promote)/i.test(title) || /(add|approve|create|promote)/i.test(confirmText);
  const isWarning = /(demote|warning)/i.test(title) || /(demote|warning)/i.test(confirmText);

  let confirmButtonClass = "bg-accent/20 border-accent/40 text-accent hover:bg-accent/30";
  if (type === "confirm") {
    if (isDestructive) {
      confirmButtonClass = "bg-red-500/20 border-red-500/40 text-red-400 hover:bg-red-500/30";
    } else if (isPositive) {
      confirmButtonClass = "bg-green-500/20 border-green-500/40 text-green-400 hover:bg-green-500/30";
    } else if (isWarning) {
      confirmButtonClass = "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30";
    }
  }

  return (
    <div className="fixed inset-0 z-100 flex items-center justify-center backdrop-blur-sm bg-black/40 animate-fade-in cursor-default">
      <div className="backdrop-blur-2xl bg-secondary/60 border border-white/20 rounded-2xl p-8 max-w-sm w-full mx-4 shadow-2xl animate-fade-in-up">
        <h3 className="text-xl text-white font-semibold mb-3 tracking-tight">
          {title}
        </h3>
        <p className="text-white/70 text-sm mb-6 whitespace-pre-wrap">
          {message}
        </p>

        <div className="flex justify-end gap-3">
          {type === "confirm" && (
            <button
              onClick={onCancel}
              className="px-4 py-2 rounded-lg border border-white/15 text-white/60 text-sm font-medium hover:text-white hover:bg-white/5 transition cursor-pointer"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg border font-medium text-sm transition cursor-pointer ${confirmButtonClass}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
