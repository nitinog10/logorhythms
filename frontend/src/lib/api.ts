/**
 * DocuVerse API Client
 * 
 * Handles all communication with the FastAPI backend
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'

/** Safely extract a human-readable message from FastAPI error detail (string or object). */
function extractDetailMessage(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const d = detail as Record<string, any>
    if (d.code === 'LIMIT_EXCEEDED') {
      return `You've reached the ${d.tier || 'free'} plan limit of ${d.limit} ${d.feature || 'items'}. Please upgrade to add more.`
    }
    return d.message || d.error || JSON.stringify(detail)
  }
  return fallback
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: any
  headers?: Record<string, string>
}

class APIError extends Error {
  status: number
  data: any

  constructor(message: string, status: number, data?: any) {
    super(message)
    this.name = 'APIError'
    this.status = status
    this.data = data
  }
}

// Helper to get token from localStorage
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem('token')
}

async function request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  // Always get fresh token from localStorage
  const token = getAuthToken()

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'include', // Include cookies for session management
  })

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}))

    // Handle unauthorized errors - only clear token for auth-specific endpoints
    // to prevent transient errors from logging the user out
    if (response.status === 401) {
      const isAuthEndpoint = endpoint === '/auth/me' || endpoint === '/auth/verify'
      if (isAuthEndpoint && typeof window !== 'undefined') {
        localStorage.removeItem('token')
      }
    }

    throw new APIError(
      extractDetailMessage(errorData.detail, 'An error occurred'),
      response.status,
      errorData
    )
  }

  // Handle empty responses
  const text = await response.text()
  if (!text) return {} as T

  return JSON.parse(text)
}

// ============================================================
// Authentication
// ============================================================

export const auth = {
  getGitHubAuthUrl: () => request<{ auth_url: string; state: string }>('/auth/github'),

  getMe: () => request<{
    id: string
    username: string
    email: string | null
    avatar_url: string | null
  }>('/auth/me'),

  logout: () => request('/auth/logout', { method: 'POST' }),

  refresh: () => request<{
    token: string
    user: {
      id: string
      username: string
      email: string | null
      avatar_url: string | null
    }
  }>('/auth/refresh', { method: 'POST' }),

  verify: () => request<{
    valid: boolean
    user: {
      id: string
      username: string
      email: string | null
      avatar_url: string | null
    }
  }>('/auth/verify'),
}

// ============================================================
// Repositories
// ============================================================

export interface Repository {
  id: string
  name: string
  full_name: string
  description: string | null
  language: string | null
  is_indexed: boolean
  indexed_at: string | null
  created_at: string | null
  source?: 'github' | 'upload'
}

export interface GitHubRepository {
  id: number
  name: string
  full_name: string
  description: string | null
  language: string | null
  stars: number
  updated_at: string
  private: boolean
}

export const repositories = {
  listGitHub: () => request<GitHubRepository[]>('/repositories/github'),

  connect: (fullName: string) =>
    request<Repository>('/repositories/connect', {
      method: 'POST',
      body: { full_name: fullName },
    }),

  list: () => request<Repository[]>('/repositories/'),

  get: (id: string) => request<Repository>(`/repositories/${id}`),

  getStatus: (id: string) => request<{
    id: string
    status: 'cloning' | 'indexing' | 'ready'
    is_indexed: boolean
    indexed_at: string | null
    has_local_files: boolean
  }>(`/repositories/${id}/status`),

  index: (id: string) => request(`/repositories/${id}/index`, { method: 'POST' }),

  delete: (id: string) => request(`/repositories/${id}`, { method: 'DELETE' }),
}

// ============================================================
// Manual Upload
// ============================================================

export const upload = {
  uploadZip: async (
    file: File,
    projectName: string = '',
    description: string = ''
  ): Promise<Repository> => {
    const token = getAuthToken()
    const formData = new FormData()
    formData.append('file', file)
    formData.append('project_name', projectName)
    formData.append('description', description)

    const response = await fetch(`${API_BASE_URL}/project/upload-zip`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new APIError(
        extractDetailMessage(errorData.detail, 'Upload failed'),
        response.status,
        errorData
      )
    }

    return response.json()
  },
}

