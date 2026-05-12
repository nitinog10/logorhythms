/**
 * DocuVerse API Client
 * 
 * Handles all communication with the FastAPI backend
 */

/** Public FastAPI prefix (no trailing slash), e.g. `https://api.example.com/api`. Set via `NEXT_PUBLIC_API_URL` on Netlify/Vercel. */
export const publicApiBaseUrl = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api'
).replace(/\/+$/, '')

const API_BASE_URL = publicApiBaseUrl

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
  _retryAfterRefresh?: boolean
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
  const { method = 'GET', body, headers = {}, _retryAfterRefresh = false } = options

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
    const isAuthEndpoint = endpoint.startsWith('/auth/')

    // Attempt one refresh-token based recovery for protected endpoints.
    if (response.status === 401) {
      if (!isAuthEndpoint && !_retryAfterRefresh) {
        try {
          const refreshed = await request<{ token: string }>('/auth/refresh', {
            method: 'POST',
            _retryAfterRefresh: true,
          })
          if (refreshed?.token && typeof window !== 'undefined') {
            localStorage.setItem('token', refreshed.token)
            return request<T>(endpoint, { ...options, _retryAfterRefresh: true })
          }
        } catch {
          // Fall through to normal 401 handling.
        }
      }
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



// ============================================================
// App Studio (Builder)
// ============================================================

export interface AppTemplate {
  id: string
  name: string
  description: string
  category: string
  icon: string
  preview_color: string
  features: string[]
  screen_count: number
}

export interface BuilderScreen {
  id: string
  name: string
  screen_type: string
  prompt: string
  order: number
  status: string
  stitch_screen_id: string | null
  preview_url: string | null
  html_url?: string | null
  generated_title?: string
  components: any[]
  last_edit?: string
  edited_at?: string
  is_variant_of?: string
  suggestions?: string[]
  error?: string
}

export interface BuilderProject {
  id: string
  user_id: string
  title: string
  template_id: string | null
  stitch_project_id: string | null
  status: string
  screens: BuilderScreen[]
  design_system: {
    primaryColor?: string
    fontFamily?: string
    cornerRoundness?: string
    appearance?: string
    styleNotes?: string
  }
  design_system_id: string | null
  customizations: Record<string, any>
  requirements: Record<string, any>
  assembled_app?: string
  preview_url?: string
  fullstack_files?: Record<string, string>
  fullstack_spec?: Record<string, any>
  magic_build_status?: string
  magic_build_summary?: {
    file_count: number
    models: string[]
    routes: string[]
    pages: string[]
  }
  last_saved_at?: string
  created_at: string
  updated_at: string
}

export interface ProjectListResponse {
  projects: {
    id: string
    title: string
    template_id: string | null
    status: string
    screen_count: number
    category: string | null
    created_at: string
    updated_at: string
  }[]
  limit: number
  used: number
  tier: string
}

export const builder = {
  getTemplates: () => request<AppTemplate[]>('/builder/templates'),

  getTemplate: (id: string) => request<any>(`/builder/templates/${id}`),

  createFromTemplate: (data: {
    template_id: string
    brand_name?: string
    color_scheme?: string
    style?: string
    additional_notes?: string
  }) =>
    request<BuilderProject>('/builder/projects', {
      method: 'POST',
      body: data,
    }),

  createFromRequirements: (rawInput: string) =>
    request<BuilderProject>('/builder/projects/from-requirements', {
      method: 'POST',
      body: { raw_input: rawInput },
    }),

  listProjects: () => request<ProjectListResponse>('/builder/projects'),

  getProject: (id: string) => request<BuilderProject>(`/builder/projects/${id}`),

  deleteProject: (id: string) =>
    request(`/builder/projects/${id}`, { method: 'DELETE' }),

  generateScreens: (projectId: string) =>
    request<BuilderProject>(`/builder/projects/${projectId}/generate`, {
      method: 'POST',
    }),

  editScreen: (projectId: string, screenId: string, prompt: string) =>
    request<BuilderProject>(
      `/builder/projects/${projectId}/screens/${screenId}/edit`,
      { method: 'POST', body: { prompt } }
    ),

  getScreenCode: (projectId: string, screenId: string) =>
    request<{ screen_id: string; name: string; code: string; status: string }>(
      `/builder/projects/${projectId}/screens/${screenId}/code`
    ),

  addScreen: (
    projectId: string,
    data: { name: string; prompt?: string; screen_type?: string }
  ) =>
    request<BuilderScreen>(`/builder/projects/${projectId}/screens`, {
      method: 'POST',
      body: data,
    }),

  updateDesignSystem: (
    projectId: string,
    design: {
      primary_color?: string
      font_family?: string
      corner_roundness?: string
      appearance?: string
      style_notes?: string
    }
  ) =>
    request(`/builder/projects/${projectId}/design-system`, {
      method: 'POST',
      body: design,
    }),

  generateVariants: (
    projectId: string,
    screenId: string,
    prompt: string,
    count?: number
  ) =>
    request(`/builder/projects/${projectId}/variants`, {
      method: 'POST',
      body: { screen_id: screenId, prompt, count: count || 3 },
    }),

  refineRequirements: (rawInput: string) =>
    request<{ refined_spec: any; suggestions: string[] }>('/builder/refine', {
      method: 'POST',
      body: { raw_input: rawInput },
    }),

  pushToGithub: (
    projectId: string,
    data: { repo_name: string; description?: string; private?: boolean }
  ) =>
    request(`/builder/projects/${projectId}/push-to-github`, {
      method: 'POST',
      body: data,
    }),

  magicBuild: (projectId: string) =>
    request<BuilderProject>(`/builder/projects/${projectId}/magic-build`, {
      method: 'POST',
    }),

  /**
   * Streaming version of Magic Build via SSE.
   *
   * Uses the `/magic-build-stream` endpoint which immediately sends a 200 OK
   * response (flushing CORS headers to the browser) before Bedrock starts
   * generating. This avoids the AWS App Runner 60-second request timeout that
   * causes the browser to misreport a dropped connection as a "CORS error".
   *
   * @param projectId - The builder project to run magic build on
   * @param onProgress - Called with each progress event from the server
   * @returns The final BuilderProject when generation completes
   */
  magicBuildStream: async (
    projectId: string,
    onProgress?: (event: { status: string; message?: string; file_count?: number }) => void
  ): Promise<BuilderProject> => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    const url = `${publicApiBaseUrl}/builder/projects/${projectId}/magic-build-stream`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    })

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      throw new Error(err?.detail || `magic-build-stream failed (HTTP ${response.status})`)
    }

    if (!response.body) {
      throw new Error('No response body for SSE stream')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''  // keep the incomplete last line

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        const json = trimmed.slice('data:'.length).trim()
        if (!json) continue

        let event: Record<string, unknown>
        try {
          event = JSON.parse(json)
        } catch {
          continue
        }

        const status = event.status as string
        if (status === 'done') {
          return event.project as BuilderProject
        }
        if (status === 'error') {
          throw new Error((event.error as string) || 'Magic Build failed')
        }
        if (status === 'progress' || status === 'started') {
          onProgress?.({
            status,
            message: event.message as string | undefined,
            file_count: event.file_count as number | undefined,
          })
        }
      }
    }

    throw new Error('SSE stream ended without a done event')
  },


  saveProject: (projectId: string) =>
    request<{ success: boolean; saved_at: string; project_id: string }>(
      `/builder/projects/${projectId}/save`,
      { method: 'POST' }
    ),

  quickEdit: (projectId: string, screenId: string, prompt: string, editType?: string) =>
    request<{ success: boolean; edit_type: string; message: string; project: BuilderProject }>(
      `/builder/projects/${projectId}/screens/${screenId}/quick-edit`,
      { method: 'POST', body: { prompt, edit_type: editType || null } }
    ),

  launchPreview: (projectId: string) =>
    request<{ status: string; url?: string; port?: number; error?: string; message: string }>(
      `/builder/projects/${projectId}/fullstack-preview`,
      { method: 'POST' }
    ),

  getPreviewStatus: (projectId: string) =>
    request<{ status: string; url?: string; port?: number }>(
      `/builder/projects/${projectId}/fullstack-preview/status`
    ),

  stopPreview: (projectId: string) =>
    request<{ stopped: boolean; message: string }>(
      `/builder/projects/${projectId}/fullstack-preview/stop`,
      { method: 'POST' }
    ),

  detectEnv: (projectId: string) =>
    request<{ env_vars: Array<{ name: string; description: string; found_in: string[]; value: string; has_default: boolean }>; total: number }>(
      `/builder/projects/${projectId}/detect-env`
    ),

  saveEnv: (projectId: string, envVars: Record<string, string>) =>
    request<{ success: boolean; saved: number }>(
      `/builder/projects/${projectId}/save-env`,
      { method: 'POST', body: { env_vars: envVars } }
    ),
}

