import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { loadStripe } from '@stripe/stripe-js'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Bell,
  Briefcase,
  CircleHelp,
  Clock3,
  DollarSign,
  Download,
  Eye,
  FileText,
  Filter,
  Globe2,
  History,
  Landmark,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  MoreVertical,
  PlusCircle,
  RefreshCcw,
  Rocket,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  Trash2,
  TrendingUp,
  Users,
  Video,
  Wallet,
  XCircle,
} from 'lucide-react'

import {
  approveProposal,
  checkHealth,
  clearToken,
  createAgreement,
  createPaymentIntent,
  createProposal,
  createSignal,
  createTransaction,
  deleteProposal,
  deleteUser,
  downloadProtectedFile,
  getAdminUser,
  getChatRooms,
  getEscrowSummary,
  getMe,
  getMessages,
  getPaymentStatus,
  getProposals,
  getSignals,
  getTransactions,
  getUnreadCount,
  getUsers,
  getWalletBalance,
  login,
  markMessageAsRead,
  patchMe,
  patchVerification,
  patchProposal,
  patchUserFlags,
  register,
  reviewUserVerification,
  saveTokens,
  sendMessage,
  updateProposalMilestone,
  updateSignalStatus,
} from './lib/api'
import type { ChatRoom, Message, Proposal, Signal, Tx, User } from './lib/api'
import './App.css'

type Page = 'landing' | 'auth' | 'profile' | 'dashboard' | 'proposals' | 'wallet' | 'chat' | 'admin'

function formatMoney(value: string | number | null | undefined) {
  const numeric = Number(value ?? 0)
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(numeric) ? numeric : 0)
}

function initials(label: string) {
  return label
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function milestoneProgress(milestone: Proposal['milestone']) {
  if (milestone === 'Completed') return 100
  if (milestone === 'In Progress') return 58
  return 18
}

function statusTone(status: string) {
  if (status === 'approved' || status === 'accepted' || status === 'completed') return 'tone-success'
  if (status === 'pending') return 'tone-info'
  if (status === 'rejected' || status === 'refund' || status === 'refunded') return 'tone-danger'
  return 'tone-neutral'
}

function actionTone(action: string) {
  if (action === 'invest' || action === 'release') return 'tone-info'
  if (action === 'refund') return 'tone-danger'
  return 'tone-neutral'
}

function compactText(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function formatRelativeTime(value: string | null | undefined) {
  if (!value) return 'N/A'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'N/A'
  const diffMs = date.getTime() - Date.now()
  const absMs = Math.abs(diffMs)
  const divisions: Array<[Intl.RelativeTimeFormatUnit, number]> = [
    ['year', 1000 * 60 * 60 * 24 * 365],
    ['month', 1000 * 60 * 60 * 24 * 30],
    ['day', 1000 * 60 * 60 * 24],
    ['hour', 1000 * 60 * 60],
    ['minute', 1000 * 60],
  ]
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, amount] of divisions) {
    if (absMs >= amount || unit === 'minute') {
      return formatter.format(Math.round(diffMs / amount), unit)
    }
  }
  return 'just now'
}

function verificationStatus(user: User) {
  return user.verification?.status ?? (user.verified ? 'approved' : 'draft')
}

const STRIPE_PK = (import.meta.env.VITE_STRIPE_PUBLIC_KEY as string) || ''
const stripePromise = STRIPE_PK ? loadStripe(STRIPE_PK) : null

function StripeCheckoutForm({ onSuccess, onError }: { onSuccess: () => void; onError: (msg: string) => void }) {
  const stripe = useStripe()
  const elements = useElements()
  const [paying, setPaying] = useState(false)

  async function handlePay(e: FormEvent) {
    e.preventDefault()
    if (!stripe || !elements) return
    setPaying(true)
    const { error } = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
      confirmParams: { return_url: window.location.href },
    })
    setPaying(false)
    if (error) {
      onError(error.message || 'Payment failed. Please try again.')
    } else {
      onSuccess()
    }
  }

  return (
    <form onSubmit={handlePay} className="stripe-checkout-form">
      <PaymentElement />
      <button type="submit" disabled={!stripe || paying} className="button-primary button-primary--full" style={{ marginTop: '1rem' }}>
        {paying ? 'Processing…' : 'Confirm Payment'}
      </button>
    </form>
  )
}