// ============================================================
// Files
// ============================================================

export interface FileNode {
  id: string
  path: string
  name: string
  is_directory: boolean
  language: string | null
  size: number | null
  children: FileNode[]
}

export interface ASTNode {
  id: string
  type: string
  name: string
  start_line: number
  end_line: number
  docstring: string | null
  parameters: string[] | null
}

export const files = {
  getTree: (repoId: string) => request<FileNode[]>(`/files/${repoId}/tree`),

  getContent: async (repoId: string, path: string): Promise<string> => {
    const token = getAuthToken()

    const response = await fetch(
      `${API_BASE_URL}/files/${repoId}/content?path=${encodeURIComponent(path)}`,
      {
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
      }
    )

    if (!response.ok) {
      if (response.status === 401 && typeof window !== 'undefined') {
        localStorage.removeItem('token')
      }
      throw new APIError('Failed to fetch file content', response.status)
    }

    return response.text()
  },

  getAST: (repoId: string, path: string) =>
    request<ASTNode[]>(`/files/${repoId}/ast?path=${encodeURIComponent(path)}`),

  getImpact: (repoId: string, path: string, symbol?: string) => {
    const symbolParam = symbol ? `&symbol=${encodeURIComponent(symbol)}` : ''
    return request<ImpactAnalysis>(
      `/files/${repoId}/impact?path=${encodeURIComponent(path)}${symbolParam}`
    )
  },

  getCodebaseImpact: (repoId: string) =>
    request<CodebaseImpact>(`/files/${repoId}/impact/codebase`),
}

// ============================================================
// Impact Analysis
// ============================================================

export interface FileImpactSummary {
  file: string
  direct_dependents: number
  total_affected: number
  risk_score: number
  risk_level: 'low' | 'medium' | 'high' | string
}

export interface CodebaseImpact {
  total_files: number
  total_dependencies: number
  is_dag: boolean
  connected_components: number
  circular_dependencies: string[][]
  hotspots: FileImpactSummary[]
  most_imported: { file: string; import_count: number }[]
  overall_risk_score: number
  overall_risk_level: 'low' | 'medium' | 'high' | string
  recommended_actions: string[]
  brief_script: string
  impact_mermaid: string
}

export interface ImpactAnalysis {
  target_file: string
  symbol: string | null
  symbol_context: {
    found: boolean
    name: string
    type: string
    start_line: number
    end_line: number
    parameters: string[]
  } | null
  direct_dependents: string[]
  affected_files: string[]
  total_affected: number
  dependency_chain: Record<string, string[]>
  circular_dependencies: string[][]
  risk_score: number
  risk_level: 'low' | 'medium' | 'high' | string
  recommended_refactor_steps: string[]
  brief_script: string
  impact_mermaid: string
}

// ============================================================
// Walkthroughs
// ============================================================

export interface ScriptSegment {
  id: string
  order: number
  text: string
  start_line: number
  end_line: number
  highlight_lines: number[]
  duration_estimate: number
}

export interface WalkthroughScript {
  id: string
  file_path: string
  title: string
  summary: string
  view_mode: 'developer' | 'manager'
  segments: ScriptSegment[]
  total_duration: number
  created_at?: string
}

export interface AudioWalkthrough {
  id: string
  file_path: string
  audio_segments: {
    id: string
    script_segment_id: string
    audio_url: string
    duration: number
    start_time: number
    end_time: number
  }[]
  full_audio_url: string | null
  total_duration: number
}

export const walkthroughs = {
  generate: (repositoryId: string, filePath: string, viewMode: 'developer' | 'manager' = 'developer') =>
    request<WalkthroughScript>('/walkthroughs/generate', {
      method: 'POST',
      body: {
        repository_id: repositoryId,
        file_path: filePath,
        view_mode: viewMode,
      },
    }),

  get: (id: string) => request<WalkthroughScript>(`/walkthroughs/${id}`),

  getAudio: (id: string) => request<AudioWalkthrough>(`/walkthroughs/${id}/audio`),

  getForFile: (repoId: string, filePath: string) =>
    request<WalkthroughScript[]>(`/walkthroughs/file/${repoId}?file_path=${encodeURIComponent(filePath)}`),

  getForRepo: (repoId: string) =>
    request<WalkthroughScript[]>(`/walkthroughs/repo/${repoId}`),

  delete: (id: string) => request(`/walkthroughs/${id}`, { method: 'DELETE' }),
}