// ============================================================
// Studio (Unified Workspace) API
// ============================================================

export type StudioSessionKind = 'generated' | 'imported'

export interface StudioBootstrapPlan {
  framework: string
  framework_variant?: string | null
  framework_version?: string | null
  runtime: string
  package_manager: string
  monorepo_tool?: string | null
  app_root_rel: string
  install_cmd: string
  dev_cmd: string
  build_cmd: string
  test_cmd: string
  env_keys_required: string[]
  env_keys_optional: string[]
  env_keys_unused: string[]
  ports_hint?: number | null
  healthcheck_path: string
  detection_evidence: { rule: string; detail: string; weight: number }[]
  confidence: number
  candidate_apps: string[]
  notes: string[]
  clone_strategy?: Record<string, unknown>
}

export interface StudioRuntime {
  status: 'stopped' | 'starting' | 'running' | 'error' | string
  url?: string | null
  port?: number | null
  pid?: number | null
  started_at?: string | null
  runtime_id?: string | null
  runtime_backend?: 'host' | 'docker' | string
  container_id?: string | null
  phase?: 'detect' | 'install' | 'build' | 'start' | 'ready' | 'error' | 'stopped' | string | null
  runtime_provenance?: 'generated_spec' | 'custom_dockerfile' | string | null
  dockerfile_path?: string | null
  /** Backend: user clicked Stop; preview-status will not resurrect running until next Launch. */
  preview_user_halt?: boolean | null
}

