import { create } from "zustand";

type ToastType = "success" | "error" | "info";

interface Toast {
    id: string;
    type: ToastType;
    message: string;
}

interface ToastState {
    toasts: Toast[];
    addToast: (type: ToastType, message: string) => void;
    removeToast: (id: string) => void;
}

export const useToastStore = create<ToastState>((set) => ({
    toasts: [],

    addToast: (type, message) => {
        const trimmed = message?.trim();
        if (!trimmed) return;

        const id = `${Date.now()}-${Math.random()}`;
        set((state) => ({
            toasts: [...state.toasts, { id, type, message: trimmed }].slice(-5),
        }));

        // Auto-remove after 5 seconds
        setTimeout(() => {
            set((state) => ({
                toasts: state.toasts.filter((toast) => toast.id !== id),
            }));
        }, 5000);
    },

    removeToast: (id) =>
        set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id),
        })),
}));

/**
 * Toast helper functions
 */
export const toast = {
    success: (message: string) => useToastStore.getState().addToast("success", message),
    error: (message: string) => useToastStore.getState().addToast("error", message),
    info: (message: string) => useToastStore.getState().addToast("info", message),
};
