import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { OrgDetail } from "../../types/organizations.types";

interface Props {
    isOpen: boolean;
    org: OrgDetail | null;
    onClose: () => void;
    onSubmit: (data: { name: string; description: string }) => Promise<void>;
    isLoading: boolean;
}

const EditOrgModal = ({ isOpen, org, onClose, onSubmit, isLoading }: Props) => {
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [error, setError] = useState("");

    useEffect(() => {
        if (org) {
            setName(org.name);
            setDescription(org.description || "");
            setError("");
        }
    }, [org, isOpen]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");

        if (!name.trim()) {
            setError("Organization name is required.");
            return;
        }

        try {
            await onSubmit({ name: name.trim(), description: description.trim() });
            onClose();
        } catch (err: any) {
            setError(err.message || "Failed to update organization.");
        }
    };

    if (!isOpen || !org) return null;

    const modalContent = (
        <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center backdrop-blur-sm bg-black/40 p-4 sm:p-4 py-6">
            <div className="backdrop-blur-2xl bg-secondary/65 border border-white/20 rounded-2xl px-5 py-6 sm:px-8 sm:py-8 shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-xl text-white font-semibold tracking-tight">✏️ Edit Organization</h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-white/50 hover:text-white transition disabled:opacity-50 cursor-pointer"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {/* Name */}
                    <div>
                        <label className="block text-white/70 text-sm mb-2 font-medium">
                            Organization Name <span className="text-red-400">*</span>
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Computer Science Department"
                            disabled={isLoading}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all text-sm disabled:opacity-50"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="block text-white/70 text-sm mb-2 font-medium">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter organization description (optional)"
                            disabled={isLoading}
                            rows={3}
                            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all text-sm resize-none disabled:opacity-50"
                        />
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-xl font-semibold border border-accent/40 text-accent bg-accent/10 hover:bg-accent/20 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                            {isLoading ? "Saving..." : "Save Changes"}
                        </button>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-2.5 rounded-xl font-semibold border border-white/10 text-white/70 hover:bg-white/10 hover:text-white transition-all cursor-pointer disabled:opacity-50 text-sm"
                        >
                            Cancel
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );

    if (typeof document === "undefined") return modalContent;
    return createPortal(modalContent, document.body);
};

export default EditOrgModal;