// ============================================================
// Diagrams
// ============================================================

export interface Diagram {
  id: string
  type: 'flowchart' | 'classDiagram' | 'sequenceDiagram' | 'erDiagram'
  title: string
  mermaid_code: string
  source_file: string | null
}

export const diagrams = {
  generate: (repositoryId: string, diagramType: string, filePath?: string) =>
    request<Diagram>('/diagrams/generate', {
      method: 'POST',
      body: {
        repository_id: repositoryId,
        diagram_type: diagramType,
        file_path: filePath,
      },
    }),

  get: (id: string) => request<Diagram>(`/diagrams/${id}`),

  getForRepository: (repoId: string) =>
    request<Diagram[]>(`/diagrams/repository/${repoId}`),
}

// ============================================================
// Sandbox
// ============================================================

export interface SandboxResult {
  success: boolean
  output: string
  error: string | null
  execution_time: number
}

export const sandbox = {
  execute: (code: string, language: string, variables: Record<string, any> = {}) =>
    request<SandboxResult>('/sandbox/execute', {
      method: 'POST',
      body: { code, language, variables },
    }),

  getLanguages: () =>
    request<{ languages: string[]; details: Record<string, { extension: string; timeout: number }> }>(
      '/sandbox/languages'
    ),

  validate: (code: string, language: string) =>
    request<{ success: boolean; message: string }>('/sandbox/validate', {
      method: 'POST',
      body: { code, language, variables: {} },
    }),
}

// ============================================================
// Documentation
// ============================================================

export interface DocSection {
  title: string
  content: string
}

export interface FileDocumentation {
  path: string
  language: string
  summary: string
  sections: DocSection[]
}

export interface RepositoryDocumentation {
  overview: string
  architecture: string
  folder_tree: string
  files: FileDocumentation[]
  dependencies: string
}

// ============================================================
// Provenance (Why Graph)
// ============================================================

export type EvidenceSourceType =
  | 'commit'
  | 'pull_request'
  | 'issue'
  | 'adr'
  | 'doc'
  | 'comment'
  | 'other'

export type AssumptionStatus = 'active' | 'likely_stale' | 'superseded' | 'unknown'

export interface EvidenceLink {
  id: string
  source_type: EvidenceSourceType
  source_url: string
  title: string
  excerpt: string
  confidence: number
  created_at?: string | null
}

export interface AssumptionEntry {
  id: string
  statement: string
  status: AssumptionStatus
  confidence: number
  evidence_ids: string[]
  last_validated_at?: string | null
}

export interface StaleAssumptionAlert {
  id: string
  assumption_id: string
  statement: string
  file_path: string
  symbol?: string | null
  reason: string
  severity: string
  evidence_ids: string[]
}

export interface DecisionThread {
  id: string
  summary: string
  evidence_ids: string[]
  confidence: number
}

export interface ProvenanceCard {
  id: string
  repo_id: string
  file_path: string
  symbol?: string | null
  symbol_type?: string | null
  current_purpose: string
  origin_summary: string
  decision_summary: string
  assumptions: AssumptionEntry[]
  stale_assumptions: StaleAssumptionAlert[]
  safe_change_notes: string[]
  evidence_links: EvidenceLink[]
  confidence_score: number
  decision_threads: DecisionThread[]
  created_at?: string
  updated_at?: string
  metadata?: Record<string, unknown>
}

export interface ProvenanceQueryResponse {
  success: boolean
  message?: string | null
  card?: ProvenanceCard | null
  from_cache?: boolean
}

