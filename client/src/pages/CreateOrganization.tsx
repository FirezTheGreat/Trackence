import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { organizationAPI } from "../services/organization.service";
import { useAuthStore } from "../stores/auth.store";
import { toast } from "../stores/toast.store";
import { CheckCircle2, Hash, Building2, AlignLeft, ShieldCheck } from "lucide-react";

const CreateOrganization = () => {
    const navigate = useNavigate();
    const { checkAuth } = useAuthStore();
    const [actionLoading, setActionLoading] = useState(false);
    const [newOrg, setNewOrg] = useState({ name: "", code: "", description: "" });

    const handleCreateOrganization = async (e: React.FormEvent) => {
        e.preventDefault();
        setActionLoading(true);
        try {
            const data = await organizationAPI.create({
                name: newOrg.name.trim(),
                code: newOrg.code.trim().toUpperCase(),
                description: newOrg.description.trim(),
            });

            toast.success(data.message || "Organization created successfully!");
            await checkAuth();
            navigate("/organizations");
        } catch (err: any) {
            toast.error(err.message || "Failed to create organization.");
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
            <div className="w-full max-w-2xl backdrop-blur-3xl bg-secondary/40 border border-white/10 rounded-3xl p-8 md:p-12 shadow-2xl relative overflow-hidden">
                {/* Decorative Elements */}
                <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 bg-accent/20 rounded-full blur-[80px] pointer-events-none" />
                <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-48 h-48 bg-blue-500/20 rounded-full blur-[80px] pointer-events-none" />

                <div className="relative z-10">
                    <div className="mb-10 text-center">
                        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-linear-to-br from-accent/20 to-accent/5 border border-accent/20 mb-6 shadow-inner">
                            <ShieldCheck className="w-8 h-8 text-accent" />
                        </div>
                        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3 tracking-tight">Create Organization</h1>
                        <p className="text-white/60 text-lg">Build a new workspace and invite your team.</p>
                    </div>

                    <form onSubmit={handleCreateOrganization} className="space-y-6">
                        <div className="space-y-4">
                            <div className="relative group">
                                <label className="text-white/80 text-sm font-medium mb-1.5 block ml-1">Organization Name</label>
                                <div className="relative h-14">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Building2 className="w-5 h-5 text-white/40 group-focus-within:text-accent transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="e.g., Computer Science Department"
                                        value={newOrg.name}
                                        onChange={(e) => setNewOrg((prev) => ({ ...prev, name: e.target.value }))}
                                        className="w-full h-full pl-11 pr-4 bg-black/20 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all outline-none"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="relative group">
                                <label className="text-white/80 text-sm font-medium mb-1.5 flex items-center justify-between ml-1">
                                    <span>Join Code</span>
                                    <span className="text-white/40 text-xs font-normal">Min 2 chars, letters/numbers/hyphens</span>
                                </label>
                                <div className="relative h-14">
                                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                                        <Hash className="w-5 h-5 text-white/40 group-focus-within:text-accent transition-colors" />
                                    </div>
                                    <input
                                        type="text"
                                        placeholder="e.g., MIT-CSE"
                                        value={newOrg.code}
                                        onChange={(e) => setNewOrg((prev) => ({ ...prev, code: e.target.value.toUpperCase() }))}
                                        maxLength={20}
                                        className="w-full h-full pl-11 pr-4 bg-black/20 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all outline-none font-mono tracking-wider"
                                        required
                                    />
                                </div>
                            </div>

                            <div className="relative group">
                                <label className="text-white/80 text-sm font-medium mb-1.5 block ml-1">Description <span className="text-white/40 font-normal">(Optional)</span></label>
                                <div className="relative">
                                    <div className="absolute top-4 left-0 pl-4 pointer-events-none">
                                        <AlignLeft className="w-5 h-5 text-white/40 group-focus-within:text-accent transition-colors" />
                                    </div>
                                    <textarea
                                        placeholder="Briefly describe your organization..."
                                        value={newOrg.description}
                                        onChange={(e) => setNewOrg((prev) => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="w-full pl-11 pr-4 py-4 bg-black/20 border border-white/10 rounded-xl text-white placeholder:text-white/20 focus:border-accent/50 focus:ring-1 focus:ring-accent/50 transition-all outline-none resize-none"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="pt-4 flex flex-col sm:flex-row gap-4">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="flex-1 py-4 px-6 rounded-xl border border-white/10 text-white/70 font-medium hover:bg-white/5 hover:text-white transition-all order-2 sm:order-1 cursor-pointer"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={actionLoading || !newOrg.name || !newOrg.code}
                                className="flex-1 py-4 px-6 rounded-xl bg-linear-to-r from-accent to-accent/90 text-black font-semibold hover:from-accent/90 hover:to-accent/80 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 group order-1 sm:order-2 shadow-lg shadow-accent/20 cursor-pointer"
                            >
                                {actionLoading ? (
                                    <>Creating...</>
                                ) : (
                                    <>
                                        Create Organization
                                        <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
                                    </>
                                )}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default CreateOrganization;