import { apiPost } from "./api";

export type LeadRequestIntent = "free_pilot" | "book_demo";

export interface LeadInquiryPayload {
    instituteName: string;
    instituteType: string;
    studentCount: number;
    contactPerson: string;
    phoneOrWhatsapp: string;
    email: string;
    requestIntent: LeadRequestIntent;
}

export interface LeadInquiryResponse {
    message: string;
}

export const leadAPI = {
    submitLeadInquiry: async (payload: LeadInquiryPayload) => {
        return apiPost<LeadInquiryResponse>("/api/system/lead-inquiries", payload, {
            skipAuth: true,
        });
    },
};