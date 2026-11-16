import { apiRequest, jsonRequest } from './apiClient'

export type LoanRequestStatus = '待审批' | '已批准' | '已拒绝'

export interface LoanRequest {
  id: string
  assetId: string
  assetName: string
  borrower: string
  dueDate: string
  requestedBy: string
  requestedAt: string
  status: LoanRequestStatus
  reviewedAt: string
}

export const loanRequestApi = {
  async list(): Promise<LoanRequest[]> {
    return apiRequest<LoanRequest[]>('/api/loan-requests')
  },

  async create(assetId: string, borrower: string, dueDate: string): Promise<LoanRequest> {
    return apiRequest<LoanRequest>(
      '/api/loan-requests',
      jsonRequest('POST', { assetId, borrower, dueDate }),
    )
  },

  async review(id: string, action: 'approve' | 'reject'): Promise<LoanRequest> {
    return apiRequest<LoanRequest>(
      `/api/loan-requests/${encodeURIComponent(id)}/review`,
      jsonRequest('POST', { action }),
    )
  },
}