export const provenance = {
  query: (
    repositoryId: string,
    filePath: string,
    options: {
      symbol?: string
      symbolType?: string
      forceRefresh?: boolean
    } = {}
  ) =>
    request<ProvenanceQueryResponse>('/provenance/query', {
      method: 'POST',
      body: {
        repository_id: repositoryId,
        file_path: filePath,
        symbol: options.symbol,
        symbol_type: options.symbolType,
        force_refresh: options.forceRefresh ?? false,
      },
    }),

  getSymbol: (
    repoId: string,
    filePath: string,
    options: { symbol?: string; symbolType?: string; refresh?: boolean } = {}
  ) => {
    const q = new URLSearchParams({ file_path: filePath })
    if (options.symbol) q.set('symbol', options.symbol)
    if (options.symbolType) q.set('symbol_type', options.symbolType)
    if (options.refresh) q.set('refresh', 'true')
    return request<ProvenanceQueryResponse>(`/provenance/${repoId}/symbol?${q.toString()}`)
  },

  listStaleAssumptions: (repoId: string) =>
    request<StaleAssumptionAlert[]>(`/provenance/${repoId}/stale-assumptions`),

  refresh: (
    repoId: string,
    filePath: string,
    options: { symbol?: string; symbolType?: string } = {}
  ) =>
    request<ProvenanceQueryResponse>(`/provenance/${repoId}/refresh`, {
      method: 'POST',
      body: {
        file_path: filePath,
        symbol: options.symbol,
        symbol_type: options.symbolType,
      },
    }),

  feedback: (
    repoId: string,
    filePath: string,
    rating: 'correct' | 'partially_correct' | 'wrong',
    symbol?: string
  ) =>
    request<{ success: boolean; message?: string }>(`/provenance/${repoId}/feedback`, {
      method: 'POST',
      body: { file_path: filePath, symbol: symbol || null, rating },
    }),
}

export const documentation = {
  generate: (repoId: string) =>
    request<{ status: string; message: string }>(`/documentation/${repoId}/generate`, {
      method: 'POST',
    }),

  get: (repoId: string) =>
    request<{ status: string; data?: RepositoryDocumentation | null }>(
      `/documentation/${repoId}`
    ),

  getFile: (repoId: string, filePath: string) =>
    request<{ status: string; data: FileDocumentation }>(
      `/documentation/${repoId}/file?path=${encodeURIComponent(filePath)}`
    ),

  generateReadme: (repoId: string, projectDescription: string = '') =>
    request<{ status: string; readme: string }>(`/documentation/${repoId}/readme`, {
      method: 'POST',
      body: { project_description: projectDescription },
    }),
}

// ============================================================
// GitHub Integration
// ============================================================

export interface CreateRepoResponse {
  url: string
  full_name: string
  github_id: number
  default_branch: string
}

export interface CreateRepoWithUploadResponse {
  url: string
  full_name: string
  github_id: number
  default_branch: string
  files_pushed: number
  commit_sha: string
  repository_id: string
}

export interface PushReadmeResponse {
  success: boolean
  commit_sha: string
  url: string
}

export interface CreateIssueResponse {
  issue_number: number
  url: string
  title: string
}

export interface ImplementFixResponse {
  branch: string
  pr_number: number
  pr_url: string
  files_changed: number
  merged: boolean
  readme_updated: boolean
}

export interface AutomationStatus {
  fix_pr_url?: string
  fix_pr_number?: number
  fix_branch?: string
  fix_files_changed?: number
  fix_merged?: boolean
  fix_readme_updated?: boolean
  fix_suggestions?: string[]
  fix_created_at?: number
  issue_url?: string
  issue_number?: number
  issue_title?: string
  issue_created_at?: number
  docs_url?: string
  docs_commit_sha?: string
  docs_pushed_at?: number
}

