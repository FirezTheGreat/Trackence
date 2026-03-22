import React, { useState, useEffect } from "react";
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

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="backdrop-blur-2xl bg-secondary/95 border border-white/20 rounded-2xl px-8 py-8 shadow-2xl shadow-black/40 max-w-md w-full">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <h2 className="text-2xl text-white font-semibold">Edit Organization</h2>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-white/50 hover:text-white transition disabled:opacity-50"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {/* Name */}
                    <div>
                        <label className="text-white/70 text-sm mb-2 block font-medium">
                            Organization Name *
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g., Computer Science Department"
                            disabled={isLoading}
                            className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20
                text-white placeholder-white/30 focus:outline-none focus:border-accent/50
                disabled:opacity-50 transition"
                            required
                        />
                    </div>

                    {/* Description */}
                    <div>
                        <label className="text-white/70 text-sm mb-2 block font-medium">Description</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            placeholder="Enter organization description (optional)"
                            disabled={isLoading}
                            rows={4}
                            className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20
                text-white placeholder-white/30 focus:outline-none focus:border-accent/50
                disabled:opacity-50 transition resize-none"
                        />
                    </div>

                    {/* Error message */}
                    {error && (
                        <div className="bg-red-500/20 border border-red-400/40 rounded-lg px-4 py-3 text-red-400 text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3 pt-4">
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 rounded-xl border border-white/20 text-white
                hover:bg-white/5 transition disabled:opacity-50 font-medium"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isLoading}
                            className="flex-1 px-4 py-3 rounded-xl bg-accent/20 border border-accent/40
                text-accent hover:bg-accent/30 transition disabled:opacity-50 font-medium"
                        >
                            {isLoading ? "Saving..." : "Save Changes"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default EditOrgModal;