function App() {
  const isAdminRoute = window.location.pathname.toLowerCase().includes('/admin')
  const [apiStatus, setApiStatus] = useState<'checking' | 'online' | 'offline'>('checking')
  const [page, setPage] = useState<Page>(isAdminRoute ? 'auth' : 'landing')
  const [adminView, setAdminView] = useState<'users' | 'proposals' | 'escrow' | 'logs'>('users')
  const [authMode, setAuthMode] = useState<'signup' | 'login'>('login')
  const [authRole, setAuthRole] = useState<'entrepreneur' | 'investor'>('entrepreneur')
  const [workspaceQuery, setWorkspaceQuery] = useState('')
  const [investorProposalFilter, setInvestorProposalFilter] = useState<'all' | 'approved' | 'pending'>('all')
  const [adminUserFilter, setAdminUserFilter] = useState<'all' | 'active' | 'frozen'>('all')
  const [adminProposalFilter, setAdminProposalFilter] = useState<'all' | 'pending' | 'approved'>('all')
  const [openActionMenu, setOpenActionMenu] = useState<number | null>(null)
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const [showKycModal, setShowKycModal] = useState(false)
  const [kycSubmitting, setKycSubmitting] = useState(false)
  const [selectedEntrepreneurId, setSelectedEntrepreneurId] = useState<number | null>(null)
  const [showKycApprovedBanner, setShowKycApprovedBanner] = useState(false)
  const [proposalSubmitting, setProposalSubmitting] = useState(false)

  const [showKycDetailModal, setShowKycDetailModal] = useState(false)
  const [kycDetailTarget, setKycDetailTarget] = useState<User | null>(null)
  const [kycDetailLoading, setKycDetailLoading] = useState(false)
  const [showRejectionModal, setShowRejectionModal] = useState(false)
  const [rejectionMessage, setRejectionMessage] = useState('')
  const [kycRejectionTarget, setKycRejectionTarget] = useState<User | null>(null)

  const [user, setUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])

  const [proposals, setProposals] = useState<Proposal[]>([])
  const [signals, setSignals] = useState<Signal[]>([])
  const [transactions, setTransactions] = useState<Tx[]>([])
  const [chats, setChats] = useState<ChatRoom[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [selectedProposalId, setSelectedProposalId] = useState<number | null>(null)
  const [walletBalance, setWalletBalance] = useState<{
    max_balance: string
    invested_total: string
    refunded_total: string
    in_escrow: string
    available_balance: string
  } | null>(null)
  const [escrowSummary, setEscrowSummary] = useState<{ total_escrow: string; proposals: Array<{ proposal_id: number; title: string; escrow: string }> } | null>(null)
  const [unreadTotal, setUnreadTotal] = useState(0)

  const [messageDraft, setMessageDraft] = useState('')
  const [statusText, setStatusText] = useState('')

  const [authForm, setAuthForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    password: '',
  })

  const [proposalForm, setProposalForm] = useState({
    title: '',
    startup_details: '',
    description: '',
    category: '',
    required_funding: 0,
    timeline: '',
    document_name: '',
    pitch_video_url: '',
    startup_website_url: '',
    proof_video_url: '',
  })
  const [proposalDocumentFile, setProposalDocumentFile] = useState<File | null>(null)
  const [proposalFormKey, setProposalFormKey] = useState(0)

  const [verificationForm, setVerificationForm] = useState({
    phone_number: '',
    address: '',
    identity_type: 'cnic' as 'cnic' | 'passport',
    identity_number: '',
    startup_website_url: '',
    proof_video_url: '',
    linkedin_url: '',
    twitter_url: '',
    facebook_url: '',
    instagram_url: '',
  })
  const [verificationFiles, setVerificationFiles] = useState<Record<string, File | null>>({})

  const [walletForm, setWalletForm] = useState({
    method: 'virtual-escrow' as 'virtual-escrow' | 'stripe',
    proposal: 0,
    amount: 1000,
    equity_percentage: '',
    profit_share_percentage: '',
    expected_return_note: 'Returns depend on startup performance, agreed milestones, and admin escrow settlement.',
    term_months: 12,
    accepted_name: '',
    accept_terms: false,
  })

  const [pendingIntentId, setPendingIntentId] = useState('')
  const [stripeClientSecret, setStripeClientSecret] = useState('')
  const [navOpen, setNavOpen] = useState(false)

  const investorRequests = useMemo(() => {
    if (!user || user.role !== 'entrepreneur') return []
    return signals.filter((signal) => signal.status === 'pending')
  }, [signals, user])

  const selectedProposal = useMemo(
    () => proposals.find((proposal) => proposal.id === selectedProposalId) ?? null,
    [proposals, selectedProposalId],
  )

  const approvedProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'approved'),
    [proposals],
  )

  const pendingProposals = useMemo(
    () => proposals.filter((proposal) => proposal.status === 'pending'),
    [proposals],
  )

  const normalizedQuery = useMemo(() => workspaceQuery.trim().toLowerCase(), [workspaceQuery])

  const visibleProposals = useMemo(() => {
    if (!normalizedQuery) return proposals
    return proposals.filter((proposal) =>
      [proposal.title, proposal.category, proposal.startup_details, proposal.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    )
  }, [proposals, normalizedQuery])

  const visibleApprovedProposals = useMemo(
    () => approvedProposals.filter((proposal) => visibleProposals.some((candidate) => candidate.id === proposal.id)),
    [approvedProposals, visibleProposals],
  )

  const uniqueEntrepreneurs = useMemo(() => {
    const map = new Map<number, { id: number; email: string; proposalCount: number; totalFunding: number }>()
    for (const p of proposals) {
      if (!map.has(p.entrepreneur)) {
        map.set(p.entrepreneur, {
          id: p.entrepreneur,
          email: p.entrepreneur_email || `User #${p.entrepreneur}`,
          proposalCount: 0,
          totalFunding: 0,
        })
      }
      const entry = map.get(p.entrepreneur)!
      entry.proposalCount++
      entry.totalFunding += Number(p.required_funding || 0)
    }
    return Array.from(map.values())
  }, [proposals])

  const filteredInvestorMarketplaceProposals = useMemo(() => {
    let filtered = selectedEntrepreneurId !== null
      ? visibleProposals.filter((proposal) => proposal.entrepreneur === selectedEntrepreneurId)
      : visibleProposals
    if (investorProposalFilter === 'approved') {
      return filtered.filter((proposal) => proposal.status === 'approved')
    }
    if (investorProposalFilter === 'pending') {
      return filtered.filter((proposal) => proposal.status === 'pending')
    }
    return filtered
  }, [visibleProposals, investorProposalFilter, selectedEntrepreneurId])

  const visibleChats = useMemo(() => {
    if (!normalizedQuery) return chats
    return chats.filter((chat) => [chat.proposal_title, chat.last_message].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery)))
  }, [chats, normalizedQuery])

  const filteredAdminUsers = useMemo(() => {
    const byStatus =
      adminUserFilter === 'active'
        ? users.filter((entry) => !entry.frozen)
        : adminUserFilter === 'frozen'
          ? users.filter((entry) => entry.frozen)
          : users

    if (!normalizedQuery) return byStatus
    return byStatus.filter((entry) =>
      [entry.email, entry.first_name, entry.last_name, entry.role].filter(Boolean).some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    )
  }, [users, adminUserFilter, normalizedQuery])

  const filteredAdminProposals = useMemo(() => {
    const filter = adminProposalFilter as string
    let byStatus =
      filter === 'pending'
        ? proposals.filter((proposal) => proposal.status === 'pending')
        : filter === 'approved'
          ? proposals.filter((proposal) => proposal.status === 'approved')
          : filter === 'kyc-verified'
            ? proposals.filter((proposal) => { const owner = users.find(u => u.id === proposal.entrepreneur); return owner?.verification?.status === 'approved' || owner?.verified === true })
            : filter === 'kyc-unverified'
              ? proposals.filter((proposal) => { const owner = users.find(u => u.id === proposal.entrepreneur); return owner?.verification?.status !== 'approved' && !owner?.verified })
              : proposals

    if (!normalizedQuery) return byStatus
    return byStatus.filter((proposal) =>
      [proposal.title, proposal.category, proposal.startup_details, proposal.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    )
  }, [proposals, users, adminProposalFilter, normalizedQuery])

  const filteredEscrowTransactions = useMemo(() => {
    if (!normalizedQuery) return transactions
    return transactions.filter((transaction) => {
      const linkedProposal = proposals.find((proposal) => proposal.id === transaction.proposal)
      return [transaction.action, transaction.method, linkedProposal?.title, `txn-${transaction.id}`]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery))
    })
  }, [transactions, proposals, normalizedQuery])

  const recentSystemLogs = useMemo(() => {
    const txLogs = transactions.slice(0, 8).map((transaction) => ({
      id: `tx-${transaction.id}`,
      category: 'Escrow Transaction',
      detail: `${transaction.action.toUpperCase()} on proposal #${transaction.proposal}`,
      meta: `${formatMoney(transaction.amount)} via ${transaction.method}`,
    }))

    const signalLogs = signals.slice(0, 6).map((signal) => ({
      id: `sg-${signal.id}`,
      category: 'Investor Signal',
      detail: `${signal.signal_type} signal for proposal #${signal.proposal}`,
      meta: `Status: ${signal.status}`,
    }))

    const proposalLogs = proposals.slice(0, 6).map((proposal) => ({
      id: `pp-${proposal.id}`,
      category: 'Proposal Update',
      detail: `${proposal.title}`,
      meta: `Status: ${proposal.status}`,
    }))

    return [...txLogs, ...signalLogs, ...proposalLogs].slice(0, 14)
  }, [transactions, signals, proposals])

  const totalFundingRaised = useMemo(
    () => proposals.reduce((sum, proposal) => sum + Number(proposal.required_funding ?? 0), 0),
    [proposals],
  )

  const activeUserName = useMemo(() => {
    if (!user) return ''
    const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ').trim()
    return fullName || user.email.split('@')[0]
  }, [user])

  function hydrateVerificationForm(verification: User['verification']) {
    setVerificationForm({
      phone_number: verification?.phone_number || '',
      address: verification?.address || '',
      identity_type: (verification?.identity_type as 'cnic' | 'passport') || 'cnic',
      identity_number: verification?.identity_number || '',
      startup_website_url: verification?.startup_website_url || '',
      proof_video_url: verification?.proof_video_url || '',
      linkedin_url: verification?.linkedin_url || '',
      twitter_url: verification?.twitter_url || '',
      facebook_url: verification?.facebook_url || '',
      instagram_url: verification?.instagram_url || '',
    })
  }

  // When admin opens the KYC detail modal, fetch fresh user data to avoid stale N/A
  useEffect(() => {
    if (!showKycDetailModal || !kycDetailTarget) return
    setKycDetailLoading(true)
    getAdminUser(kycDetailTarget.id)
      .then((freshUser) => setKycDetailTarget(freshUser))
      .catch(() => { /* keep stale data if fetch fails */ })
      .finally(() => setKycDetailLoading(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showKycDetailModal])

  async function refreshAll(activeUser: User) {
    try {
      const [p, s, t, c, unread, escrow] = await Promise.all([
        getProposals(),
        getSignals(),
        getTransactions(),
        getChatRooms(),
        getUnreadCount(),
        getEscrowSummary(),
      ])
      setProposals(p)
      setSignals(s)
      setTransactions(t)
      setChats(c)
      setUnreadTotal(unread.total)
      setEscrowSummary(escrow)

      if (activeUser.role === 'investor') {
        const wb = await getWalletBalance()
        setWalletBalance(wb)
      }

      if (activeUser.role === 'admin') {
        const allUsers = await getUsers()
        setUsers(allUsers)
      }
    } catch (error) {
      console.error(error)
    }
  }

  useEffect(() => {
    checkHealth()
      .then(() => setApiStatus('online'))
      .catch(() => setApiStatus('offline'))
  }, [])

  useEffect(() => {
    const existingToken = localStorage.getItem('ventureledger_access_token')
    if (!existingToken) return

    getMe()
      .then((me) => {
        setUser(me)
        hydrateVerificationForm(me.verification)
        setPage(me.role === 'admin' ? 'admin' : 'dashboard')
        refreshAll(me)
        if (verificationStatus(me) === 'approved' && me.verification?.admin_message && !sessionStorage.getItem('kyc_approved_seen')) {
          setShowKycApprovedBanner(true)
          sessionStorage.setItem('kyc_approved_seen', '1')
        }
      })
      .catch(() => {
        setUser(null)
      })
  }, [])

  async function onAuthSubmit(event: FormEvent) {
    event.preventDefault()
    setStatusText('')

    try {
      if (authMode === 'signup') {
        await register({ ...authForm, role: authRole })
      }

      const token = await login({ email: authForm.email, password: authForm.password })
      saveTokens(token.access, token.refresh)
      const me = await getMe()
      setUser(me)
      hydrateVerificationForm(me.verification)
      await refreshAll(me)
      if (verificationStatus(me) === 'approved' && me.verification?.admin_message && !sessionStorage.getItem('kyc_approved_seen')) {
        setShowKycApprovedBanner(true)
        sessionStorage.setItem('kyc_approved_seen', '1')
      }
      setStatusText('Authentication successful.')
      if (authMode === 'signup' && me.role !== 'admin') {
        setShowKycModal(true)
      } else {
        setPage(me.role === 'admin' ? 'admin' : 'dashboard')
      }
    } catch (error: unknown) {
      console.error(error)
      const axiosErr = error as { response?: { data?: Record<string, unknown> } }
      const data = axiosErr?.response?.data
      if (data && typeof data === 'object') {
        const msgs = Object.values(data).flat().join(' ')
        setStatusText(msgs || 'Authentication failed. Please verify credentials.')
      } else {
        setStatusText('Authentication failed. Please verify credentials.')
      }
    }
  }

  async function onSubmitKycModal(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    // Phone: exactly 11 digits
    const rawPhone = verificationForm.phone_number.replace(/[_\s]/g, '')
    if (!/^\d{11}$/.test(rawPhone)) {
      setStatusText('Phone number must be exactly 11 digits')
      return
    }
    // CNIC: exactly 13 digits (dashes allowed)
    if (verificationForm.identity_type === 'cnic') {
      const rawCnic = verificationForm.identity_number.replace(/-/g, '')
      if (!/^\d{13}$/.test(rawCnic)) {
        setStatusText('CNIC number must be exactly 13 digits')
        return
      }
    }

    setKycSubmitting(true)
    const data = new FormData()
    Object.entries(verificationForm).forEach(([key, value]) => data.append(key, String(value ?? '')))
    Object.entries(verificationFiles).forEach(([key, file]) => {
      if (file) data.append(key, file)
    })
    data.append('submit', 'true')
    try {
      const verification = await patchVerification(data)
      setUser({ ...user, verification, verified: verification.status === 'approved' })
      setStatusText('KYC submitted for admin review. You can update details anytime from Settings.')
    } catch (error) {
      console.error(error)
      setStatusText('KYC save failed. You can complete it later from Settings.')
    } finally {
      setKycSubmitting(false)
      setShowKycModal(false)
      setPage(user.role === 'admin' ? 'admin' : 'dashboard')
    }
  }

  function onLogout() {
    clearToken()
    sessionStorage.removeItem('kyc_approved_seen')
    setShowKycApprovedBanner(false)
    setUser(null)
    setPendingIntentId('')
    setStripeClientSecret('')
    setUsers([])
    setProposals([])
    setSignals([])
    setTransactions([])
    setChats([])
    setMessages([])
    setVerificationForm({
      phone_number: '',
      address: '',
      identity_type: 'cnic',
      identity_number: '',
      startup_website_url: '',
      proof_video_url: '',
      linkedin_url: '',
      twitter_url: '',
      facebook_url: '',
      instagram_url: '',
    })
    setPage('landing')
    setSelectedProposalId(null)
    setAdminView('users')
    setWorkspaceQuery('')
  }

  function navigateToAuth(role?: 'entrepreneur' | 'investor') {
    if (role) setAuthRole(role)
    setAuthMode('signup')
    setPage('auth')
  }

  function onTopbarNotification() {
    if (isAdmin) {
      setPage('admin')
      setAdminView('logs')
      return
    }
    setPage('chat')
  }

  function onTopbarSettings() {
    if (isAdmin) {
      setPage('admin')
      setAdminView('users')
      return
    }
    setPage('profile')
  }

  function onTopbarHelp() {
    setStatusText('Tip: use the top search bar to filter proposals, chats, users, and escrow records in real time.')
  }

  function onDownloadReport() {
    const reportPayload = {
      generatedAt: new Date().toISOString(),
      summary: {
        users: users.length,
        proposals: proposals.length,
        approvedProposals: approvedProposals.length,
        pendingProposals: pendingProposals.length,
        transactions: transactions.length,
        totalEscrow: escrowSummary?.total_escrow ?? '0',
      },
      filters: {
        search: workspaceQuery,
        adminUserFilter,
        adminProposalFilter,
      },
    }

    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `ventureledger-report-${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
    setStatusText('Admin report downloaded.')
  }

  async function onSaveProfile(event: FormEvent) {
    event.preventDefault()
    if (!user) return

    try {
      const updated = await patchMe({
        first_name: user.first_name,
        last_name: user.last_name,
        business_idea: user.business_idea,
        funding_required: user.funding_required,
        startup_documents: user.startup_documents,
        investment_interest: user.investment_interest,
        budget_range: user.budget_range,
      })
      setUser(updated)
      setStatusText('Profile updated.')
    } catch {
      setStatusText('Failed to update profile.')
    }
  }

  async function onSubmitVerification(event: FormEvent) {
    event.preventDefault()
    if (!user || user.role !== 'entrepreneur') return

    // Phone: exactly 11 digits
    const rawPhone = verificationForm.phone_number.replace(/[_\s]/g, '')
    if (!/^\d{11}$/.test(rawPhone)) {
      setStatusText('Phone number must be exactly 11 digits')
      return
    }
    // CNIC: exactly 13 digits (dashes allowed)
    if (verificationForm.identity_type === 'cnic') {
      const rawCnic = verificationForm.identity_number.replace(/-/g, '')
      if (!/^\d{13}$/.test(rawCnic)) {
        setStatusText('CNIC number must be exactly 13 digits')
        return
      }
    }

    const data = new FormData()
    Object.entries(verificationForm).forEach(([key, value]) => data.append(key, String(value ?? '')))
    Object.entries(verificationFiles).forEach(([key, file]) => {
      if (file) data.append(key, file)
    })
    data.append('submit', 'true')

    try {
      const verification = await patchVerification(data)
      setUser({ ...user, verification, verified: verification.status === 'approved' })
      setStatusText('Verification submitted to admin for review.')
    } catch (error) {
      console.error(error)
      setStatusText('Failed to submit verification details.')
    }
  }

  async function onSubmitProposal(event: FormEvent) {
    event.preventDefault()
    if (proposalSubmitting) return
    setProposalSubmitting(true)
    try {
      if (proposalDocumentFile) {
        const data = new FormData()
        Object.entries({ ...proposalForm, required_funding: String(proposalForm.required_funding) }).forEach(([key, value]) => data.append(key, String(value ?? '')))
        data.append('document_file', proposalDocumentFile)
        await createProposal(data)
      } else {
        await createProposal({ ...proposalForm, required_funding: String(proposalForm.required_funding) })
      }
      if (user) await refreshAll(user)
      setStatusText('✅ Proposal submitted for admin approval.')
      // Clear form after successful submission
      setProposalForm({
        title: '',
        startup_details: '',
        description: '',
        category: '',
        required_funding: 0,
        timeline: '',
        document_name: '',
        pitch_video_url: '',
        startup_website_url: '',
        proof_video_url: '',
      })
      setProposalDocumentFile(null)
      setProposalFormKey((k) => k + 1)
    } catch {
      setStatusText('Failed to submit proposal.')
    } finally {
      setProposalSubmitting(false)
    }
  }

  async function onSendInterest(proposalId: number) {
    const proposal = proposals.find((p) => p.id === proposalId)
    if (proposal && proposal.status !== 'approved') {
      setStatusText('Interest can only be sent on approved proposals. This proposal is still under review.')
      return
    }
    try {
      await createSignal({ proposal: proposalId, signal_type: 'interest', message: 'Interested in discussing this opportunity.' })
      if (user) await refreshAll(user)
      setStatusText('✅ Interest signal sent successfully.')
    } catch {
      setStatusText('Could not send interest signal. It may already exist or the proposal is not active.')
    }
  }

  async function onSignalDecision(signalId: number, decision: 'accepted' | 'rejected') {
    try {
      await updateSignalStatus(signalId, decision)
      if (user) await refreshAll(user)
      setStatusText(`Signal ${decision}.`)
    } catch {
      setStatusText('Failed to update investor request.')
    }
  }

  async function onInvest(event: FormEvent) {
    event.preventDefault()
    if (!walletForm.proposal) {
      setStatusText('Please select a proposal first.')
      return
    }
    if (!walletForm.accept_terms || !compactText(walletForm.accepted_name)) {
      setStatusText('Please accept the investment agreement and type your legal name first.')
      return
    }
    try {
      await createAgreement({
        proposal: walletForm.proposal,
        amount: walletForm.amount,
        payment_method: walletForm.method,
        equity_percentage: walletForm.equity_percentage || undefined,
        profit_share_percentage: walletForm.profit_share_percentage || undefined,
        expected_return_note: walletForm.expected_return_note,
        term_months: walletForm.term_months,
        accepted_name: walletForm.accepted_name,
      })
      if (walletForm.method === 'stripe') {
        const intent = await createPaymentIntent({ proposal: walletForm.proposal, amount: walletForm.amount })
        setPendingIntentId(intent.intent_id)
        setStripeClientSecret(intent.client_secret)
        setStatusText('Enter your card details below to complete the payment.')
      } else {
        await createTransaction({
          proposal: walletForm.proposal,
          amount: walletForm.amount,
          action: 'invest',
          method: 'virtual-escrow',
          notes: 'Investor escrow funding',
        })
        if (user) await refreshAll(user)
        setStatusText('Agreement accepted and funds held in escrow successfully.')
      }
    } catch {
      setStatusText('Investment request failed.')
    }
  }

  async function onCheckIntentStatus() {
    if (!pendingIntentId) return
    try {
      const res = await getPaymentStatus(pendingIntentId)
      setStatusText(`Intent ${res.intent_id} status: ${res.status}`)
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Could not fetch payment status.')
    }
  }

  async function onAdminSettlement(proposalId: number, action: 'release' | 'refund') {
    try {
      await createTransaction({
        proposal: proposalId,
        amount: 1000,
        action,
        method: 'virtual-escrow',
        notes: `Admin ${action}`,
      })
      if (user) await refreshAll(user)
      setStatusText(`Settlement action '${action}' completed.`)
    } catch {
      setStatusText('Settlement action failed.')
    }
  }

  async function openChat(proposalId: number) {
    setSelectedProposalId(proposalId)
    setPage('chat')
    try {
      const msgs = await getMessages(proposalId)
      setMessages(msgs)
      for (const message of msgs.filter((item) => !item.is_read)) {
        await markMessageAsRead(message.id)
      }
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Failed to load messages.')
    }
  }

  async function onSendMessage(event: FormEvent) {
    event.preventDefault()
    const normalizedMessage = compactText(messageDraft)
    if (!selectedProposalId || !normalizedMessage) return
    try {
      await sendMessage({ proposal: selectedProposalId, content: normalizedMessage })
      setMessageDraft('')
      const msgs = await getMessages(selectedProposalId)
      setMessages(msgs)
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Unable to send message.')
    }
  }

  async function onToggleUserFlag(target: User, field: 'verified' | 'frozen') {
    try {
      await patchUserFlags(target.id, { [field]: !target[field] })
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Failed to update user flags.')
    }
  }

  async function onReviewVerification(target: User, decision: 'approved' | 'rejected') {
    if (decision === 'rejected') {
      setKycRejectionTarget(target)
      setRejectionMessage('Please upload clearer identity/startup proof and resubmit.')
      setShowRejectionModal(true)
      return
    }
    try {
      await reviewUserVerification(target.id, { status: decision, admin_message: 'Your KYC has been approved. You can now submit proposals and access all platform features.' })
      if (user) await refreshAll(user)
      setStatusText(`✅ KYC approved for ${target.email}.`)
    } catch {
      setStatusText('Failed to review verification.')
    }
  }

  async function onConfirmRejection() {
    if (!kycRejectionTarget) return
    try {
      await reviewUserVerification(kycRejectionTarget.id, { status: 'rejected', admin_message: rejectionMessage })
      if (user) await refreshAll(user)
      setStatusText(`KYC rejected for ${kycRejectionTarget.email}. Message sent.`)
    } catch {
      setStatusText('Failed to reject verification.')
    } finally {
      setShowRejectionModal(false)
      setKycRejectionTarget(null)
      setRejectionMessage('')
    }
  }

  async function onDeleteUser(target: User) {
    if (!window.confirm(`Delete ${target.email} permanently? This cannot be undone.`)) return
    try {
      await deleteUser(target.id)
      if (user) await refreshAll(user)
      setStatusText('User deleted.')
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string } } }
      const msg = axiosErr?.response?.data?.detail || 'Failed to delete user. Check linked records or permissions.'
      setStatusText(msg)
    }
  }

  async function onAdminApproveProposal(proposalId: number) {
    try {
      await approveProposal(proposalId)
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Unable to approve proposal.')
    }
  }

  async function onAdminSetPending(proposalId: number) {
    try {
      await patchProposal(proposalId, { status: 'pending' })
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Unable to mark proposal pending.')
    }
  }

  async function onAdminRejectProposal(proposalId: number) {
    const message = window.prompt('Why is this proposal rejected?', 'Please provide more proof or clearer financial details.') || 'Rejected by admin.'
    try {
      await patchProposal(proposalId, { status: 'rejected', admin_message: message })
      if (user) await refreshAll(user)
      setStatusText('Proposal rejected with admin message.')
    } catch {
      setStatusText('Unable to reject proposal.')
    }
  }

  async function onDeleteProposal(proposalId: number) {
    if (!window.confirm('Delete this proposal? Proposals with investment activity cannot be deleted.')) return
    try {
      await deleteProposal(proposalId)
      setSelectedProposalId(null)
      if (user) await refreshAll(user)
      setStatusText('Proposal deleted.')
    } catch (error: unknown) {
      const axiosErr = error as { response?: { data?: { detail?: string; non_field_errors?: string[] } } }
      const detail = axiosErr?.response?.data?.detail
      const nonField = axiosErr?.response?.data?.non_field_errors?.[0]
      setStatusText(detail || nonField || 'Unable to delete proposal. It may already have investment/payment activity.')
    }
  }

  async function onDownloadFile(url: string | undefined, filename: string) {
    if (!url) return
    try {
      await downloadProtectedFile(url, filename)
    } catch {
      setStatusText('Unable to download protected file. Please refresh and try again.')
    }
  }

  async function onMilestoneChange(proposalId: number, milestone: Proposal['milestone']) {
    try {
      await updateProposalMilestone(proposalId, milestone)
      if (user) await refreshAll(user)
    } catch {
      setStatusText('Failed to update milestone.')
    }
  }

  const isAuthed = Boolean(user)
  const isAdmin = user?.role === 'admin'
  const investorCapital = walletBalance ? formatMoney(walletBalance.available_balance) : formatMoney(0)
  const investorEscrow = walletBalance ? formatMoney(walletBalance.in_escrow) : formatMoney(escrowSummary?.total_escrow)
  const transactionVolume = transactions.reduce((sum, transaction) => sum + Number(transaction.amount ?? 0), 0)

  return (
    <div className={`app-shell ${isAuthed ? 'app-shell--authed' : 'app-shell--public'} ${user ? `role-${user.role}` : ''} ${navOpen ? 'nav-open' : ''}`}>
      {user && <div className={`nav-overlay${navOpen ? ' nav-overlay--active' : ''}`} onClick={() => setNavOpen(false)} />}
      {user && (
        <aside className={`side-nav ${isAdmin ? 'side-nav--admin' : 'side-nav--workspace'}`}>
          <div className="side-nav__brand">
            <div className="brand-mark">{isAdmin ? <ShieldCheck size={20} /> : <Landmark size={20} />}</div>
            <div>
              <h2>{isAdmin ? 'VentureLedger' : user.role === 'entrepreneur' ? 'Growth Ventures' : 'InvestWise'}</h2>
              <p>
                {isAdmin
                  ? 'Admin Control Panel'
                  : user.role === 'entrepreneur'
                    ? 'Series A Funding'
                    : 'Investor Workspace'}
              </p>
            </div>
          </div>

          <nav className="side-nav__links">
            {isAdmin ? (
              <>
                <button type="button" className={`nav-link ${page === 'landing' ? 'active' : ''}`} onClick={() => setPage('landing')}>
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </button>
                <button type="button" className={`nav-link ${page === 'admin' && adminView === 'users' ? 'active' : ''}`} onClick={() => { setPage('admin'); setAdminView('users') }}>
                  <Users size={18} />
                  <span>User Management</span>
                </button>
                <button type="button" className={`nav-link ${page === 'admin' && adminView === 'proposals' ? 'active' : ''}`} onClick={() => { setPage('admin'); setAdminView('proposals') }}>
                  <FileText size={18} />
                  <span>Proposal Moderation</span>
                </button>
                <button type="button" className={`nav-link ${page === 'admin' && adminView === 'escrow' ? 'active' : ''}`} onClick={() => { setPage('admin'); setAdminView('escrow') }}>
                  <Wallet size={18} />
                  <span>Escrow Settlements</span>
                </button>
                <button type="button" className={`nav-link ${page === 'admin' && adminView === 'logs' ? 'active' : ''}`} onClick={() => { setPage('admin'); setAdminView('logs') }}>
                  <History size={18} />
                  <span>System Logs</span>
                </button>
              </>
            ) : (
              <>
                <button type="button" className={`nav-link ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}>
                  <LayoutDashboard size={18} />
                  <span>Dashboard</span>
                </button>
                <button type="button" className={`nav-link ${page === 'proposals' ? 'active' : ''}`} onClick={() => setPage('proposals')}>
                  <FileText size={18} />
                  <span>Proposals</span>
                </button>
                <button type="button" className={`nav-link ${page === 'wallet' ? 'active' : ''}`} onClick={() => setPage('wallet')}>
                  <Wallet size={18} />
                  <span>{user.role === 'investor' ? 'Invest' : 'Wallet'}</span>
                </button>
                <button type="button" className={`nav-link ${page === 'chat' ? 'active' : ''}`} onClick={() => setPage('chat')}>
                  <MessageSquare size={18} />
                  <span>Messages</span>
                </button>
                <button type="button" className={`nav-link ${page === 'profile' ? 'active' : ''}`} onClick={() => setPage('profile')}>
                  <Settings size={18} />
                  <span>Settings</span>
                </button>
              </>
            )}
          </nav>

          <div className="side-nav__footer">
            {!isAdmin ? (
              <div className="side-nav__profile">
                <div className="avatar-circle">{initials(activeUserName)}</div>
                <div>
                  <strong>{activeUserName}</strong>
                  <span>{user.role === 'entrepreneur' ? 'Founder & CEO' : 'Investor'}</span>
                </div>
              </div>
            ) : (
              <button type="button" className="nav-cta" onClick={onDownloadReport}>
                <PlusCircle size={18} />
                <span>New Report</span>
              </button>
            )}

            <button type="button" className="nav-link nav-link--ghost" onClick={() => user && refreshAll(user)}>
              <RefreshCcw size={18} />
              <span>Refresh Data</span>
            </button>
            <button type="button" className="nav-link nav-link--danger" onClick={onLogout}>
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </aside>
      )}

      <div className="app-content">
        <header className={`topbar ${isAuthed ? 'topbar--authed' : 'topbar--public'} ${isAdmin ? 'topbar--admin' : ''}`}>
          {isAuthed ? (
            <>
              <div className="topbar__left">
                <button type="button" className="hamburger" aria-label="Toggle navigation" onClick={() => setNavOpen((prev) => !prev)}>
                  <span />
                  <span />
                  <span />
                </button>
                <div className="topbar__product">{isAdmin ? 'VentureLedger' : user?.role === 'entrepreneur' ? 'FinVent' : 'InvestWise'}</div>
                <label className="search-shell" aria-label="Search workspace">
                  <Search size={16} />
                  <input
                    placeholder={isAdmin ? 'Search accounts, transactions, or logs...' : 'Search proposals, startups, or founders...'}
                    type="text"
                    value={workspaceQuery}
                    onChange={(e) => setWorkspaceQuery(e.target.value)}
                  />
                </label>
              </div>
              <div className="topbar__right">
                {!isAdmin && user?.role === 'entrepreneur' && (
                  <button type="button" className="topbar-cta topbar-cta--soft" onClick={() => setPage('chat')}>
                    <Users size={16} />
                    <span>Invite Investor</span>
                  </button>
                )}
                {!isAdmin && user?.role === 'entrepreneur' && (
                  <button type="button" className="topbar-cta" onClick={() => setPage('proposals')}>
                    <PlusCircle size={16} />
                    <span>Create New Proposal</span>
                  </button>
                )}
                <button type="button" className="topbar-icon" onClick={onTopbarNotification} title="Notifications"><Bell size={16} /></button>
                <button type="button" className="topbar-icon" onClick={onTopbarSettings} title="Settings"><Settings size={16} /></button>
                <button type="button" className="topbar-icon" onClick={onTopbarHelp} title="Help"><CircleHelp size={16} /></button>
                <div className="topbar-user">
                  <div className="avatar-circle avatar-circle--small">{initials(activeUserName)}</div>
                  <div>
                    <strong>{activeUserName}</strong>
                    <span>{isAdmin ? 'System Architect' : user?.role ?? ''}</span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="public-brand">
                <Globe2 size={18} />
                <span>VentureLedger Exchange</span>
              </div>
              <div className="public-topbar__right">
                <span className={`api-pill api-pill--${apiStatus}`}>API: {apiStatus}</span>
                <button type="button" className="public-login" onClick={() => { setPage('auth'); setAuthMode('login') }}>
                  Log In
                </button>
              </div>
            </>
          )}
        </header>

        {statusText && <div className="status-banner">{statusText}</div>}

        <main className="main-content">
          {page === 'landing' && (
            <section className="public-page">
              <section className="landing-hero">
                <div
                  className="landing-hero__media"
                  style={{
                    backgroundImage:
                      "linear-gradient(180deg, rgba(68,96,138,0.08), rgba(68,96,138,0.12)), url('https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=1200&q=80')",
                  }}
                />
                <div className="landing-hero__copy">
                  <span className="landing-eyebrow">Institutional-Grade Venture Capital</span>
                  <h1>The Future of Startup Capital</h1>
                  <p>
                    VentureLedger Exchange connects elite entrepreneurs with professional investors through a secure,
                    transparent, and institutional-grade platform designed for long-term growth and liquidity.
                  </p>
                  <div className="landing-actions">
                    <button type="button" className="button-primary" onClick={() => navigateToAuth('entrepreneur')}>
                      Get Started Now
                    </button>
                    <button type="button" className="button-secondary" onClick={() => setPage('auth')}>
                      View Marketplace
                    </button>
                  </div>
                </div>
              </section>

              <section className="landing-section landing-section--alt">
                <div className="section-heading section-heading--center">
                  <h2>Tailored for Professional Growth</h2>
                  <p>
                    Our exchange provides the infrastructure needed for the next generation of venture capital. We bridge
                    the gap between visionary founders and institutional capital.
                  </p>
                </div>
                <div className="feature-grid">
                  <article className="feature-card">
                    <div className="feature-icon"><Rocket size={22} /></div>
                    <h3>For Entrepreneurs</h3>
                    <p>
                      Access a curated network of accredited investors, streamline your cap table management, and gain
                      secondary liquidity options while maintaining control.
                    </p>
                    <ul>
                      <li>Structured data rooms</li>
                      <li>Direct investor communication</li>
                    </ul>
                  </article>
                  <article className="feature-card">
                    <div className="feature-icon"><TrendingUp size={22} /></div>
                    <h3>For Investors</h3>
                    <p>
                      Diversify your portfolio with vetted opportunities, institutional-grade analytics, and standardized
                      reporting across all your venture holdings.
                    </p>
                    <ul>
                      <li>Automated compliance (KYC / AML)</li>
                      <li>Real-time portfolio tracking</li>
                    </ul>
                  </article>
                </div>
              </section>

              <section className="landing-section">
                <div className="section-heading section-heading--center">
                  <h2>The VentureLedger Protocol</h2>
                </div>
                <div className="protocol-grid">
                  {[
                    {
                      step: '1',
                      title: 'Verification',
                      text: 'Rigorous vetting process for startups and accreditation verification for all incoming capital partners.',
                    },
                    {
                      step: '2',
                      title: 'Exchange',
                      text: 'Execute primary funding rounds or trade secondary equity on a structured, auditable exchange workflow.',
                    },
                    {
                      step: '3',
                      title: 'Settlement',
                      text: 'Secure, ledger-based settlement ensures transparent transfer of ownership and capital with escrow control.',
                    },
                  ].map((item) => (
                    <article className="protocol-step" key={item.step}>
                      <div className="protocol-step__badge">{item.step}</div>
                      <h3>{item.title}</h3>
                      <p>{item.text}</p>
                    </article>
                  ))}
                </div>
              </section>

              <section className="landing-section landing-section--alt">
                <div className="section-heading section-heading--center">
                  <h2>Ready to Enter the Exchange?</h2>
                  <p>Choose your path and begin the application process today.</p>
                </div>
                <div className="entry-grid">
                  <article className="entry-card">
                    <div>
                      <h3>Join as Entrepreneur</h3>
                      <p>
                        Position your company in front of global institutional capital with a seamless fundraising
                        infrastructure and secondary market tools.
                      </p>
                    </div>
                    <button type="button" className="button-primary" onClick={() => navigateToAuth('entrepreneur')}>
                      Apply to List <ArrowRight size={16} />
                    </button>
                  </article>
                  <article className="entry-card">
                    <div>
                      <h3>Join as Investor</h3>
                      <p>
                        Gain exclusive access to high-growth private equity, diligence workflows, and real-time portfolio
                        analytics built for modern allocators.
                      </p>
                    </div>
                    <button type="button" className="button-secondary" onClick={() => navigateToAuth('investor')}>
                      Request Access <ArrowRight size={16} />
                    </button>
                  </article>
                </div>
              </section>

              <footer className="landing-footer">
                <div className="landing-footer__brand">
                  <h3>VentureLedger</h3>
                  <p>
                    The world's first fully transparent exchange for early-stage and growth-stage private equity.
                  </p>
                </div>
                <div className="landing-footer__cols">
                  <div>
                    <span>Platform</span>
                    <button type="button" className="footer-link" onClick={() => setPage('auth')}>Marketplace</button>
                    <button type="button" className="footer-link" onClick={() => navigateToAuth('entrepreneur')}>Startups</button>
                    <button type="button" className="footer-link" onClick={() => navigateToAuth('investor')}>Investors</button>
                  </div>
                  <div>
                    <span>Company</span>
                    <button type="button" className="footer-link" onClick={onTopbarHelp}>About Us</button>
                    <button type="button" className="footer-link" onClick={onTopbarHelp}>Compliance</button>
                    <button type="button" className="footer-link" onClick={onTopbarHelp}>Careers</button>
                  </div>
                  <div>
                    <span>Legal</span>
                    <button type="button" className="footer-link" onClick={onTopbarHelp}>Privacy Policy</button>
                    <button type="button" className="footer-link" onClick={onTopbarHelp}>Terms of Service</button>
                    <button type="button" className="footer-link" onClick={onTopbarHelp}>Risk Disclosure</button>
                  </div>
                </div>
              </footer>
            </section>
          )}

          {page === 'auth' && !user && (
            <section className="auth-page">
              <article className="auth-card">
                <div className="auth-card__header">
                  <h2>{isAdminRoute ? 'Admin Login' : authMode === 'signup' ? 'Create Account' : 'Sign In'}</h2>
                  <p>{isAdminRoute ? 'VentureLedger system administration access.' : 'Choose your role and continue into the workspace.'}</p>
                </div>

                {!isAdminRoute && (
                  <div className="segmented-control">
                    <button type="button" className={authMode === 'signup' ? 'active' : ''} onClick={() => setAuthMode('signup')}>
                      Create Account
                    </button>
                    <button type="button" className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')}>
                      Sign In
                    </button>
                  </div>
                )}



                {authMode === 'login' && (
                  <div className="demo-panel">
                    <div>
                      <h3>Quick demo access</h3>
                      <p>Auto-fill working credentials without changing any flow logic.</p>
                    </div>
                    <div className="demo-grid">
                      {isAdminRoute ? (
                        <button
                          type="button"
                          className="demo-btn demo-btn--admin"
                          onClick={() => setAuthForm({ ...authForm, email: 'admin@demo.local', password: 'DemoPass123!' })}
                        >
                          Admin Demo
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="demo-btn demo-btn--founder"
                            onClick={() => {
                              setAuthForm({ ...authForm, email: 'entrepreneur@demo.local', password: 'DemoPass123!' })
                              setAuthRole('entrepreneur')
                            }}
                          >
                            Entrepreneur Demo
                          </button>
                          <button
                            type="button"
                            className="demo-btn demo-btn--investor"
                            onClick={() => {
                              setAuthForm({ ...authForm, email: 'investor@demo.local', password: 'Investor@123' })
                              setAuthRole('investor')
                            }}
                          >
                            Investor Demo
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}

                <form onSubmit={onAuthSubmit} className="auth-form">
                  {authMode === 'signup' && !isAdminRoute && (
                    <div className="field-row field-row--two">
                      <input placeholder="First name" value={authForm.first_name} onChange={(e) => setAuthForm({ ...authForm, first_name: e.target.value })} />
                      <input placeholder="Last name" value={authForm.last_name} onChange={(e) => setAuthForm({ ...authForm, last_name: e.target.value })} />
                    </div>
                  )}
                  {!isAdminRoute && (
                    <select
                      value={authRole}
                      onChange={(e) => setAuthRole(e.target.value as 'entrepreneur' | 'investor')}
                      className="auth-input"
                      required
                    >
                      <option value="entrepreneur">Entrepreneur</option>
                      <option value="investor">Investor</option>
                    </select>
                  )}
                  <input type="email" placeholder="Email" value={authForm.email} onChange={(e) => setAuthForm({ ...authForm, email: e.target.value })} required />
                  <input type="password" placeholder="Password" value={authForm.password} onChange={(e) => setAuthForm({ ...authForm, password: e.target.value })} required />
                  <button type="submit" className="button-primary button-primary--full">Continue to Workspace</button>
                </form>

                <div style={{ textAlign: 'center', marginTop: '12px', fontSize: '0.8rem' }}>
                  {isAdminRoute
                    ? <a href="/web/" style={{ color: 'var(--primary)', opacity: 0.7, textDecoration: 'none' }}>← Back to User Login</a>
                    : <a href="/web/admin/login" style={{ color: 'var(--primary)', opacity: 0.7, textDecoration: 'none' }}>System Admin? Login here →</a>
                  }
                </div>
              </article>
            </section>
          )}

          {user && page === 'profile' && (
            <section className="screen profile-screen">
              <div className="screen-head">
                <div>
                  <h2>Workspace Settings</h2>
                  <p>Manage your public identity, venture profile data, and verification readiness.</p>
                </div>
              </div>

              <div className="profile-grid">
                <article className="panel profile-summary">
                  <div className="profile-summary__header">
                    <div className="avatar-circle avatar-circle--large">{initials(activeUserName)}</div>
                    <div>
                      <h3>{activeUserName}</h3>
                      <p>{user.email}</p>
                    </div>
                  </div>
                  <div className="profile-badges">
                    <span className={`status-pill ${user.verified ? 'tone-success' : 'tone-neutral'}`}>
                      {user.verified ? 'Verified' : 'Pending Verification'}
                    </span>
                    <span className={`status-pill ${user.frozen ? 'tone-danger' : 'tone-info'}`}>
                      {user.frozen ? 'Frozen' : 'Active'}
                    </span>
                  </div>
                  <div className="summary-list">
                    <div><span>Role</span><strong>{user.role}</strong></div>
                    <div><span>Unread updates</span><strong>{unreadTotal}</strong></div>
                    <div><span>Signals</span><strong>{signals.length}</strong></div>
                    <div><span>Transactions</span><strong>{transactions.length}</strong></div>
                  </div>
                </article>

                <article className="panel panel--form">
                  <div className="panel-head">
                    <div>
                      <h3>Profile details</h3>
                      <p>These fields back the live entrepreneur and investor flows already connected to the API.</p>
                    </div>
                  </div>
                  <form onSubmit={onSaveProfile} className="form-grid">
                    <div className="field-row field-row--two">
                      <input placeholder="First name" value={user.first_name || ''} onChange={(e) => setUser({ ...user, first_name: e.target.value })} />
                      <input placeholder="Last name" value={user.last_name || ''} onChange={(e) => setUser({ ...user, last_name: e.target.value })} />
                    </div>

                    {user.role === 'entrepreneur' ? (
                      <>
                        <input placeholder="Business Idea" value={user.business_idea || ''} onChange={(e) => setUser({ ...user, business_idea: e.target.value })} />
                        <input placeholder="Funding Required" value={user.funding_required || ''} onChange={(e) => setUser({ ...user, funding_required: e.target.value })} />
                      </>
                    ) : (
                      <>
                        <input placeholder="Investment Interest" value={user.investment_interest || ''} onChange={(e) => setUser({ ...user, investment_interest: e.target.value })} />
                        <input placeholder="Budget Range" value={user.budget_range || ''} onChange={(e) => setUser({ ...user, budget_range: e.target.value })} />
                      </>
                    )}

                    <button type="submit" className="button-primary">Save Profile</button>
                  </form>
                </article>

                {user.role === 'entrepreneur' && (
                  <article className="panel panel--form panel--span-2">
                    <div className="panel-head">
                      <div>
                        <h3>Founder verification evidence</h3>
                        <p>Submit CNIC/passport proof, address, social links, and startup proof for admin review.</p>
                      </div>
                      <span className={`status-pill ${statusTone(verificationStatus(user))}`}>{verificationStatus(user)}</span>
                    </div>
                    {showKycApprovedBanner && user.verification?.admin_message && (
                      <div className="status-banner" style={{display:'flex',justifyContent:'space-between',alignItems:'center',gap:'0.75rem'}}>
                        <span>Admin message: {user.verification.admin_message}</span>
                        <button type="button" onClick={() => setShowKycApprovedBanner(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--primary-dark)',fontSize:'1.2rem',lineHeight:1,flexShrink:0}}>✕</button>
                      </div>
                    )}
                    {verificationStatus(user) === 'approved' ? (
                      <div className="verification-approved">
                        <ShieldCheck size={36} className="verification-approved__icon" />
                        <div>
                          <h4>Founder Verification Approved</h4>
                          <p>Your identity has been verified by admin. You now have full access to all platform features including proposal submissions.</p>
                        </div>
                      </div>
                    ) : (
                    <form onSubmit={onSubmitVerification} className="form-grid">
                      <div className="field-row field-row--two">
                        <input placeholder="03XX_XXXXXXX" value={verificationForm.phone_number} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 11); const f = d.length > 4 ? d.slice(0, 4) + '_' + d.slice(4) : d; setVerificationForm({ ...verificationForm, phone_number: f }) }} required maxLength={12} title="Phone number must be exactly 11 digits" />
                        <select value={verificationForm.identity_type} onChange={(e) => setVerificationForm({ ...verificationForm, identity_type: e.target.value as 'cnic' | 'passport' })}>
                          <option value="cnic">CNIC / National ID</option>
                          <option value="passport">Passport</option>
                        </select>
                      </div>
                      <input placeholder="00000-0000000-0" value={verificationForm.identity_number} onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 13); let f = d; if (d.length > 12) f = d.slice(0,5)+'-'+d.slice(5,12)+'-'+d.slice(12); else if (d.length > 5) f = d.slice(0,5)+'-'+d.slice(5); setVerificationForm({ ...verificationForm, identity_number: f }) }} required pattern="\d{5}-\d{7}-\d" maxLength={15} title="CNIC format: 00000-0000000-0" />
                      <textarea placeholder="Full address" value={verificationForm.address} onChange={(e) => setVerificationForm({ ...verificationForm, address: e.target.value })} required />
                      <div className="field-row field-row--two">
                        <input placeholder="Startup website URL" value={verificationForm.startup_website_url} onChange={(e) => setVerificationForm({ ...verificationForm, startup_website_url: e.target.value })} />
                        <input placeholder="Working system / demo video URL" value={verificationForm.proof_video_url} onChange={(e) => setVerificationForm({ ...verificationForm, proof_video_url: e.target.value })} />
                      </div>
                      <div className="field-row field-row--two">
                        <input placeholder="LinkedIn URL" value={verificationForm.linkedin_url} onChange={(e) => setVerificationForm({ ...verificationForm, linkedin_url: e.target.value })} />
                        <input placeholder="Instagram URL" value={verificationForm.instagram_url} onChange={(e) => setVerificationForm({ ...verificationForm, instagram_url: e.target.value })} />
                      </div>
                      <input placeholder="Facebook URL" value={verificationForm.facebook_url} onChange={(e) => setVerificationForm({ ...verificationForm, facebook_url: e.target.value })} />
                      <div className="field-row field-row--two">
                        <label>CNIC front / identity front<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setVerificationFiles({ ...verificationFiles, identity_front: e.target.files?.[0] ?? null })} /></label>
                        <label>CNIC back / identity back<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setVerificationFiles({ ...verificationFiles, identity_back: e.target.files?.[0] ?? null })} /></label>
                      </div>
                      <div className="field-row field-row--two">
                        <label>Passport photo<input type="file" accept=".jpg,.jpeg,.png,.pdf" onChange={(e) => setVerificationFiles({ ...verificationFiles, passport_photo: e.target.files?.[0] ?? null })} /></label>
                        <label>Proof video upload<input type="file" accept=".mp4,.mov,.webm" onChange={(e) => setVerificationFiles({ ...verificationFiles, proof_video_file: e.target.files?.[0] ?? null })} /></label>
                      </div>
                      <button type="submit" className="button-primary">Submit Verification for Admin Review</button>
                    </form>
                    )}
                  </article>
                )}
              </div>
            </section>
          )}

          {user && page === 'dashboard' && user.role === 'entrepreneur' && (
            <section className="screen workspace-screen">
              <div className="screen-head">
                <div>
                  <h2>Dashboard Overview</h2>
                  <p>Welcome back, {user.first_name || 'Founder'}. Here is what is happening across your funding rounds.</p>
                </div>
                <div className="screen-head__actions">
                  <button type="button" className="button-secondary" onClick={() => setPage('chat')}>
                    <Users size={16} /> Invite Investor
                  </button>
                  <button type="button" className="button-primary" onClick={() => setPage('proposals')}>
                    <PlusCircle size={16} /> Create New Proposal
                  </button>
                </div>
              </div>

              <div className="metric-grid">
                <article className="metric-card">
                  <div className="metric-card__icon metric-card__icon--primary"><DollarSign size={18} /></div>
                  <span>Total Funding Raised</span>
                  <strong>{formatMoney(totalFundingRaised)}</strong>
                  <small><TrendingUp size={14} /> Live proposal targets</small>
                </article>
                <article className="metric-card">
                  <div className="metric-card__icon metric-card__icon--secondary"><FileText size={18} /></div>
                  <span>Active Proposals</span>
                  <strong>{proposals.length}</strong>
                  <small>{pendingProposals.length} pending review</small>
                </article>
                <article className="metric-card">
                  <div className="metric-card__icon metric-card__icon--tertiary"><Eye size={18} /></div>
                  <span>Investor Views</span>
                  <strong>{signals.length}</strong>
                  <small>{investorRequests.length} live requests</small>
                </article>
                <article className="metric-card">
                  <div className="metric-card__icon metric-card__icon--danger"><AlertTriangle size={18} /></div>
                  <span>Pending Requests</span>
                  <strong>{investorRequests.length}</strong>
                  <small>Founder actions required</small>
                </article>
              </div>

              <div className="workspace-columns workspace-columns--dashboard">
                <article className="panel panel--table panel--span-2">
                  <div className="panel-head">
                    <div>
                      <h3>Proposal Milestones</h3>
                    </div>
                    <button type="button" className="text-button" onClick={() => setPage('proposals')}>View All</button>
                  </div>

                  <div className="table-shell">
                    <div className="table-shell__head table-shell__head--milestones">
                      <span>Proposal Name</span>
                      <span>Stage</span>
                      <span>Completion</span>
                      <span>Last Updated</span>
                    </div>
                    <div className="table-shell__body">
                      {visibleProposals.length === 0 && <div className="empty-state">No proposals match the current search.</div>}
                      {visibleProposals.map((proposal) => (
                        <div className="table-row table-row--milestones" key={proposal.id}>
                          <div className="proposal-name-cell">
                            <div className="table-icon"><Rocket size={16} /></div>
                            <div>
                              <strong>{proposal.title}</strong>
                              <p>{proposal.category}</p>
                            </div>
                          </div>
                          <div>
                            <span className={`status-pill ${statusTone(proposal.status)}`}>{proposal.status}</span>
                          </div>
                          <div>
                            <div className="progress-bar"><span style={{ width: `${milestoneProgress(proposal.milestone)}%` }} /></div>
                            <select value={proposal.milestone} onChange={(e) => onMilestoneChange(proposal.id, e.target.value as Proposal['milestone'])}>
                              <option>Not Started</option>
                              <option>In Progress</option>
                              <option>Completed</option>
                            </select>
                          </div>
                          <div>
                            <strong>{formatRelativeTime(proposal.updated_at || proposal.created_at)}</strong>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <aside className="stack-column">
                  <article className="panel panel--requests">
                    <div className="panel-head">
                      <div>
                        <h3>Investor Requests</h3>
                      </div>
                      <span className="counter-pill">{investorRequests.length || 0} new</span>
                    </div>
                    <div className="request-stack">
                      {investorRequests.length === 0 && <div className="empty-state">No pending investor requests right now.</div>}
                      {investorRequests.map((signal) => (
                        <article className="request-card" key={signal.id}>
                          <div className="request-card__head">
                            <div className="avatar-circle avatar-circle--soft">{initials(signal.investor_email || 'Investor')}</div>
                            <div>
                              <strong>{signal.investor_email || 'Investor'}</strong>
                              <p>{signal.message || 'No message provided'}</p>
                            </div>
                          </div>
                          <div className="request-card__actions">
                            <button type="button" className="action-approve" onClick={() => onSignalDecision(signal.id, 'accepted')}>
                              Accept
                            </button>
                            <button type="button" className="action-reject" onClick={() => onSignalDecision(signal.id, 'rejected')}>
                              Reject
                            </button>
                          </div>
                        </article>
                      ))}
                    </div>
                  </article>
                </aside>
              </div>
            </section>
          )}

          {user && page === 'dashboard' && user.role === 'investor' && (
            <section className="screen wallet-screen">
              <div className="screen-head">
                <div>
                  <h2>Investment Portfolio</h2>
                  <p>Review available capital, open opportunities, and move from diligence to escrow funding.</p>
                </div>
                <div className="screen-head__actions">
                  <button type="button" className="button-secondary" onClick={() => setPage('proposals')}>
                    Browse Proposals
                  </button>
                  <button type="button" className="button-primary" onClick={() => setPage('wallet')}>
                    Open Wallet
                  </button>
                </div>
              </div>

              <div className="wallet-summary-grid">
                <article className="metric-card metric-card--wallet">
                  <span>Available Capital</span>
                  <strong>{investorCapital}</strong>
                  <small><TrendingUp size={14} /> Live wallet balance</small>
                </article>
                <article className="metric-card metric-card--wallet">
                  <span>In Escrow</span>
                  <strong>{investorEscrow}</strong>
                  <small><Wallet size={14} /> {transactions.length} active holdings</small>
                </article>
                <article className="metric-card metric-card--wallet">
                  <span>Transaction Count</span>
                  <strong>{transactions.length}</strong>
                  <small><Clock3 size={14} /> Updated from ledger</small>
                </article>
              </div>

              <div className="workspace-columns workspace-columns--wallet">
                <article className="panel panel--table panel--span-2">
                  <div className="panel-head">
                    <div>
                      <h3>Approved Opportunities</h3>
                      <p>Open any approved proposal to invest or start a direct conversation.</p>
                    </div>
                  </div>

                  <div className="opportunity-stack">
                    {visibleApprovedProposals.length === 0 && <div className="empty-state">No approved proposals match the current search.</div>}
                    {visibleApprovedProposals.map((proposal) => (
                      <article className="opportunity-card" key={proposal.id}>
                        <div>
                          <strong>{proposal.title}</strong>
                          <p>{proposal.category} · Target {formatMoney(proposal.required_funding)}</p>
                        </div>
                        <div className="row-actions">
                          <button type="button" className="button-secondary" onClick={() => { setSelectedProposalId(proposal.id); setPage('proposals') }}>
                            Review
                          </button>
                          <button type="button" className="button-secondary" onClick={() => openChat(proposal.id)}>
                            Chat
                          </button>
                          <button type="button" className="button-primary" onClick={() => { setWalletForm({ ...walletForm, proposal: proposal.id }); setPage('wallet') }}>
                            Invest
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                </article>

                <aside className="stack-column">
                  <article className="panel">
                    <div className="panel-head">
                      <div>
                        <h3>Escrow Snapshot</h3>
                      </div>
                    </div>
                    <div className="summary-list">
                      <div><span>Approved proposals</span><strong>{approvedProposals.length}</strong></div>
                      <div><span>Signals sent</span><strong>{signals.length}</strong></div>
                      <div><span>Unread messages</span><strong>{unreadTotal}</strong></div>
                      <div><span>Transaction volume</span><strong>{formatMoney(transactionVolume)}</strong></div>
                    </div>
                  </article>

                  <article className="panel">
                    <div className="panel-head">
                      <div>
                        <h3>Latest Transactions</h3>
                      </div>
                    </div>
                    <div className="ledger-stack">
                      {transactions.slice(0, 4).map((transaction) => (
                        <div className="ledger-item" key={transaction.id}>
                          <div className="ledger-item__icon"><DollarSign size={16} /></div>
                          <div>
                            <strong>{transaction.action}</strong>
                            <p>Proposal #{transaction.proposal}</p>
                          </div>
                          <span className={`status-pill ${actionTone(transaction.action)}`}>{formatMoney(transaction.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </article>
                </aside>
              </div>
            </section>
          )}

          {user && page === 'proposals' && user.role === 'entrepreneur' && (
            <section className="screen workspace-screen">
              <div className="screen-head">
                <div>
                  <h2>Proposal Studio</h2>
                  <p>Publish a new funding round while preserving the same backend submission flow and moderation logic.</p>
                </div>
              </div>

              <div className="proposal-grid proposal-grid--founder">
                <article className="panel panel--info">
                  <h3>Submission checklist</h3>
                  <ul className="check-list">
                    <li>Provide a compelling startup summary and funding need.</li>
                    <li>Attach your document name so admin can review it.</li>
                    <li>Keep timeline and category aligned with the opportunity.</li>
                  </ul>
                  <div className="summary-list">
                    <div><span>Total proposals</span><strong>{proposals.length}</strong></div>
                    <div><span>Pending review</span><strong>{pendingProposals.length}</strong></div>
                    <div><span>Approved rounds</span><strong>{approvedProposals.length}</strong></div>
                  </div>
                </article>

                <article className="panel panel--form">
                  <div className="panel-head">
                    <div>
                      <h3>Submit proposal</h3>
                      <p>The functionality below is unchanged; only the visual structure has been rebuilt from the exported design style.</p>
                    </div>
                  </div>
                  <form key={proposalFormKey} onSubmit={onSubmitProposal} className="form-grid">
                    <input placeholder="Business Title" value={proposalForm.title} onChange={(e) => setProposalForm({ ...proposalForm, title: e.target.value })} required />
                    <input placeholder="Startup Details" value={proposalForm.startup_details} onChange={(e) => setProposalForm({ ...proposalForm, startup_details: e.target.value })} required />
                    <textarea placeholder="Pitch Description" value={proposalForm.description} onChange={(e) => setProposalForm({ ...proposalForm, description: e.target.value })} />
                    <div className="field-row field-row--two">
                      <input placeholder="Category" value={proposalForm.category} onChange={(e) => setProposalForm({ ...proposalForm, category: e.target.value })} required />
                      <input type="number" placeholder="Required Funding" value={proposalForm.required_funding || ''} onChange={(e) => setProposalForm({ ...proposalForm, required_funding: Number(e.target.value) })} required />
                    </div>
                    <div className="field-row field-row--two">
                      <input placeholder="Timeline" value={proposalForm.timeline} onChange={(e) => setProposalForm({ ...proposalForm, timeline: e.target.value })} />
                      <input placeholder="Document name (e.g. Business Plan)" value={proposalForm.document_name} onChange={(e) => setProposalForm({ ...proposalForm, document_name: e.target.value })} />
                    </div>
                    <input placeholder="Pitch video URL" value={proposalForm.pitch_video_url} onChange={(e) => setProposalForm({ ...proposalForm, pitch_video_url: e.target.value })} />
                    <div className="field-row field-row--two">
                      <input placeholder="Startup website URL" value={proposalForm.startup_website_url} onChange={(e) => setProposalForm({ ...proposalForm, startup_website_url: e.target.value })} />
                      <input placeholder="Working system proof video URL" value={proposalForm.proof_video_url} onChange={(e) => setProposalForm({ ...proposalForm, proof_video_url: e.target.value })} />
                    </div>
                    <label>Upload pitch deck / proof document<input type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png" onChange={(e) => setProposalDocumentFile(e.target.files?.[0] ?? null)} /></label>
                    <button type="submit" className="button-primary" disabled={proposalSubmitting}>
                      {proposalSubmitting ? 'Submitting…' : 'Submit Proposal'}
                    </button>
                  </form>
                </article>

                <aside className="panel panel--list">
                  <div className="panel-head">
                    <div>
                      <h3>Your active proposals</h3>
                    </div>
                  </div>
                  <div className="mini-list">
                    {visibleProposals.map((proposal) => (
                      <button type="button" key={proposal.id} className="mini-list__item" onClick={() => setSelectedProposalId(proposal.id)}>
                        <div>
                          <strong>{proposal.title}</strong>
                          <p>{proposal.category}</p>
                        </div>
                        <span className={`status-pill ${statusTone(proposal.status)}`}>{proposal.status}</span>
                      </button>
                    ))}
                    {visibleProposals.length === 0 && (
                      <p style={{padding:'1rem', color:'var(--text-muted)', fontSize:'0.875rem'}}>No proposals yet. Fill out the form to submit your first one.</p>
                    )}
                  </div>
                </aside>
              </div>
            </section>
          )}

          {user && page === 'proposals' && user.role === 'investor' && (
            <section className="screen workspace-screen">
              <div className="screen-head">
                <div>
                  <h2>Proposal Marketplace</h2>
                  <p>Review vetted funding opportunities with the same interest, chat, and invest actions already wired to the backend.</p>
                </div>
              </div>

              {/* Entrepreneur filter sidebar */}
              <div className="entrepreneur-filter-bar">
                <button
                  type="button"
                  className={`entrepreneur-filter-item ${selectedEntrepreneurId === null ? 'active' : ''}`}
                  onClick={() => setSelectedEntrepreneurId(null)}
                >
                  <div className="entrepreneur-filter-item__avatar">All</div>
                  <div className="entrepreneur-filter-item__info">
                    <strong>All Entrepreneurs</strong>
                    <span>{proposals.length} proposals</span>
                  </div>
                </button>
                {uniqueEntrepreneurs.map((ent) => (
                  <button
                    type="button"
                    key={ent.id}
                    className={`entrepreneur-filter-item ${selectedEntrepreneurId === ent.id ? 'active' : ''}`}
                    onClick={() => setSelectedEntrepreneurId(selectedEntrepreneurId === ent.id ? null : ent.id)}
                  >
                    <div className="entrepreneur-filter-item__avatar">{ent.email.slice(0, 2).toUpperCase()}</div>
                    <div className="entrepreneur-filter-item__info">
                      <strong>{ent.email.split('@')[0]}</strong>
                      <span>{ent.proposalCount} proposal{ent.proposalCount !== 1 ? 's' : ''} · {formatMoney(ent.totalFunding)}</span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="proposal-grid proposal-grid--investor">
                <article className="panel panel--table panel--span-2">
                  <div className="panel-head">
                    <div>
                      <h3>Queue Management</h3>
                    </div>
                    <div className="toolbar-row">
                      <span className="segmented-mini">
                        <button type="button" className={investorProposalFilter === 'all' ? 'active' : ''} onClick={() => setInvestorProposalFilter('all')}>All</button>
                        <button type="button" className={investorProposalFilter === 'approved' ? 'active' : ''} onClick={() => setInvestorProposalFilter('approved')}>Approved</button>
                        <button type="button" className={investorProposalFilter === 'pending' ? 'active' : ''} onClick={() => setInvestorProposalFilter('pending')}>Pending</button>
                      </span>
                    </div>
                  </div>

                  <div className="table-shell">
                    <div className="table-shell__head table-shell__head--market">
                      <span>Startup Name</span>
                      <span>Funding Goal</span>
                      <span>Stage</span>
                      <span>Status</span>
                      <span>Actions</span>
                    </div>
                    <div className="table-shell__body">
                      {filteredInvestorMarketplaceProposals.map((proposal) => (
                        <div className="table-row table-row--market" key={proposal.id}>
                          <button type="button" className="table-row__main" onClick={() => setSelectedProposalId(proposal.id)}>
                            <div className="proposal-name-cell">
                              <div className="table-icon"><Briefcase size={16} /></div>
                              <div>
                                <strong>{proposal.title}</strong>
                                <p>{proposal.startup_details || proposal.category}</p>
                              </div>
                            </div>
                          </button>
                          <span>{formatMoney(proposal.required_funding)}</span>
                          <span className="status-pill tone-neutral">{proposal.category}</span>
                          <span className={`status-pill ${statusTone(proposal.status)}`}>{proposal.status}</span>
                          <div className="row-actions">
                            <button type="button" className="button-primary button-primary--small" onClick={() => onSendInterest(proposal.id)}>Interested</button>
                            <button type="button" className="button-secondary button-secondary--small" onClick={() => openChat(proposal.id)}>Chat</button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </article>

                <aside className="panel panel--detail">
                  <div className="panel-head">
                    <div>
                      <h3>Proposal Detail</h3>
                    </div>
                  </div>

                  {selectedProposal ? (
                    <div className="detail-card detail-card--full">
                      <h4>{selectedProposal.title}</h4>
                      <p>{selectedProposal.description || 'No description provided.'}</p>
                      <div className="summary-list">
                        <div><span>Category</span><strong>{selectedProposal.category}</strong></div>
                        <div><span>Status</span><strong>{selectedProposal.status}</strong></div>
                        <div><span>Funding target</span><strong>{formatMoney(selectedProposal.required_funding)}</strong></div>
                        <div><span>Timeline</span><strong>{selectedProposal.timeline || 'N/A'}</strong></div>
                        <div><span>Last updated</span><strong>{formatRelativeTime(selectedProposal.updated_at || selectedProposal.created_at)}</strong></div>
                        <div><span>Document</span><strong>{selectedProposal.document_file ? <button type="button" className="text-button" onClick={() => onDownloadFile(selectedProposal.document_file, selectedProposal.document_name || 'proposal-document')}>Download file</button> : selectedProposal.document_name || 'N/A'}</strong></div>
                      </div>
                      <div className="detail-card__links">
                        {selectedProposal.startup_website_url && <a href={selectedProposal.startup_website_url} target="_blank" rel="noreferrer">Startup website</a>}
                        {selectedProposal.pitch_video_url && <a href={selectedProposal.pitch_video_url} target="_blank" rel="noreferrer">Pitch video</a>}
                        {selectedProposal.proof_video_url && <a href={selectedProposal.proof_video_url} target="_blank" rel="noreferrer">Working system proof video</a>}
                      </div>
                      <div className="detail-actions detail-actions--column">
                        <button type="button" className="button-primary" onClick={() => onSendInterest(selectedProposal.id)}>Send Interest</button>
                        <button type="button" className="button-secondary" onClick={() => openChat(selectedProposal.id)}>Open Chat</button>
                        <button type="button" className="button-secondary" disabled={selectedProposal.status !== 'approved'} onClick={() => { setWalletForm({ ...walletForm, proposal: selectedProposal.id }); setPage('wallet') }}>
                          Invest via Wallet
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">Select a proposal from the marketplace to inspect its detail and take action.</div>
                  )}
                </aside>
              </div>
            </section>
          )}

          {user && page === 'wallet' && (
            <section className="screen wallet-screen">
              <div className="screen-head">
                <div>
                  <h2>{user.role === 'investor' ? 'Virtual Escrow Wallet' : 'Escrow Visibility'}</h2>
                  <p>{user.role === 'investor' ? 'Fund approved proposals through escrow or create a Stripe intent without changing the existing payment backend flow.' : 'Read-only entrepreneur view into held funds and transaction activity.'}</p>
                </div>
              </div>

              <div className="wallet-summary-grid">
                <article className="metric-card metric-card--wallet">
                  <span>Available Capital</span>
                  <strong>{user.role === 'investor' ? investorCapital : formatMoney(totalFundingRaised)}</strong>
                  <small><TrendingUp size={14} /> Live balance</small>
                </article>
                <article className="metric-card metric-card--wallet">
                  <span>In Escrow</span>
                  <strong>{formatMoney(user.role === 'investor' ? walletBalance?.in_escrow : escrowSummary?.total_escrow)}</strong>
                  <small><Wallet size={14} /> {transactions.length} active holdings</small>
                </article>
                <article className="metric-card metric-card--wallet">
                  <span>Transaction Count</span>
                  <strong>{transactions.length}</strong>
                  <small><Clock3 size={14} /> Live ledger count</small>
                </article>
              </div>

              <div className="wallet-layout">
                <article className="panel panel--wallet-form">
                  <div className="panel-head">
                    <div>
                      <h3>{user.role === 'investor' ? 'Fund New Proposal' : 'Escrow Overview'}</h3>
                    </div>
                  </div>

                  {user.role === 'investor' ? (
                    <form onSubmit={onInvest} className="form-grid wallet-form-grid">
                      <div>
                        <label>Payment Method</label>
                        <div className="segmented-control segmented-control--wallet">
                          <button type="button" className={walletForm.method === 'virtual-escrow' ? 'active' : ''} onClick={() => setWalletForm({ ...walletForm, method: 'virtual-escrow' })}>
                            Escrow Wallet
                          </button>
                          <button type="button" className={walletForm.method === 'stripe' ? 'active' : ''} onClick={() => setWalletForm({ ...walletForm, method: 'stripe' })}>
                            Stripe Card
                          </button>
                        </div>
                      </div>

                      <div>
                        <label>Select Proposal</label>
                        <select value={walletForm.proposal} onChange={(e) => setWalletForm({ ...walletForm, proposal: Number(e.target.value) })}>
                          <option value={0}>Select Proposal</option>
                          {visibleApprovedProposals.map((proposal) => (
                            <option key={proposal.id} value={proposal.id}>{proposal.title}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label>Funding Amount</label>
                        <input type="number" value={walletForm.amount} onChange={(e) => setWalletForm({ ...walletForm, amount: Number(e.target.value) })} />
                        <p className="field-hint">Backend validates remaining funding, available balance, and accepted agreement.</p>
                      </div>

                      <div className="field-row field-row--two">
                        <input placeholder="Equity % (optional)" value={walletForm.equity_percentage} onChange={(e) => setWalletForm({ ...walletForm, equity_percentage: e.target.value })} />
                        <input placeholder="Profit share % (optional)" value={walletForm.profit_share_percentage} onChange={(e) => setWalletForm({ ...walletForm, profit_share_percentage: e.target.value })} />
                      </div>
                      <div className="field-row field-row--two">
                        <input type="number" placeholder="Term months" value={walletForm.term_months} onChange={(e) => setWalletForm({ ...walletForm, term_months: Number(e.target.value) })} />
                        <input placeholder="Type legal name to accept" value={walletForm.accepted_name} onChange={(e) => setWalletForm({ ...walletForm, accepted_name: e.target.value })} />
                      </div>
                      <textarea placeholder="Expected return / profit note" value={walletForm.expected_return_note} onChange={(e) => setWalletForm({ ...walletForm, expected_return_note: e.target.value })} />
                      <label className="checkbox-line">
                        <input type="checkbox" checked={walletForm.accept_terms} onChange={(e) => setWalletForm({ ...walletForm, accept_terms: e.target.checked })} />
                        I accept the VentureLedger investment agreement snapshot for this proposal and understand returns are not guaranteed.
                      </label>

                      <button type="submit" className="button-primary button-primary--full">
                        <Wallet size={16} /> {walletForm.method === 'stripe' ? 'Pay with Card' : 'Fund Escrow'}
                      </button>

                      {stripeClientSecret && (
                        <div className="stripe-elements-wrapper">
                          <p className="stripe-elements-label">💳 Enter card details to complete your investment</p>
                          {STRIPE_PK ? (
                            <Elements
                              stripe={stripePromise}
                              options={{
                                clientSecret: stripeClientSecret,
                                appearance: { theme: 'stripe', variables: { colorPrimary: '#6366f1', borderRadius: '8px' } },
                              }}
                            >
                              <StripeCheckoutForm
                                onSuccess={async () => {
                                  setStripeClientSecret('')
                                  setPendingIntentId('')
                                  if (user) await refreshAll(user)
                                  setStatusText('✅ Payment successful! Your investment has been recorded.')
                                }}
                                onError={(msg) => setStatusText(`❌ ${msg}`)}
                              />
                            </Elements>
                          ) : (
                            <p className="field-hint" style={{ color: 'var(--danger)', fontSize: '0.875rem' }}>
                              ⚠️ Stripe is not configured. Add VITE_STRIPE_PUBLIC_KEY to the frontend .env file.
                            </p>
                          )}
                        </div>
                      )}

                      {pendingIntentId && !stripeClientSecret && (
                        <div className="intent-box">
                          <span>Pending intent: {pendingIntentId}</span>
                          <button type="button" className="button-secondary button-secondary--small" onClick={onCheckIntentStatus}>
                            Check Stripe Status
                          </button>
                        </div>
                      )}
                    </form>
                  ) : (
                    <div className="detail-card detail-card--full">
                      <h4>Founder escrow snapshot</h4>
                      <p>Entrepreneurs retain a read-only view here while admin settlement flows and investor funding continue to operate through the same backend actions.</p>
                      <div className="summary-list">
                        <div><span>Total escrow</span><strong>{formatMoney(escrowSummary?.total_escrow)}</strong></div>
                        <div><span>Transactions</span><strong>{transactions.length}</strong></div>
                        <div><span>Unread messages</span><strong>{unreadTotal}</strong></div>
                      </div>
                    </div>
                  )}
                </article>

                <article className="panel panel--table">
                  <div className="panel-head">
                    <div>
                      <h3>Transaction History</h3>
                    </div>
                    <button type="button" className="text-button" onClick={() => setShowAllTransactions((previous) => !previous)}>{showAllTransactions ? 'Collapse' : 'View All'}</button>
                  </div>
                  <div className="ledger-stack">
                    {transactions.length === 0 && <div className="empty-state">No transaction activity yet.</div>}
                    {(showAllTransactions ? transactions : transactions.slice(0, 8)).map((transaction) => (
                      <div className="ledger-item ledger-item--rich" key={transaction.id}>
                        <div className="ledger-item__icon">
                          {transaction.action === 'refund' ? <XCircle size={16} /> : transaction.action === 'invest' ? <TrendingUp size={16} /> : <Wallet size={16} />}
                        </div>
                        <div className="ledger-item__content">
                          <strong>{proposals.find((proposal) => proposal.id === transaction.proposal)?.title || `Proposal #${transaction.proposal}`}</strong>
                          <p>{transaction.action} · {transaction.method} · Tx #{transaction.id}</p>
                        </div>
                        <div className="ledger-item__meta">
                          <strong>{formatMoney(transaction.amount)}</strong>
                          <span className={`status-pill ${actionTone(transaction.action)}`}>{transaction.action}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              </div>
            </section>
          )}

          {user && page === 'chat' && (
            <section className="screen workspace-screen">
              <div className="screen-head">
                <div>
                  <h2>Communication Hub</h2>
                  <p>Proposal-specific conversations, unread tracking, and investment context in one structured workspace.</p>
                </div>
              </div>

              <div className="chat-shell">
                <aside className="panel panel--chat-list">
                  <div className="panel-head">
                    <div>
                      <h3>Conversations</h3>
                    </div>
                  </div>
                  <div className="chat-list">
                    {visibleChats.length === 0 && <div className="empty-state">No conversations match the current search.</div>}
                    {visibleChats.map((chat) => (
                      <button type="button" key={chat.id} className={`chat-list__item ${selectedProposalId === chat.proposal ? 'active' : ''}`} onClick={() => openChat(chat.proposal)}>
                        <div className="avatar-circle avatar-circle--soft">{initials(chat.proposal_title)}</div>
                        <div>
                          <strong>{chat.proposal_title}</strong>
                          <p>{compactText(chat.last_message) || 'No messages yet'}</p>
                        </div>
                        <span className="status-pill tone-neutral">{chat.unread_count || 0}</span>
                      </button>
                    ))}
                  </div>
                </aside>

                <article className="panel panel--chat-main">
                  <div className="panel-head">
                    <div>
                      <h3>{selectedProposal ? selectedProposal.title : 'Active Thread'}</h3>
                      <p>{selectedProposal ? selectedProposal.category : 'Select a proposal conversation'}</p>
                    </div>
                  </div>
                  <div className="chat-window">
                    {messages.length === 0 && <div className="empty-state">No messages in this thread yet.</div>}
                    {messages.map((message) => (
                      <div key={message.id} className={`message-bubble ${message.sender === user.id ? 'message-bubble--own' : ''}`}>
                        <small>{message.sender_email}</small>
                        <p>{compactText(message.content)}</p>
                      </div>
                    ))}
                  </div>
                  <form onSubmit={onSendMessage} className="chat-composer">
                    <input value={messageDraft} onChange={(e) => setMessageDraft(e.target.value)} placeholder="Type message..." />
                    <button type="submit" className="button-primary"><SendHorizontal size={16} /> Send</button>
                  </form>
                </article>

                <aside className="panel panel--detail">
                  <div className="panel-head">
                    <div>
                      <h3>Proposal Context</h3>
                    </div>
                  </div>
                  {selectedProposal ? (
                    <div className="detail-card detail-card--full">
                      <h4>{selectedProposal.title}</h4>
                      <p>{selectedProposal.description || 'No description provided.'}</p>
                      <div className="summary-list">
                        <div><span>Category</span><strong>{selectedProposal.category}</strong></div>
                        <div><span>Status</span><strong>{selectedProposal.status}</strong></div>
                        <div><span>Funding target</span><strong>{formatMoney(selectedProposal.required_funding)}</strong></div>
                      </div>
                      <div className="detail-actions detail-actions--column">
                        <button type="button" className="button-secondary" onClick={() => setPage('proposals')}>View Proposal</button>
                        {user.role === 'investor' && (
                          <button type="button" className="button-primary" onClick={() => { setWalletForm({ ...walletForm, proposal: selectedProposal.id }); setPage('wallet') }}>
                            Invest
                          </button>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="empty-state">Select a conversation to view proposal context.</div>
                  )}
                </aside>
              </div>
            </section>
          )}

          {user && isAdmin && page === 'admin' && (
            <section className="screen admin-screen">
              <div className="screen-head">
                <div>
                  <h2>
                    {adminView === 'users'
                      ? 'User Management'
                      : adminView === 'proposals'
                        ? 'Proposal Moderation'
                        : adminView === 'escrow'
                          ? 'Escrow Settlements'
                          : 'System Logs'}
                  </h2>
                  <p>
                    {adminView === 'users'
                      ? 'Verify credentials, manage access levels, and monitor ecosystem health.'
                      : adminView === 'proposals'
                        ? 'Review and manage incoming investment opportunities across the ledger.'
                        : adminView === 'escrow'
                          ? 'Manage and authorize secure institutional fund transfers.'
                          : 'Audit activity from proposals, signals, and escrow operations.'}
                  </p>
                </div>
                <div className="screen-head__actions">
                  <button type="button" className="button-secondary" onClick={() => setWorkspaceQuery('')}><Filter size={16} /> Reset Search</button>
                  <button type="button" className="button-secondary" onClick={onDownloadReport}><Download size={16} /> Export</button>
                </div>
              </div>

              <div className="segmented-control segmented-control--admin">
                <button type="button" className={adminView === 'users' ? 'active' : ''} onClick={() => setAdminView('users')}>User Registry</button>
                <button type="button" className={adminView === 'proposals' ? 'active' : ''} onClick={() => setAdminView('proposals')}>Proposal Queue</button>
                <button type="button" className={adminView === 'escrow' ? 'active' : ''} onClick={() => setAdminView('escrow')}>Escrow Ledger</button>
                <button type="button" className={adminView === 'logs' ? 'active' : ''} onClick={() => setAdminView('logs')}>System Logs</button>
              </div>

              {adminView === 'users' && (
                <>
                  <div className="metric-grid metric-grid--admin">
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--primary"><Users size={18} /></div>
                      <span>Total Users</span>
                      <strong>{users.length}</strong>
                      <small>+12.4%</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--tertiary"><BadgeCheck size={18} /></div>
                      <span>Pending Verifications</span>
                      <strong>{users.filter((entry) => !entry.verified).length}</strong>
                      <small>Action needed</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--danger"><AlertTriangle size={18} /></div>
                      <span>Flagged Accounts</span>
                      <strong>{users.filter((entry) => entry.frozen).length}</strong>
                      <small>High priority</small>
                    </article>
                    <article className="metric-card metric-card--highlight">
                      <span>KYC Completion Rate</span>
                      <strong>{users.length ? `${Math.round((users.filter((entry) => entry.verified).length / users.length) * 100)}%` : '0%'}</strong>
                      <div className="progress-bar"><span style={{ width: `${users.length ? (users.filter((entry) => entry.verified).length / users.length) * 100 : 0}%` }} /></div>
                    </article>
                  </div>

                  <article className="panel panel--table">
                    <div className="panel-head">
                      <div><h3>User Registry</h3></div>
                      <div className="toolbar-row">
                        <span className="segmented-mini">
                          <button type="button" className={adminUserFilter === 'all' ? 'active' : ''} onClick={() => setAdminUserFilter('all')}>All</button>
                          <button type="button" className={adminUserFilter === 'active' ? 'active' : ''} onClick={() => setAdminUserFilter('active')}>Active</button>
                          <button type="button" className={adminUserFilter === 'frozen' ? 'active' : ''} onClick={() => setAdminUserFilter('frozen')}>Frozen</button>
                        </span>
                      </div>
                    </div>
                    <div className="table-shell">
                      <div className="table-shell__head table-shell__head--admin-users">
                        <span>Name & Identification</span>
                        <span>Role</span>
                        <span>Status</span>
                        <span>Join Date</span>
                        <span>Actions</span>
                      </div>
                      <div className="table-shell__body">
                        {filteredAdminUsers.map((entry) => (
                          <div className="table-row table-row--admin-users" key={entry.id}>
                            <div className="user-cell">
                              <div className="avatar-circle avatar-circle--soft">{initials(entry.email)}</div>
                              <div>
                                <strong>{entry.first_name || entry.last_name ? `${entry.first_name || ''} ${entry.last_name || ''}`.trim() : entry.email.split('@')[0]}</strong>
                                <p>{entry.email}</p>
                                <p>KYC: {verificationStatus(entry)} {entry.verification?.phone_number ? `· ${entry.verification.phone_number}` : ''}</p>
                                {entry.verification?.admin_message && <p>Admin note: {entry.verification.admin_message}</p>}
                                <div className="inline-links">
                                  {entry.verification?.identity_front && <button type="button" className="text-button" onClick={() => onDownloadFile(entry.verification?.identity_front, `${entry.email}-id-front`)}>ID front</button>}
                                  {entry.verification?.identity_back && <button type="button" className="text-button" onClick={() => onDownloadFile(entry.verification?.identity_back, `${entry.email}-id-back`)}>ID back</button>}
                                  {entry.verification?.passport_photo && <button type="button" className="text-button" onClick={() => onDownloadFile(entry.verification?.passport_photo, `${entry.email}-passport`)}>Passport</button>}
                                  {entry.verification?.proof_video_url && <a href={entry.verification.proof_video_url} target="_blank" rel="noreferrer">Proof video</a>}
                                </div>
                              </div>
                            </div>
                            <span className="status-pill tone-neutral">{entry.role}</span>
                            <div className="status-stack">
                              <span className={`status-dot ${entry.verified ? 'status-dot--success' : 'status-dot--warning'}`} />
                              <span>{entry.frozen ? 'Frozen' : entry.verified ? 'Verified' : 'Unverified'}</span>
                            </div>
                            <span>{formatDateTime(entry.date_joined)}</span>
                            <div className="user-actions">
                              {/* Contextual primary button based on KYC state */}
                              {verificationStatus(entry) === 'submitted' ? (
                                <button type="button" className="button-secondary button-secondary--small button-secondary--warning" onClick={() => { setKycDetailTarget(entry); setShowKycDetailModal(true) }}>
                                  Review KYC
                                </button>
                              ) : entry.frozen ? (
                                <button type="button" className="button-secondary button-secondary--small button-secondary--danger" onClick={() => onToggleUserFlag(entry, 'frozen')}>
                                  Unfreeze
                                </button>
                              ) : (
                                <button type="button" className="button-secondary button-secondary--small" onClick={() => { setKycDetailTarget(entry); setShowKycDetailModal(true) }}>
                                  View KYC
                                </button>
                              )}
                              {/* Three-dot dropdown for all other actions */}
                              <div
                                className="action-menu"
                                tabIndex={-1}
                                onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpenActionMenu(null) }}
                              >
                                <button
                                  type="button"
                                  className="action-menu__trigger"
                                  onClick={(e) => { e.stopPropagation(); setOpenActionMenu(openActionMenu === entry.id ? null : entry.id) }}
                                  title="More actions"
                                >
                                  <MoreVertical size={15} />
                                </button>
                                {openActionMenu === entry.id && (
                                  <div className="action-menu__dropdown">
                                    {verificationStatus(entry) !== 'submitted' && (
                                      <button type="button" className="action-menu__item" onClick={() => { setKycDetailTarget(entry); setShowKycDetailModal(true); setOpenActionMenu(null) }}>
                                        <Eye size={13} /> View KYC
                                      </button>
                                    )}
                                    <button type="button" className="action-menu__item" onClick={() => { onToggleUserFlag(entry, 'verified'); setOpenActionMenu(null) }}>
                                      <BadgeCheck size={13} /> {entry.verified ? 'Unverify' : 'Verify'}
                                    </button>
                                    <button type="button" className="action-menu__item" onClick={() => { onToggleUserFlag(entry, 'frozen'); setOpenActionMenu(null) }}>
                                      <ShieldCheck size={13} /> {entry.frozen ? 'Unfreeze' : 'Freeze'}
                                    </button>
                                    {verificationStatus(entry) === 'submitted' && (
                                      <>
                                        <button type="button" className="action-menu__item" onClick={() => { onReviewVerification(entry, 'approved'); setOpenActionMenu(null) }}>
                                          <BadgeCheck size={13} /> Approve KYC
                                        </button>
                                        <button type="button" className="action-menu__item action-menu__item--danger" onClick={() => { onReviewVerification(entry, 'rejected'); setOpenActionMenu(null) }}>
                                          <XCircle size={13} /> Reject KYC
                                        </button>
                                      </>
                                    )}
                                    <div className="action-menu__separator" />
                                    <button type="button" className="action-menu__item action-menu__item--danger" onClick={() => { onDeleteUser(entry); setOpenActionMenu(null) }}>
                                      <Trash2 size={13} /> Delete
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </>
              )}

              {adminView === 'proposals' && (
                <>
                  <div className="metric-grid metric-grid--admin">
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--primary"><Clock3 size={18} /></div>
                      <span>Pending Proposals</span>
                      <strong>{pendingProposals.length}</strong>
                      <small>Live moderation queue</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--tertiary"><TrendingUp size={18} /></div>
                      <span>Approval Rate</span>
                      <strong>{proposals.length ? `${Math.round((approvedProposals.length / proposals.length) * 100)}%` : '0%'}</strong>
                      <small>{approvedProposals.length} approved</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--secondary"><Wallet size={18} /></div>
                      <span>Active Funding Rounds</span>
                      <strong>{approvedProposals.length}</strong>
                      <small>Active</small>
                    </article>
                  </div>

                  <article className="panel panel--table">
                    <div className="panel-head">
                      <div>
                        <h3>Queue Management</h3>
                      </div>
                      <div className="toolbar-row">
                        <span className="segmented-mini">
                          <button type="button" className={adminProposalFilter === 'all' ? 'active' : ''} onClick={() => setAdminProposalFilter('all')}>All</button>
                          <button type="button" className={adminProposalFilter === 'pending' ? 'active' : ''} onClick={() => setAdminProposalFilter('pending')}>Pending</button>
                          <button type="button" className={adminProposalFilter === 'approved' ? 'active' : ''} onClick={() => setAdminProposalFilter('approved')}>Approved</button>
                          <button type="button" className={(adminProposalFilter as string) === 'kyc-verified' ? 'active' : ''} onClick={() => setAdminProposalFilter('kyc-verified' as 'approved')}>KYC Verified</button>
                          <button type="button" className={(adminProposalFilter as string) === 'kyc-unverified' ? 'active' : ''} onClick={() => setAdminProposalFilter('kyc-unverified' as 'approved')}>Non-KYC</button>
                        </span>
                      </div>
                    </div>

                    <div className="table-shell">
                      <div className="table-shell__head table-shell__head--admin-proposals">
                        <span>Startup Name</span>
                        <span>Funding Goal</span>
                        <span>Stage</span>
                        <span>Status</span>
                        <span>Actions</span>
                      </div>
                      <div className="table-shell__body">
                        {filteredAdminProposals.map((proposal) => (
                          <div className="table-row table-row--admin-proposals" key={proposal.id}>
                            <div className="proposal-name-cell">
                              <div className="table-icon"><Briefcase size={16} /></div>
                              <div>
                                <strong>{proposal.title}</strong>
                                <p>{proposal.startup_details || proposal.category}</p>
                                <p className={`kyc-badge ${(() => { const owner = users.find(u => u.id === proposal.entrepreneur); const st = owner?.verification?.status; return st === 'approved' ? 'kyc-badge--ok' : st === 'rejected' ? 'kyc-badge--bad' : 'kyc-badge--pending' })()}`}>
                                  KYC: {(() => { const owner = users.find(u => u.id === proposal.entrepreneur); return owner?.verification?.status ?? (owner?.verified ? 'approved' : 'not submitted') })()}
                                </p>
                              </div>
                            </div>
                            <span>{formatMoney(proposal.required_funding)}</span>
                            <span className="status-pill tone-neutral">{proposal.category}</span>
                            <span className={`status-pill ${statusTone(proposal.status)}`}>{proposal.status}</span>
                            <div className="row-actions">
                              <button type="button" className="button-primary button-primary--small" onClick={() => onAdminApproveProposal(proposal.id)}>Approve</button>
                              <button type="button" className="button-secondary button-secondary--small" onClick={() => onAdminSetPending(proposal.id)}>Pending</button>
                              <button type="button" className="button-secondary button-secondary--small button-secondary--danger" onClick={() => onAdminRejectProposal(proposal.id)}>Reject</button>
                              <button type="button" className="button-secondary button-secondary--small button-secondary--danger" onClick={() => onDeleteProposal(proposal.id)}><Trash2 size={14} /> Delete</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </article>
                </>
              )}

              {adminView === 'escrow' && (
                <>
                  <div className="metric-grid metric-grid--admin">
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--primary"><Wallet size={18} /></div>
                      <span>Total Held in Escrow</span>
                      <strong>{formatMoney(escrowSummary?.total_escrow)}</strong>
                      <small>Live escrow ledger</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--danger"><AlertTriangle size={18} /></div>
                      <span>Settlements Pending</span>
                      <strong>{transactions.length}</strong>
                      <small>Critical review</small>
                    </article>
                    <article className="metric-card">
                      <div className="metric-card__icon metric-card__icon--secondary"><TrendingUp size={18} /></div>
                      <span>24h Volume</span>
                      <strong>{formatMoney(transactionVolume)}</strong>
                      <small>Stable</small>
                    </article>
                  </div>

                  <article className="panel panel--table">
                    <div className="panel-head">
                      <div>
                        <h3>Active Transactions Ledger</h3>
                      </div>
                      <div className="toolbar-row">
                        <span className="status-pill tone-info">Active</span>
                        <span className="status-pill tone-neutral">Archived</span>
                      </div>
                    </div>
                    <div className="table-shell">
                      <div className="table-shell__head table-shell__head--admin-escrow">
                        <span>Transaction ID</span>
                        <span>Asset / Counterparty</span>
                        <span>Amount</span>
                        <span>Status</span>
                        <span>Date</span>
                        <span>Actions</span>
                      </div>
                      <div className="table-shell__body">
                        {filteredEscrowTransactions.map((transaction) => {
                          const linkedProposal = proposals.find((proposal) => proposal.id === transaction.proposal)
                          return (
                            <div className="table-row table-row--admin-escrow" key={transaction.id}>
                              <span>TXN-{transaction.id}</span>
                              <div className="proposal-name-cell">
                                <div className="table-icon"><Wallet size={16} /></div>
                                <div>
                                  <strong>{linkedProposal?.title || `Proposal #${transaction.proposal}`}</strong>
                                  <p>{transaction.method}</p>
                                </div>
                              </div>
                              <span>{formatMoney(transaction.amount)}</span>
                              <span className={`status-pill ${actionTone(transaction.action)}`}>{transaction.action}</span>
                              <span>{formatDateTime(transaction.created_at)}</span>
                              <div className="row-actions">
                                <button type="button" className="button-primary button-primary--small" onClick={() => onAdminSettlement(transaction.proposal, 'release')}>Release</button>
                                <button type="button" className="button-secondary button-secondary--small button-secondary--danger" onClick={() => onAdminSettlement(transaction.proposal, 'refund')}>Refund</button>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </article>
                </>
              )}

              {adminView === 'logs' && (
                <article className="panel panel--table">
                  <div className="panel-head">
                    <div>
                      <h3>System Activity Logs</h3>
                      <p>Aggregated from live proposals, signals, and escrow records.</p>
                    </div>
                  </div>
                  <div className="ledger-stack">
                    {recentSystemLogs.length === 0 && <div className="empty-state">No system events available yet.</div>}
                    {recentSystemLogs.map((log) => (
                      <div className="ledger-item ledger-item--rich" key={log.id}>
                        <div className="ledger-item__icon"><History size={16} /></div>
                        <div className="ledger-item__content">
                          <strong>{log.category}</strong>
                          <p>{log.detail}</p>
                        </div>
                        <div className="ledger-item__meta">
                          <span className="status-pill tone-neutral">Live</span>
                          <small>{log.meta}</small>
                        </div>
                      </div>
                    ))}
                  </div>
                </article>
              )}
            </section>
          )}
        </main>
      </div>

      {/* ── ENTREPRENEUR PROPOSAL DETAIL MODAL ── */}
      {selectedProposal && user?.role === 'entrepreneur' && page === 'proposals' && (
        <div className="proposal-detail-overlay" onClick={() => setSelectedProposalId(null)}>
          <div className="proposal-detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="proposal-detail-modal__header">
              <div>
                <h2>{selectedProposal.title}</h2>
                <p className="proposal-detail-modal__category">{selectedProposal.category}</p>
              </div>
              <button type="button" className="modal-close-btn" onClick={() => setSelectedProposalId(null)}>✕</button>
            </div>

            <div className="proposal-detail-modal__body">
              <div className="proposal-detail-modal__status-row">
                <span className={`status-pill ${statusTone(selectedProposal.status)}`}>{selectedProposal.status}</span>
                <span className="proposal-detail-modal__funding">Funding Target: <strong>{formatMoney(selectedProposal.required_funding)}</strong></span>
                {selectedProposal.timeline && <span className="proposal-detail-modal__timeline">Timeline: <strong>{selectedProposal.timeline}</strong></span>}
              </div>

              {selectedProposal.admin_message && (
                <div className="proposal-detail-modal__admin-msg">
                  <AlertTriangle size={15} />
                  <div><strong>Admin Message:</strong> {selectedProposal.admin_message}</div>
                </div>
              )}

              {selectedProposal.description && (
                <div className="proposal-detail-modal__section">
                  <span className="proposal-detail-modal__label">Description</span>
                  <p>{selectedProposal.description}</p>
                </div>
              )}

              {selectedProposal.startup_details && (
                <div className="proposal-detail-modal__section">
                  <span className="proposal-detail-modal__label">Startup Details</span>
                  <p>{selectedProposal.startup_details}</p>
                </div>
              )}

              <div className="proposal-detail-modal__links">
                {selectedProposal.startup_website_url && (
                  <a href={selectedProposal.startup_website_url} target="_blank" rel="noreferrer" className="proposal-detail-modal__link-btn">
                    🌐 Startup Website
                  </a>
                )}
                {selectedProposal.pitch_video_url && (
                  <a href={selectedProposal.pitch_video_url} target="_blank" rel="noreferrer" className="proposal-detail-modal__link-btn">
                    🎬 Pitch Video
                  </a>
                )}
                {selectedProposal.proof_video_url && (
                  <a href={selectedProposal.proof_video_url} target="_blank" rel="noreferrer" className="proposal-detail-modal__link-btn">
                    📹 System Proof Video
                  </a>
                )}
                {selectedProposal.document_file && (
                  <button type="button" className="proposal-detail-modal__link-btn" onClick={() => onDownloadFile(selectedProposal.document_file, selectedProposal.document_name || 'proposal-document')}>
                    📄 Download Document
                  </button>
                )}
              </div>
            </div>

            <div className="proposal-detail-modal__footer">
              <button type="button" className="button-secondary" onClick={() => setSelectedProposalId(null)}>Close</button>
              <button type="button" className="button-secondary button-secondary--danger" onClick={() => { onDeleteProposal(selectedProposal.id); setSelectedProposalId(null) }}>
                <Trash2 size={15} /> Delete Proposal
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── GLOBAL KYC INCOMPLETE ALERT (no KYC submitted yet, shown on every page load) ── */}
      {user && user.role !== 'admin' && !user.verification && page !== 'landing' && page !== 'auth' && (
        <div className="kyc-rejection-banner kyc-incomplete-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>KYC Required:</strong>{' '}Your identity is not verified. Complete KYC to access all platform features.
          </div>
          <button type="button" className="button-primary button-secondary--small" onClick={() => setShowKycModal(true)}>
            Complete KYC
          </button>
        </div>
      )}

      {/* ── GLOBAL KYC REJECTION ALERT ── */}
      {user && user.role === 'entrepreneur' && user.verification?.status === 'rejected' && (
        <div className="kyc-rejection-banner">
          <AlertTriangle size={18} />
          <div>
            <strong>KYC Rejected:</strong>{' '}
            {user.verification.admin_message || 'Your KYC was rejected. Please update your details and resubmit.'}
          </div>
          <button type="button" className="button-secondary button-secondary--small" onClick={() => setPage('profile')}>
            Update KYC
          </button>
        </div>
      )}

      {/* ── GLOBAL KYC APPROVED NOTIFICATION ── */}
      {user && user.role === 'entrepreneur' && user.verification?.status === 'approved' && showKycApprovedBanner && page !== 'landing' && page !== 'auth' && (
        <div className="kyc-approved-banner">
          <BadgeCheck size={18} />
          <div><strong>KYC Approved!</strong> Your identity is verified. You can now submit proposals and use all platform features.</div>
          <button type="button" className="banner-dismiss" onClick={() => setShowKycApprovedBanner(false)}>✕</button>
        </div>
      )}

      {/* ── ADMIN KYC DETAIL MODAL ── */}
      {showKycDetailModal && kycDetailTarget && (
        <div className="kyc-modal-overlay" onClick={() => setShowKycDetailModal(false)}>
          <div className="kyc-modal kyc-modal--detail" onClick={(e) => e.stopPropagation()}>
            <div className="kyc-modal__header">
              <div className="kyc-modal__icon"><ShieldCheck size={24} /></div>
              <h2>KYC Details — {kycDetailTarget.first_name} {kycDetailTarget.last_name}</h2>
              <p>{kycDetailTarget.email}</p>
            </div>
            <div className="kyc-detail-grid">
              {kycDetailLoading && (
                <div className="kyc-detail-full" style={{ textAlign: 'center', padding: '0.5rem 0', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Loading latest data…
                </div>
              )}
              <div><span>Status</span><strong className={`status-pill ${statusTone(verificationStatus(kycDetailTarget))}`}>{verificationStatus(kycDetailTarget)}</strong></div>
              <div><span>Phone</span><strong>{kycDetailTarget.verification?.phone_number || 'N/A'}</strong></div>
              <div><span>Identity Type</span><strong>{kycDetailTarget.verification?.identity_type || 'N/A'}</strong></div>
              <div><span>Identity Number</span><strong>{kycDetailTarget.verification?.identity_number || 'N/A'}</strong></div>
              <div className="kyc-detail-full"><span>Address</span><strong>{kycDetailTarget.verification?.address || 'N/A'}</strong></div>
              <div><span>Startup Website</span><strong>{kycDetailTarget.verification?.startup_website_url ? <a href={kycDetailTarget.verification.startup_website_url} target="_blank" rel="noreferrer">{kycDetailTarget.verification.startup_website_url}</a> : 'N/A'}</strong></div>
              <div><span>Proof Video URL</span><strong>{kycDetailTarget.verification?.proof_video_url ? <a href={kycDetailTarget.verification.proof_video_url} target="_blank" rel="noreferrer">Watch Video</a> : 'N/A'}</strong></div>
              <div><span>LinkedIn</span><strong>{kycDetailTarget.verification?.linkedin_url ? <a href={kycDetailTarget.verification.linkedin_url} target="_blank" rel="noreferrer">LinkedIn ↗</a> : 'N/A'}</strong></div>
              <div><span>Twitter/X</span><strong>{kycDetailTarget.verification?.twitter_url ? <a href={kycDetailTarget.verification.twitter_url} target="_blank" rel="noreferrer">Twitter ↗</a> : 'N/A'}</strong></div>
              <div><span>Facebook</span><strong>{kycDetailTarget.verification?.facebook_url ? <a href={kycDetailTarget.verification.facebook_url} target="_blank" rel="noreferrer">Facebook ↗</a> : 'N/A'}</strong></div>
              <div><span>Instagram</span><strong>{kycDetailTarget.verification?.instagram_url ? <a href={kycDetailTarget.verification.instagram_url} target="_blank" rel="noreferrer">Instagram ↗</a> : 'N/A'}</strong></div>
              {kycDetailTarget.verification?.identity_front && (
                <div><span>ID Front</span><strong><button type="button" className="text-button" onClick={() => onDownloadFile(kycDetailTarget.verification!.identity_front!, 'id-front')}>Download</button></strong></div>
              )}
              {kycDetailTarget.verification?.identity_back && (
                <div><span>ID Back</span><strong><button type="button" className="text-button" onClick={() => onDownloadFile(kycDetailTarget.verification!.identity_back!, 'id-back')}>Download</button></strong></div>
              )}
              {kycDetailTarget.verification?.passport_photo && (
                <div><span>Passport Photo</span><strong><button type="button" className="text-button" onClick={() => onDownloadFile(kycDetailTarget.verification!.passport_photo!, 'passport')}>Download</button></strong></div>
              )}
              {kycDetailTarget.verification?.proof_video_file && (
                <div><span>Proof Video File</span><strong><button type="button" className="text-button" onClick={() => onDownloadFile(kycDetailTarget.verification!.proof_video_file!, 'proof-video')}>Download</button></strong></div>
              )}
              {kycDetailTarget.verification?.admin_message && (
                <div className="kyc-detail-full"><span>Last Admin Message</span><strong>{kycDetailTarget.verification.admin_message}</strong></div>
              )}
            </div>
            <div className="kyc-detail-actions">
              <button type="button" className="button-primary" onClick={() => { setShowKycDetailModal(false); onReviewVerification(kycDetailTarget, 'approved') }}>✅ Approve KYC</button>
              <button type="button" className="button-secondary button-secondary--danger" onClick={() => { setShowKycDetailModal(false); onReviewVerification(kycDetailTarget, 'rejected') }}>❌ Reject KYC</button>
              <button type="button" className="button-secondary" onClick={() => setShowKycDetailModal(false)}>Close</button>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN REJECTION MESSAGE MODAL ── */}
      {showRejectionModal && kycRejectionTarget && (
        <div className="kyc-modal-overlay" onClick={() => setShowRejectionModal(false)}>
          <div className="kyc-modal kyc-modal--reject" onClick={(e) => e.stopPropagation()}>
            <div className="kyc-modal__header">
              <div className="kyc-modal__icon" style={{background: 'var(--danger-soft, #fee2e2)'}}><XCircle size={24} color="var(--danger, #dc2626)" /></div>
              <h2>Reject KYC — {kycRejectionTarget.first_name} {kycRejectionTarget.last_name}</h2>
              <p>Write a message to the entrepreneur explaining why their KYC was rejected.</p>
            </div>
            <div className="field-group">
              <label>Rejection Message (will be shown to entrepreneur)</label>
              <textarea
                rows={4}
                value={rejectionMessage}
                onChange={(e) => setRejectionMessage(e.target.value)}
                placeholder="e.g. Please upload clearer photos of your CNIC. The images were blurry and unreadable."
                style={{width: '100%', marginTop: '0.5rem'}}
              />
            </div>
            <div className="kyc-detail-actions" style={{marginTop: '1rem'}}>
              <button type="button" className="button-secondary button-secondary--danger" onClick={onConfirmRejection} disabled={!rejectionMessage.trim()}>
                Confirm Rejection &amp; Send Message
              </button>
              <button type="button" className="button-secondary" onClick={() => { setShowRejectionModal(false); setKycRejectionTarget(null) }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* KYC MANDATORY ONBOARDING MODAL — shown after signup, cannot be dismissed */}
      {showKycModal && user && (
        <div className="kyc-modal-overlay">
          <div className="kyc-modal">
            <div className="kyc-modal__header">
              <div className="kyc-modal__icon"><ShieldCheck size={28} /></div>
              <h2>Complete KYC Verification</h2>
              <p>This is required before accessing the platform. Your information will be reviewed by our admin team.</p>
            </div>

            <form onSubmit={onSubmitKycModal} className="kyc-modal__form">

              {/* ── Required identity fields ── */}
              <div className="field-row field-row--two">
                <div className="field-group">
                  <label>Phone Number *</label>
                  <input
                    type="tel"
                    placeholder="Phone number"
                    value={verificationForm.phone_number}
                    onChange={(e) => setVerificationForm({ ...verificationForm, phone_number: e.target.value })}
                    required
                    pattern="\d{11}"
                    maxLength={11}
                    title="Phone number must be exactly 11 digits"
                  />
                </div>
                <div className="field-group">
                  <label>Identity Type *</label>
                  <select
                    value={verificationForm.identity_type}
                    onChange={(e) => setVerificationForm({ ...verificationForm, identity_type: e.target.value as 'cnic' | 'passport' })}
                  >
                    <option value="cnic">CNIC / National ID</option>
                    <option value="passport">Passport</option>
                  </select>
                </div>
              </div>

              <div className="field-row field-row--two">
                <div className="field-group">
                  <label>Identity Number *</label>
                  <input
                    placeholder="00000-0000000-0"
                    value={verificationForm.identity_number}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, '').slice(0, 13)
                      let f = d
                      if (d.length > 12) f = d.slice(0, 5) + '-' + d.slice(5, 12) + '-' + d.slice(12)
                      else if (d.length > 5) f = d.slice(0, 5) + '-' + d.slice(5)
                      setVerificationForm({ ...verificationForm, identity_number: f })
                    }}
                    required
                    pattern="\d{5}-\d{7}-\d"
                    maxLength={15}
                    title="CNIC format: 00000-0000000-0"
                  />
                </div>
                <div className="field-group">
                  <label>ID Front <span className="optional">(optional)</span></label>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.pdf"
                    onChange={(e) => setVerificationFiles({ ...verificationFiles, identity_front: e.target.files?.[0] ?? null })}
                  />
                </div>
              </div>

              <div className="field-group">
                <label>Full Address *</label>
                <textarea
                  placeholder="House, Street, City"
                  value={verificationForm.address}
                  onChange={(e) => setVerificationForm({ ...verificationForm, address: e.target.value })}
                  required
                  rows={2}
                />
              </div>

              {/* ── Social Media Links ── */}
              <div className="kyc-modal__section">
                <div className="kyc-modal__section-title">
                  <Globe2 size={13} />
                  <span>Social Media Links <span className="optional">(all optional)</span></span>
                </div>
                <div className="field-row field-row--two">
                  <div className="field-group">
                    <label>LinkedIn</label>
                    <input
                      placeholder="https://linkedin.com/in/..."
                      value={verificationForm.linkedin_url}
                      onChange={(e) => setVerificationForm({ ...verificationForm, linkedin_url: e.target.value })}
                    />
                  </div>
                  <div className="field-group">
                    <label>Instagram</label>
                    <input
                      placeholder="https://instagram.com/..."
                      value={verificationForm.instagram_url}
                      onChange={(e) => setVerificationForm({ ...verificationForm, instagram_url: e.target.value })}
                    />
                  </div>
                </div>
                <div className="field-group">
                  <label>Facebook</label>
                  <input
                    placeholder="https://facebook.com/..."
                    value={verificationForm.facebook_url}
                    onChange={(e) => setVerificationForm({ ...verificationForm, facebook_url: e.target.value })}
                  />
                </div>
              </div>

              {/* ── Business Proof Video ── */}
              <div className="kyc-modal__section">
                <div className="kyc-modal__section-title">
                  <Video size={13} />
                  <span>Business Proof Video <span className="optional">(optional)</span></span>
                </div>
                <div className="field-group">
                  <label>Video Link</label>
                  <input
                    placeholder=""
                    value={verificationForm.proof_video_url}
                    onChange={(e) => setVerificationForm({ ...verificationForm, proof_video_url: e.target.value })}
                  />
                </div>
                <div className="field-group">
                  <label>Upload Video File <span className="optional">(MP4 / MOV / WebM · max 50 MB)</span></label>
                  <input
                    type="file"
                    accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm"
                    onChange={(e) => setVerificationFiles({ ...verificationFiles, proof_video_file: e.target.files?.[0] ?? null })}
                  />
                  <span className="kyc-modal__file-hint">Show your business / product in action. Admin reviewers will watch this.</span>
                </div>
              </div>

              <div className="kyc-modal__note">
                <ShieldCheck size={14} />
                <span>Your KYC will be reviewed by admin within 24–48 hours. You can continue using the platform in the meantime.</span>
              </div>

              <button type="submit" className="button-primary button-primary--full" disabled={kycSubmitting}>
                {kycSubmitting ? 'Submitting KYC...' : 'Submit KYC & Enter Platform'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

export default App