export const github = {
  getAutomationStatus: (owner: string, repo: string) =>
    request<AutomationStatus>(`/github/status/${owner}/${repo}`),

  createRepo: (name: string, description: string, isPrivate: boolean) =>
    request<CreateRepoResponse>('/github/create-repo', {
      method: 'POST',
      body: { name, description, private: isPrivate },
    }),

  createRepoWithUpload: async (
    name: string,
    description: string,
    isPrivate: boolean,
    file: File,
  ): Promise<CreateRepoWithUploadResponse> => {
    const token = getAuthToken()
    const formData = new FormData()
    formData.append('name', name)
    formData.append('description', description)
    formData.append('private', String(isPrivate))
    formData.append('file', file)

    const response = await fetch(`${API_BASE_URL}/github/create-repo-with-upload`, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: formData,
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      throw new APIError(
        extractDetailMessage(errorData.detail, 'Failed to create repository with upload'),
        response.status,
        errorData,
      )
    }

    return response.json()
  },

  pushReadme: (
    owner: string,
    repo: string,
    content: string,
    branch: string = 'main',
    message: string = 'docs: auto-generated by DocuVerse'
  ) =>
    request<PushReadmeResponse>('/github/push-readme', {
      method: 'POST',
      body: { owner, repo, content, branch, message },
    }),

  createIssue: (
    owner: string,
    repo: string,
    title: string,
    body: string,
    labels: string[] = []
  ) =>
    request<CreateIssueResponse>('/github/create-issue', {
      method: 'POST',
      body: { owner, repo, title, body, labels },
    }),

  implementFix: (
    owner: string,
    repo: string,
    suggestions: string[],
    impactSummary: string = '',
    baseBranch: string = 'main'
  ) =>
    request<ImplementFixResponse>('/github/implement-fix', {
      method: 'POST',
      body: {
        owner,
        repo,
        suggestions,
        impact_summary: impactSummary,
        base_branch: baseBranch,
      },
    }),
}

// ============================================================
// Signal (Customer Voice-to-Code)
// ============================================================

export type SignalSource = 'linear' | 'zendesk' | 'intercom' | 'manual'
export type SignalStatus = 'pending' | 'processing' | 'completed' | 'failed'
export type SignalIssueType = 'bug' | 'feature_request' | 'question' | 'performance' | 'ux' | 'security' | 'other'
export type SignalUrgency = 'critical' | 'high' | 'medium' | 'low'

export interface SignalCodeMatch {
  file_path: string
  symbol: string | null
  confidence: number
  snippet: string | null
  start_line: number | null
  end_line: number | null
}

export interface CustomerSignal {
  id: string
  repo_id: string
  source: SignalSource
  external_ticket_id: string | null
  title: string
  body: string
  customer_segment: string | null
  priority: string | null
  status: SignalStatus
  tags: string[]
  created_at: string
}

export interface SignalPacket {
  id: string
  repo_id: string
  signal_id: string
  cluster_id: string | null
  issue_type: SignalIssueType
  business_urgency: SignalUrgency
  duplicate_count: number
  likely_files: string[]
  likely_symbols: string[]
  code_matches: SignalCodeMatch[]
  owner_suggestions: string[]
  fix_summary: string
  root_cause_hypothesis: string
  docs_update_suggestions: string[]
  customer_response_draft: string
  confidence_score: number
  github_issue_url: string | null
  github_issue_number: number | null
  created_at: string
  updated_at: string
  metadata: Record<string, unknown>
}

export interface SignalCluster {
  id: string
  repo_id: string
  representative_title: string
  signal_ids: string[]
  size: number
  combined_urgency: SignalUrgency
  created_at: string
  updated_at: string
}

export interface SignalConfig {
  repo_id: string
  source: SignalSource
  enabled: boolean
  auto_create_issues: boolean
  priority_threshold: number
}

export interface SignalPacketResponse {
  success: boolean
  message?: string | null
  packet?: SignalPacket | null
  packets?: SignalPacket[] | null
  total: number
}