export interface StudioEditClassification {
  tier: 'css' | 'quick' | 'structural'
  scope: 'single_node' | 'single_file' | 'multi_file' | 'cross_cutting'
  surfaces: string[]
  backend_impacting: boolean
  schema_changing: boolean
  fanout_estimate: number
  risk_class: 'low' | 'med' | 'high'
  requires_user_confirmation: boolean
  reasons: string[]
}

export interface StudioPendingChatAnchor {
  dvId?: string | null
  tag?: string | null
  classes?: string | null
  componentLabel?: string
  sourceFile?: string | null
  sourceLine?: number | null
}

export interface StudioSavedComponent {
  id: string
  label: string
  description: string
  dv_id: string | null
  html: string | null
  tag: string | null
  ts: string
  source_file?: string | null
  source_line?: number | null
  source_col?: number | null
}

export interface StudioSession {
  id: string
  user_id: string
  kind: StudioSessionKind
  source_id: string
  title: string
  workspace_path?: string | null
  branch_base: string
  branch_head: string
  commit_sha?: string | null
  bootstrap?: StudioBootstrapPlan | null
  runtime: StudioRuntime
  graphs_built: boolean
  route_index?: unknown
  policy?: unknown
  edit_history: Array<{
    id: string
    ts: string
    prompt: string
    classification: StudioEditClassification
    files_touched: string[]
    result: string
    error?: string | null
  }>
  checkpoints: Array<{
    id: string
    ts: string
    label: string
    diff_summary: Record<string, unknown>
    snapshot_ref?: string | null
  }>
  last_inspected_node?: { ts: string; event: Record<string, unknown> } | null
  initial_focus?: Record<string, unknown> | null
  metadata: Record<string, unknown>
  chat_messages?: Array<{
    id: string
    ts: string
    role: 'user' | 'assistant' | 'system'
    content: string
    action?: Record<string, unknown> | null
  }>
  status: 'draft' | 'bootstrapping' | 'ready' | 'error' | 'archived' | string
  created_at: string
  updated_at: string
  /** Session-scoped saved UI blocks (Components tab); optional on some API responses. */
  components?: StudioSavedComponent[]
}

