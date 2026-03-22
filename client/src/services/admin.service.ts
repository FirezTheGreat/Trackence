import { apiPatch } from "./api";

export const adminAPI = {
    /**
     * Update user name (Super Admin only)
     */
    updateUserName: async (userId: string, name: string) => {
        return apiPatch<{ message: string; user: { userId: string; name: string; email: string } }>(
            `/api/admin/users/${userId}/name`,
            { name }
        );
    }
};
