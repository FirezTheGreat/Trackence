import React from "react";

interface Props {
    newOrg: { name: string; code: string; description: string };
    setNewOrg: React.Dispatch<React.SetStateAction<{ name: string; code: string; description: string }>>;
    actionLoading: boolean;
    onSubmit: (e: React.FormEvent) => void;
}

const CreateOrgForm = ({ newOrg, setNewOrg, actionLoading, onSubmit }: Props) => (
    <section className="backdrop-blur-2xl bg-secondary/50 border border-white/10 rounded-2xl px-8 py-8 shadow-lg shadow-black/10 max-w-xl">
        <h2 className="text-xl text-white mb-6 font-semibold">Create New Organization</h2>
        <form onSubmit={onSubmit} className="flex flex-col gap-5">
            <div>
                <label className="text-white/70 text-sm mb-1 block">Organization Name *</label>
                <input
                    type="text"
                    placeholder="e.g., Computer Science Department"
                    value={newOrg.name}
                    onChange={(e) => setNewOrg((prev) => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20
            text-white placeholder-white/30 focus:outline-none focus:border-accent/50"
                    required
                />
            </div>
            <div>
                <label className="text-white/70 text-sm mb-1 block">Join Code *</label>
                <input
                    type="text"
                    placeholder="e.g., MIT-CSE"
                    value={newOrg.code}
                    onChange={(e) => setNewOrg((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                    maxLength={20}
                    className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20
            text-white placeholder-white/30 focus:outline-none focus:border-accent/50 font-mono"
                    required
                />
                <p className="text-white/40 text-xs mt-1">2-20 chars, letters/numbers/hyphens</p>
            </div>
            <div>
                <label className="text-white/70 text-sm mb-1 block">Description</label>
                <textarea
                    placeholder="Optional description..."
                    value={newOrg.description}
                    onChange={(e) => setNewOrg((prev) => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full px-4 py-3 rounded-xl bg-secondary/60 border border-white/20
            text-white placeholder-white/30 focus:outline-none focus:border-accent/50 resize-none"
                />
            </div>
            <button
                type="submit"
                disabled={actionLoading || !newOrg.name || !newOrg.code}
                className="mt-2 px-6 py-3 rounded-xl bg-accent/20 border border-accent/40
          text-accent font-semibold hover:bg-accent/30 transition
          disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
                {actionLoading ? "Creating..." : "Create Organization"}
            </button>
        </form>
    </section>
);

export default CreateOrgForm;