export interface StudioSessionSummary {
  id: string
  title: string
  kind: StudioSessionKind
  source_id: string
  status: string
  branch_head: string
  framework?: string | null
  preview_url?: string | null
  edit_count: number
  created_at: string
  updated_at: string
}

export interface StudioRuntimeMetrics {
  launch_attempts: number
  launch_success: number
  launch_failures: number
  stop_calls: number
  status_calls: number
  cleanup_runs: number
  cleanup_removed: number
  route_prune_runs: number
  route_prune_removed: number
  cleanup_duration_ms_last: number
  active_runtime_rows: number
  active_container_rows: number
  events?: Array<{
    ts: number
    event: string
    runtime_key?: string
    session_id?: string
    phase?: string
    metadata?: Record<string, unknown>
  }>
}

export const studio = {
  createSession: (data: {
    kind: StudioSessionKind
    source_id: string
    base_branch?: string
    initial_focus?: Record<string, unknown>
  }) =>
    request<StudioSession>('/studio/sessions', {
      method: 'POST',
      body: data,
    }),

  /** Phase 0: single-call shortcut — build from a template and open Studio session. */
  createFromTemplate: (data: {
    template_id: string
    brand_name?: string
    color_scheme?: string
    style?: string
    additional_notes?: string
  }) =>
    request<{ session: StudioSession; project_id: string }>(
      '/studio/sessions/from-template',
      { method: 'POST', body: data }
    ),

  /** Phase 0: single-call shortcut — build from a natural-language prompt
   *  and open Studio session. */
  createFromPrompt: (data: { prompt: string; app_type?: string }) =>
    request<{ session: StudioSession; project_id: string }>(
      '/studio/sessions/from-prompt',
      { method: 'POST', body: { raw_input: data.prompt, app_type: data.app_type } }
    ),

  listSessions: () =>
    request<{ sessions: StudioSessionSummary[]; total: number }>(
      '/studio/sessions'
    ),

  getSession: (id: string) =>
    request<StudioSession>(`/studio/sessions/${id}`),

  deleteSession: (id: string) =>
    request<{ success: boolean; message: string }>(
      `/studio/sessions/${id}`,
      { method: 'DELETE' }
    ),

  bootstrap: (id: string) =>
    request<StudioSession>(`/studio/sessions/${id}/bootstrap`, {
      method: 'POST',
    }),

  classifyEdit: (
    id: string,
    data: { prompt: string; anchor_symbol?: string; anchor_file?: string }
  ) =>
    request<{
      session_id: string
      prompt: string
      classification: StudioEditClassification
    }>(`/studio/sessions/${id}/classify-edit`, {
      method: 'POST',
      body: data,
    }),

  recordClick: (id: string, payload: Record<string, unknown>) =>
    request<{
      session_id: string
      last_inspected_node: { ts: string; event: Record<string, unknown> } | null
    }>(`/studio/sessions/${id}/inspect/click`, {
      method: 'POST',
      body: payload,
    }),

  createCheckpoint: (
    id: string,
    data: {
      label: string
      snapshot_ref?: string
      diff_summary?: Record<string, unknown>
    }
  ) =>
    request<{ session_id: string; checkpoint: Record<string, unknown> | null }>(
      `/studio/sessions/${id}/checkpoint`,
      { method: 'POST', body: data }
    ),

  getEditHistory: (id: string) =>
    request<{
      session_id: string
      edits: StudioSession['edit_history']
      checkpoints: StudioSession['checkpoints']
    }>(`/studio/sessions/${id}/edit-history`),

  launch: (id: string) =>
    request<{
      status: string
      url?: string
      port?: number
      pid?: number
      error?: string
    }>(`/studio/sessions/${id}/launch`, { method: 'POST' }),

  previewStatus: (id: string) =>
    request<{
      status: string
      url?: string
      port?: number
      pid?: number
      uptime?: number
    }>(`/studio/sessions/${id}/preview-status`),

  stop: (id: string) =>
    request<{ stopped: boolean; message: string }>(
      `/studio/sessions/${id}/stop`,
      { method: 'POST' }
    ),

  runtimeMetrics: () =>
    request<StudioRuntimeMetrics>(`/studio/runtime-metrics`),

  // ── Phase 1: Persistent chat ──────────────────────────────────────────
  listChatMessages: (id: string, limit = 200) =>
    request<{ session_id: string; messages: StudioChatMessage[] }>(
      `/studio/sessions/${id}/chat?limit=${limit}`
    ),

  sendChatMessage: (
    id: string,
    data: {
      message: string
      intent?: string
      anchor?: Record<string, unknown>
    }
  ) =>
    request<{
      session_id: string
      user_message: StudioChatMessage
      assistant_message: StudioChatMessage
    }>(`/studio/sessions/${id}/chat`, {
      method: 'POST',
      body: data,
    }),

  /**
   * Stream chat via SSE (POST). Calls onToken for each text chunk, then onComplete with final payload.
   */
  sendChatMessageStream: async (
    id: string,
    data: {
      message: string
      intent?: string
      anchor?: Record<string, unknown>
    },
    handlers: {
      onToken: (t: string) => void
      onComplete: (payload: {
        session_id: string
        user_message: StudioChatMessage
        assistant_message: StudioChatMessage
      }) => void
      onError: (msg: string) => void
    }
  ): Promise<void> => {
    const token = getAuthToken()
    const res = await fetch(
      `${API_BASE_URL}/studio/sessions/${id}/chat/stream`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify(data),
      }
    )
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}))
      const msg =
        typeof errData.detail === 'string'
          ? errData.detail
          : extractDetailMessage(errData.detail, 'Stream failed')
      handlers.onError(msg)
      return
    }
    const reader = res.body?.getReader()
    if (!reader) {
      handlers.onError('No response body')
      return
    }
    const decoder = new TextDecoder()
    let buf = ''
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let sep: number
      while ((sep = buf.indexOf('\n\n')) >= 0) {
        const frame = buf.slice(0, sep)
        buf = buf.slice(sep + 2)
        let ev = ''
        let dataLine = ''
        for (const rawLine of frame.split('\n')) {
          const line = rawLine.replace(/\r$/, '')
          if (line.startsWith('event:')) ev = line.slice(6).trim()
          else if (line.startsWith('data:')) dataLine = line.slice(5).trim()
        }
        if (!ev || !dataLine) continue
        try {
          const parsed = JSON.parse(dataLine)
          if (ev === 'token' && parsed.t) handlers.onToken(String(parsed.t))
          else if (ev === 'complete') handlers.onComplete(parsed as any)
        } catch {
          /* skip malformed frame */
        }
      }
    }
  },

  clearChat: (id: string) =>
    request<{ session_id: string; cleared: boolean }>(
      `/studio/sessions/${id}/chat`,
      { method: 'DELETE' }
    ),

  // ── Phase 2: Source map (DOM ↔ source bridge) ────────────────────────
  buildSourceMap: (id: string) =>
    request<{
      session_id: string
      files_visited: number
      files_modified: number
      elements_indexed: number
      errors: Array<{ file: string; error: string }>
      bridge: {
        wrote_bridge_at: string | null
        patched_entry: string | null
        warning: string | null
      }
    }>(`/studio/sessions/${id}/source-map/build`, {
      method: 'POST',
    }),

  lookupSource: (id: string, dvId: string) =>
    request<{
      dv_id: string
      file: string
      line: number
      col: number
      tag: string
    }>(
      `/studio/sessions/${id}/source-map/lookup?dv_id=${encodeURIComponent(dvId)}`
    ),

  // ── Phase 2: Undo / redo ─────────────────────────────────────────────
  undo: (id: string) =>
    request<{
      session_id: string
      checkpoint: { id: string; state: string; label: string }
      files_touched: string[]
    }>(`/studio/sessions/${id}/undo`, { method: 'POST' }),

  redo: (id: string) =>
    request<{
      session_id: string
      checkpoint: { id: string; state: string; label: string }
      files_touched: string[]
    }>(`/studio/sessions/${id}/redo`, { method: 'POST' }),

  jumpToCheckpoint: (id: string, checkpointId: string) =>
    request<{
      session_id: string
      jumped_to: string
      files_touched: string[]
    }>(`/studio/sessions/${id}/jump-to/${checkpointId}`, { method: 'POST' }),

  // ── Phase 3: Git workflow ────────────────────────────────────────────
  gitDiff: (id: string) =>
    request<{
      session_id: string
      branch_head: string
      branch_base: string
      files: Array<{
        path: string
        before: string | null
        after: string | null
        checkpoint_id: string
        label: string
        ts: string
      }>
    }>(`/studio/sessions/${id}/git/diff`),

  commitAndPr: (
    id: string,
    data: {
      title: string
      body?: string
      open_pr?: boolean
      only_paths?: string[]
    }
  ) =>
    request<{
      kind: 'imported' | 'generated'
      branch?: string
      repo_url?: string
      files_pushed: string[]
      files_skipped: Array<{ path: string; reason: string }>
      pr?: {
        created: boolean
        url?: string
        number?: number
        error?: string
      } | null
      error?: string | null
    }>(`/studio/sessions/${id}/git/commit-and-pr`, {
      method: 'POST',
      body: data,
    }),

  // ── Phase 3: Saved component blocks ─────────────────────────────────
  listComponents: (id: string) =>
    request<{
      session_id: string
      components: StudioSavedComponent[]
    }>(`/studio/sessions/${id}/components`),

  saveComponent: (
    id: string,
    data: {
      label: string
      description?: string
      dv_id?: string | null
      html?: string | null
      tag?: string | null
    }
  ) =>
    request<StudioSavedComponent>(`/studio/sessions/${id}/components`, {
      method: 'POST',
      body: data,
    }),

  deleteComponent: (id: string, componentId: string) =>
    request<{ deleted: boolean; id: string }>(
      `/studio/sessions/${id}/components/${componentId}`,
      { method: 'DELETE' }
    ),

  // ── Phase 3: Vercel deploy ───────────────────────────────────────────
  deploy: (id: string, data: { project_name?: string } = {}) =>
    request<{
      deployment_id: string | null
      skipped: Array<{ path: string; reason: string }>
      readyState: string | null
      inspectorUrl: string | null
    }>(`/studio/sessions/${id}/deploy`, {
      method: 'POST',
      body: data,
    }),

  deployStatus: (sessionId: string, deploymentId: string) =>
    request<{
      id: string | null
      readyState: string | null
      inspectorUrl: string | null
      terminal: boolean
      url: string | null
      errorMessage: string | null
    }>(
      `/studio/sessions/${sessionId}/deploy/status?deployment_id=${encodeURIComponent(deploymentId)}`
    ),
}

export const integrations = {
  vercelStatus: () =>
    request<{ connected: boolean; team_id: string | null }>(
      '/auth/integrations/vercel'
    ),
  vercelConnect: (token: string, team_id?: string) =>
    request<{ connected: boolean; team_id: string | null }>(
      '/auth/integrations/vercel/connect',
      { method: 'POST', body: { token, team_id } }
    ),
  vercelDisconnect: () =>
    request<{ connected: boolean }>('/auth/integrations/vercel', {
      method: 'DELETE',
    }),
}

export interface StudioChatMessage {
  id: string
  ts: string
  role: 'user' | 'assistant' | 'system'
  content: string
  action?: {
    type?: string
    classification?: StudioEditClassification
    intent?: string
    anchor?: Record<string, unknown>
  } | null
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
  builder,
  studio,
}

export default api
