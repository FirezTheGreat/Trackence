/**
 * API Wrapper with automatic error handling and authentication
 */

import { useAuthStore } from "../stores/auth.store";

const configuredApiUrl = String(import.meta.env.VITE_BACKEND_URL || "").trim();

const API_URL = (() => {
    // Keep localhost/127.0.0.1 aligned with the current browser host to avoid
    // cross-site cookie issues that can cause unexpected /auth/login redirects.
    const fallbackPort = "5000";

    if (!configuredApiUrl) {
        const protocol = window.location.protocol || "http:";
        const host = window.location.hostname || "localhost";
        return `${protocol}//${host}:${fallbackPort}`;
    }

    try {
        const parsed = new URL(configuredApiUrl);
        const isLocal = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";

        if (isLocal) {
            const protocol = parsed.protocol || window.location.protocol || "http:";
            const host = window.location.hostname || parsed.hostname;
            const port = parsed.port || fallbackPort;
            return `${protocol}//${host}:${port}`;
        }
    } catch {
        // Fall back to the configured value if parsing fails.
    }

    return configuredApiUrl;
})();

export class APIError extends Error {
    status: number;
    statusText: string;

    constructor(status: number, statusText: string, message: string) {
        super(message);
        this.name = "APIError";
        this.status = status;
        this.statusText = statusText;
    }
}

interface FetchOptions extends RequestInit {
    skipAuth?: boolean;
    attemptRefreshOn401?: boolean;
    _retryAfterRefresh?: boolean;
    timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;

let refreshInFlight: Promise<boolean> | null = null;

async function tryRefreshSession(): Promise<boolean> {
    if (refreshInFlight) return refreshInFlight;

    refreshInFlight = (async () => {
        try {
            const response = await fetch(`${API_URL}/api/auth/refresh`, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
            });

            return response.ok;
        } catch {
            return false;
        } finally {
            refreshInFlight = null;
        }
    })();

    return refreshInFlight;
}

/**
 * Base fetch wrapper with credentials and error handling
 */
export async function apiFetch<T = any>(
    endpoint: string,
    options: FetchOptions = {}
): Promise<T> {
    const {
        skipAuth,
        attemptRefreshOn401 = false,
        _retryAfterRefresh,
        timeoutMs = DEFAULT_TIMEOUT_MS,
        ...fetchOptions
    } = options;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const config: RequestInit = {
        ...fetchOptions,
        signal: controller.signal,
        credentials: "include", // Always include cookies
        headers: {
            "Content-Type": "application/json",
            ...fetchOptions.headers,
        },
    };

    try {
        const response = await fetch(`${API_URL}${endpoint}`, config);
        clearTimeout(timeout);

        // Handle 401 - Unauthorized
        if (response.status === 401) {
            const canTryRefresh = !skipAuth || attemptRefreshOn401;

            if (canTryRefresh && !_retryAfterRefresh) {
                const refreshed = await tryRefreshSession();
                if (refreshed) {
                    return apiFetch<T>(endpoint, {
                        ...options,
                        _retryAfterRefresh: true,
                    });
                }
            }

            if (skipAuth) {
                throw new APIError(401, "Unauthorized", "Not authenticated.");
            }

            useAuthStore.getState().clearUser();
            window.location.href = "/auth/login";
            throw new APIError(401, "Unauthorized", "Session expired. Please log in again.");
        }

        // Handle 403 - Forbidden
        if (response.status === 403) {
            throw new APIError(
                403,
                "Forbidden",
                "You don't have permission to perform this action."
            );
        }

        // Handle 404 - Not Found
        if (response.status === 404) {
            throw new APIError(404, "Not Found", "The requested resource was not found.");
        }

        // Handle 500 - Server Error
        if (response.status >= 500) {
            throw new APIError(
                response.status,
                response.statusText,
                "Server error. Please try again later."
            );
        }

        // Handle other errors
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new APIError(
                response.status,
                response.statusText,
                errorData.message || `Request failed: ${response.statusText}`
            );
        }

        // Parse JSON response
        const contentType = response.headers.get("content-type");
        if (contentType && contentType.includes("application/json")) {
            return (await response.json()) as T;
        }

        // Return null for no-content responses
        if (response.status === 204) {
            return null as T;
        }

        // Return response as is for non-JSON
        return response as any;
    } catch (error) {
        clearTimeout(timeout);

        if (error instanceof APIError) {
            throw error;
        }

        if (error instanceof DOMException && error.name === "AbortError") {
            throw new APIError(
                408,
                "Request Timeout",
                "The request timed out. Please check your connection and try again."
            );
        }

        // Network errors
        if (error instanceof TypeError) {
            throw new APIError(0, "Network Error", "Unable to connect to server.");
        }

        throw error;
    }
}

/**
 * GET request
 */
export async function apiGet<T = any>(
    endpoint: string,
    options?: FetchOptions
): Promise<T> {
    return apiFetch<T>(endpoint, {
        ...options,
        method: "GET",
        cache: "no-store",
        headers: {
            "Cache-Control": "no-cache, no-store, must-revalidate",
            Pragma: "no-cache",
            Expires: "0",
            ...(options?.headers || {}),
        },
    });
}

/**
 * POST request
 */
export async function apiPost<T = any>(
    endpoint: string,
    data?: any,
    options?: FetchOptions
): Promise<T> {
    return apiFetch<T>(endpoint, {
        ...options,
        method: "POST",
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * PUT request
 */
export async function apiPut<T = any>(
    endpoint: string,
    data?: any,
    options?: FetchOptions
): Promise<T> {
    return apiFetch<T>(endpoint, {
        ...options,
        method: "PUT",
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * PATCH request
 */
export async function apiPatch<T = any>(
    endpoint: string,
    data?: any,
    options?: FetchOptions
): Promise<T> {
    return apiFetch<T>(endpoint, {
        ...options,
        method: "PATCH",
        body: data ? JSON.stringify(data) : undefined,
    });
}

/**
 * DELETE request
 */
export async function apiDelete<T = any>(
    endpoint: string,
    options?: FetchOptions
): Promise<T> {
    return apiFetch<T>(endpoint, { ...options, method: "DELETE" });
}
