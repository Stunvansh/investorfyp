import axios from 'axios'

import { parseListEnvelope } from './apiResponseParser'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://127.0.0.1:8000/api'
const TOKEN_KEY = 'ventureledger_access_token'

const api = axios.create({
  baseURL: API_BASE,
  timeout: 15000,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

export type Role = 'entrepreneur' | 'investor' | 'admin'

export type User = {
  id: number
  email: string
  first_name: string
  last_name: string
  role: Role
  verified: boolean
  frozen: boolean
  business_idea?: string
  funding_required?: string
  startup_documents?: string
  investment_interest?: string
  budget_range?: string
}

export type Proposal = {
  id: number
  entrepreneur: number
  entrepreneur_email?: string
  title: string
  startup_details: string
  description: string
  category: string
  required_funding: string
  timeline: string
  document_name: string
  pitch_video_url: string
  status: 'pending' | 'approved'
  milestone: 'Not Started' | 'In Progress' | 'Completed'
}

export type Signal = {
  id: number
  proposal: number
  investor: number
  entrepreneur: number
  signal_type: 'interest' | 'contact' | 'meeting'
  status: 'pending' | 'accepted' | 'rejected'
  message?: string
  investor_email?: string
  entrepreneur_email?: string
}

export type Tx = {
  id: number
  proposal: number
  action: 'invest' | 'release' | 'refund'
  method: 'virtual-escrow' | 'stripe' | 'jazzcash' | 'easypaisa'
  amount: string
  notes?: string
  created_at: string
}

export type ChatRoom = {
  id: number
  proposal: number
  proposal_title: string
  last_message?: string
  last_message_at?: string
  unread_count?: number
}

export type Message = {
  id: number
  proposal: number
  sender: number
  recipient: number
  sender_email?: string
  recipient_email?: string
  content: string
  is_read: boolean
  created_at: string
}

export function saveToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export async function checkHealth() {
  const res = await axios.get(`${API_BASE}/health/`)
  return res.data
}

export async function register(payload: {
  email: string
  password: string
  first_name: string
  last_name: string
  role: Role
}) {
  const res = await api.post('/auth/register/', payload)
  return res.data
}

export async function login(payload: { email: string; password: string }) {
  const res = await api.post('/auth/token/', payload)
  return res.data as { access: string; refresh: string }
}

export async function getMe() {
  const res = await api.get('/auth/me/')
  return res.data as User
}

export async function patchMe(payload: Partial<User>) {
  const res = await api.patch('/auth/me/', payload)
  return res.data as User
}

export async function getUsers() {
  const res = await api.get('/auth/users/')
  return parseListEnvelope<User>(res.data).data
}

export async function patchUserFlags(userId: number, payload: { verified?: boolean; frozen?: boolean }) {
  const res = await api.patch(`/auth/users/${userId}/`, payload)
  return res.data as User
}

export async function getProposals(params?: { category?: string; max_budget?: number }) {
  const res = await api.get('/proposals/', { params })
  return parseListEnvelope<Proposal>(res.data).data
}

export async function createProposal(payload: Partial<Proposal>) {
  const res = await api.post('/proposals/', payload)
  return res.data as Proposal
}

export async function approveProposal(id: number) {
  const res = await api.post(`/proposals/${id}/approve/`)
  return res.data as Proposal
}

export async function patchProposal(id: number, payload: Partial<Proposal>) {
  const res = await api.patch(`/proposals/${id}/`, payload)
  return res.data as Proposal
}

export async function updateProposalMilestone(id: number, milestone: Proposal['milestone']) {
  const res = await api.post(`/proposals/${id}/set_milestone/`, { milestone })
  return res.data as Proposal
}

export async function getSignals() {
  const res = await api.get('/signals/')
  return parseListEnvelope<Signal>(res.data).data
}

export async function createSignal(payload: {
  proposal: number
  signal_type?: Signal['signal_type']
  message?: string
}) {
  const res = await api.post('/signals/', payload)
  return res.data as Signal
}

export async function updateSignalStatus(id: number, status: Signal['status']) {
  const res = await api.patch(`/signals/${id}/`, { status })
  return res.data as Signal
}

export async function getTransactions() {
  const res = await api.get('/transactions/')
  return parseListEnvelope<Tx>(res.data).data
}

export async function createTransaction(payload: {
  proposal: number
  amount: number
  action: Tx['action']
  method: Tx['method']
  notes?: string
}) {
  const res = await api.post('/transactions/', payload)
  return res.data as Tx
}

export async function getWalletBalance() {
  const res = await api.get('/wallet/balance/')
  return res.data as {
    max_balance: string
    invested_total: string
    refunded_total: string
    in_escrow: string
    available_balance: string
  }
}

export async function getEscrowSummary() {
  const res = await api.get('/escrow-summary/')
  return res.data as {
    total_escrow: string
    proposals: Array<{ proposal_id: number; title: string; escrow: string }>
  }
}

export async function getChatRooms() {
  const res = await api.get('/messages/chats/')
  return parseListEnvelope<ChatRoom>(res.data).data
}

export async function getMessages(proposalId: number) {
  const res = await api.get(`/messages/proposal/${proposalId}/`)
  return parseListEnvelope<Message>(res.data).data
}

export async function sendMessage(payload: { proposal: number; content: string }) {
  const res = await api.post('/messages/send/', payload)
  return res.data as Message
}

export async function markMessageAsRead(messageId: number) {
  const res = await api.post(`/messages/${messageId}/read/`)
  return res.data
}

export async function getUnreadCount() {
  const res = await api.get('/messages/unread-count/')
  return res.data as {
    total: number
    by_proposal: Array<{ proposal: number; count: number }>
  }
}

export async function createPaymentIntent(payload: { proposal: number; amount: number }) {
  const res = await api.post('/payments/create-intent/', payload)
  return res.data as {
    id: number
    intent_id: string
    client_secret: string
    status: string
  }
}

export async function getPaymentStatus(intentId: string) {
  const res = await api.get(`/payments/status/${intentId}/`)
  return res.data as {
    intent_id: string
    status: string
    amount: string
  }
}
