import { create } from "zustand";

type ModalType = "alert" | "confirm";

interface ModalState {
  isOpen: boolean;
  type: ModalType;
  title: string;
  message: string;
  confirmText: string;
  cancelText: string;
  onConfirm: () => void;
  onCancel: () => void;
}

interface ModalStore extends ModalState {
  alert: (title: string, message: string) => Promise<void>;
  confirm: (title: string, message: string, options?: { confirmText?: string; cancelText?: string }) => Promise<boolean>;
  close: () => void;
}

export const useModalStore = create<ModalStore>((set) => ({
  isOpen: false,
  type: "alert",
  title: "",
  message: "",
  confirmText: "OK",
  cancelText: "Cancel",
  onConfirm: () => {},
  onCancel: () => {},

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

  close: () => set({ isOpen: false }),
}));
