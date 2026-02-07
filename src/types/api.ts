// API types for external communication
// To be expanded in future epics

export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: string;
}
