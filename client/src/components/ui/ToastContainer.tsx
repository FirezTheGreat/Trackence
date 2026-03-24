import { useEffect, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { useToastStore } from "../../stores/toast.store";

const typeStyles = {
    success: {
        icon: CheckCircle2,
        iconColor: "text-emerald-300",
        accent: "bg-emerald-400",
    },
    error: {
        icon: XCircle,
        iconColor: "text-red-300",
        accent: "bg-red-400",
    },
    info: {
        icon: Info,
        iconColor: "text-sky-300",
        accent: "bg-sky-400",
    },
};

export function ToastContainer() {
    const [toasts, setToasts] = useState(useToastStore.getState().toasts);

    useEffect(() => {
        const unsubscribe = useToastStore.subscribe((state) => {
            setToasts(state.toasts);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const removeToast = useToastStore.getState().removeToast;

    if (toasts.length === 0) return null;

    return (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-70 w-[calc(100vw-2rem)] max-w-lg space-y-2 pointer-events-none">
            {toasts.map((toast) => {
                const style = typeStyles[toast.type];
                const Icon = style.icon;

                return (
                    <div
                        key={toast.id}
                        role="status"
                        aria-live="polite"
                        className="relative overflow-hidden rounded-2xl border border-white/12 bg-secondary/92 backdrop-blur-xl shadow-2xl shadow-black/35 animate-slide-in pointer-events-auto"
                    >
                        <div className={`absolute left-0 top-0 h-full w-1 ${style.accent}`} />
                        <div className="flex items-start gap-3 p-3.5 pl-4">
                            <Icon className={`w-4.5 h-4.5 mt-0.5 shrink-0 ${style.iconColor}`} />
                            <p className="flex-1 text-sm leading-5 text-white/90">{toast.message}</p>
                            <button
                                onClick={() => removeToast(toast.id)}
                                className="text-white/40 hover:text-white/80 transition-colors cursor-pointer"
                                aria-label="Close notification"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