export const signal = {
  importSignal: (
    repoId: string,
    title: string,
    body: string,
    options: {
      source?: SignalSource
      externalTicketId?: string
      customerSegment?: string
      priority?: string
      tags?: string[]
    } = {}
  ) =>
    request<SignalPacketResponse>('/signal/import', {
      method: 'POST',
      body: {
        repo_id: repoId,
        title,
        body,
        source: options.source || 'manual',
        external_ticket_id: options.externalTicketId,
        customer_segment: options.customerSegment,
        priority: options.priority,
        tags: options.tags || [],
      },
    }),

  getConfig: (repoId: string) =>
    request<SignalConfig>(`/signal/${repoId}/config`),

  updateConfig: (repoId: string, config: Partial<SignalConfig>) =>
    request<{ success: boolean; message: string }>(`/signal/${repoId}/config`, {
      method: 'PUT',
      body: config,
    }),

  listPackets: (repoId: string) =>
    request<SignalPacketResponse>(`/signal/${repoId}/packets`),

  getPacket: (repoId: string, packetId: string) =>
    request<SignalPacket>(`/signal/${repoId}/packets/${packetId}`),

  listClusters: (repoId: string) =>
    request<SignalCluster[]>(`/signal/${repoId}/clusters`),

  listSignals: (repoId: string) =>
    request<CustomerSignal[]>(`/signal/${repoId}/signals`),

  createIssueFromPacket: (
    repoId: string,
    packetId: string,
    owner: string,
    repo: string,
    additionalLabels: string[] = []
  ) =>
    request<CreateIssueResponse>(`/signal/${repoId}/packets/${packetId}/create-issue`, {
      method: 'POST',
      body: { owner, repo, additional_labels: additionalLabels },
    }),
}

// ============================================================
// Inline Code Explanation
// ============================================================

export interface InlineExplainResponse {
  what: string
  why: string
  how: string
  summary: string
}

export interface FollowupResponse {
  answer: string
}

export interface ConversationMessage {
  role: 'user' | 'assistant'
  content: string
}

export const explain = {
  inline: (
    repositoryId: string,
    filePath: string,
    selectedCode: string,
    startLine: number,
    endLine: number,
    fullFileContent: string = ''
  ) =>
    request<InlineExplainResponse>('/explain/inline', {
      method: 'POST',
      body: {
        repository_id: repositoryId,
        file_path: filePath,
        selected_code: selectedCode,
        start_line: startLine,
        end_line: endLine,
        full_file_content: fullFileContent,
      },
    }),

  followup: (
    repositoryId: string,
    filePath: string,
    selectedCode: string,
    question: string,
    conversationHistory: ConversationMessage[] = [],
    fullFileContent: string = ''
  ) =>
    request<FollowupResponse>('/explain/followup', {
      method: 'POST',
      body: {
        repository_id: repositoryId,
        file_path: filePath,
        selected_code: selectedCode,
        question,
        conversation_history: conversationHistory,
        full_file_content: fullFileContent,
      },
    }),
}

// ============================================================
// Billing & Subscription
// ============================================================

export interface GeoPricing {
  country: string
  country_name: string
  currency: string
  symbol: string
  plans: {
    currency: string
    symbol: string
    free: { amount: number; display: string; features: string[] }
    pro: { amount: number; display: string; features: string[]; symbol: string }
    team: { amount: number; display: string; features: string[]; symbol: string }
  }
}

export interface SubscribeResponse {
  order_id: string
  razorpay_key_id: string
  amount: number
  amount_in_paise: number
  currency: string
  display: string
  name: string
  description: string
  tier: string
}

export interface VerifyPaymentData {
  razorpay_payment_id: string
  razorpay_order_id: string
  razorpay_signature: string
  plan: string
}

export interface SubscriptionInfo {
  tier: 'free' | 'pro' | 'team'
  status: string
  currency: string
  current_period_end: string | null
  usage: Record<string, number>
  limits: Record<string, number>
  razorpay_subscription_id: string | null
}

export const billing = {
  getGeo: () => request<GeoPricing>('/billing/geo'),

  getPlans: (currency: string = 'INR') =>
    request<any>(`/billing/plans?currency=${currency}`),

  subscribe: (plan: string) =>
    request<SubscribeResponse>('/billing/subscribe', {
      method: 'POST',
      body: { plan },
    }),

  verify: (data: VerifyPaymentData) =>
    request<{ success: boolean; tier: string; message: string }>('/billing/verify', {
      method: 'POST',
      body: data,
    }),

  getSubscription: () => request<SubscriptionInfo>('/billing/subscription'),

  cancel: () =>
    request<{ success: boolean; message: string }>('/billing/cancel', {
      method: 'POST',
    }),
}

// Export all APIs
export const api = {
  auth,
  repositories,
  files,
  walkthroughs,
  diagrams,
  sandbox,
  documentation,
  upload,
  provenance,
  signal,
  explain,
  billing,
}

export default api

