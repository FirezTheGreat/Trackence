import { create } from "zustand";

type ModalType = "alert" | "confirm" | "prompt";

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  inputValue?: string;
  placeholder?: string;
  onConfirm: (val?: string) => void;
  onCancel: () => void;
  setInputValue: (val: string) => void;
}

interface ModalStore extends ModalState {
  alert: (title: string, message: string) => Promise<void>;
  confirm: (title: string, message: string, options?: { confirmText?: string; cancelText?: string }) => Promise<boolean>;
  prompt: (title: string, message: string, options?: { confirmText?: string; cancelText?: string; defaultValue?: string; placeholder?: string }) => Promise<string | null>;
  close: () => void;
}

export const useModalStore = create<ModalStore>((set, get) => ({
  isOpen: false,
  type: "alert",
  title: "",
  message: "",
  confirmText: "OK",
  cancelText: "Cancel",
  inputValue: "",
  placeholder: "",
  onConfirm: () => {},
  onCancel: () => {},
  setInputValue: (val) => set({ inputValue: val }),

  alert: (title, message) => {
    return new Promise<void>((resolve) => {
      set({
        isOpen: true,
        type: "alert",
        title,
        message,
        confirmText: "OK",
        onConfirm: () => {
          set({ isOpen: false });
          resolve();
        },
        onCancel: () => {
          set({ isOpen: false });
          resolve();
        },
      });
    });
  },

  confirm: (title, message, options) => {
    return new Promise<boolean>((resolve) => {
      set({
        isOpen: true,
        type: "confirm",
        title,
        message,
        confirmText: options?.confirmText || "Confirm",
        cancelText: options?.cancelText || "Cancel",
        onConfirm: () => {
          set({ isOpen: false });
          resolve(true);
        },
        onCancel: () => {
          set({ isOpen: false });
          resolve(false);
        },
      });
    });
  },

  prompt: (title, message, options) => {
    return new Promise<string | null>((resolve) => {
      set({
        isOpen: true,
        type: "prompt",
        title,
        message,
        inputValue: options?.defaultValue || "",
        placeholder: options?.placeholder || "",
        confirmText: options?.confirmText || "Confirm",
        cancelText: options?.cancelText || "Cancel",
        onConfirm: () => {
          const val = get().inputValue;
          set({ isOpen: false });
          resolve(val || null);
        },
        onCancel: () => {
          set({ isOpen: false });
          resolve(null);
        },
      });
    });
  },

  close: () => set({ isOpen: false }),
}));
