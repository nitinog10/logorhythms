/**
 * DocuVerse API Types
 * TypeScript interfaces for all backend API contracts
 */

// ============================================================
// Authentication
// ============================================================

export interface User {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
}

export interface AuthResponse {
  auth_url: string;
  state: string;
}

export interface TokenResponse {
  token: string;
  user: User;
}

export interface VerifyResponse {
  valid: boolean;
  user: User;
}

// ============================================================
// Repositories
// ============================================================

export interface Repository {
  id: string;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  is_indexed: boolean;
  indexed_at: string | null;
  created_at: string | null;
  source?: 'github' | 'upload';
}

export interface GitHubRepository {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  language: string | null;
  stars: number;
  updated_at: string;
  private: boolean;
}

export interface RepoStatus {
  id: string;
  status: 'cloning' | 'indexing' | 'ready';
  is_indexed: boolean;
  indexed_at: string | null;
  has_local_files: boolean;
}

// ============================================================
// Files
// ============================================================

export interface FileNode {
  id: string;
  path: string;
  name: string;
  is_directory: boolean;
  language: string | null;
  size: number | null;
  children: FileNode[];
}

export interface ASTNode {
  id: string;
  type: string;
  name: string;
  start_line: number;
  end_line: number;
  docstring: string | null;
  parameters: string[] | null;
}

// ============================================================
// Impact Analysis
// ============================================================

export interface FileImpactSummary {
  file: string;
  direct_dependents: number;
  total_affected: number;
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | string;
}

export interface CodebaseImpact {
  total_files: number;
  total_dependencies: number;
  is_dag: boolean;
  connected_components: number;
  circular_dependencies: string[][];
  hotspots: FileImpactSummary[];
  most_imported: { file: string; import_count: number }[];
  overall_risk_score: number;
  overall_risk_level: 'low' | 'medium' | 'high' | string;
  recommended_actions: string[];
  brief_script: string;
  impact_mermaid: string;
}

export interface ImpactAnalysis {
  target_file: string;
  symbol: string | null;
  symbol_context: {
    found: boolean;
    name: string;
    type: string;
    start_line: number;
    end_line: number;
    parameters: string[];
  } | null;
  direct_dependents: string[];
  affected_files: string[];
  total_affected: number;
  dependency_chain: Record<string, string[]>;
  circular_dependencies: string[][];
  risk_score: number;
  risk_level: 'low' | 'medium' | 'high' | string;
  recommended_refactor_steps: string[];
  brief_script: string;
  impact_mermaid: string;
}

// ============================================================
// Walkthroughs
// ============================================================

export interface ScriptSegment {
  id: string;
  order: number;
  text: string;
  start_line: number;
  end_line: number;
  highlight_lines: number[];
  duration_estimate: number;
  code_context?: string;
}

export interface WalkthroughScript {
  id: string;
  file_path: string;
  title: string;
  summary: string;
  view_mode: 'developer' | 'manager';
  segments: ScriptSegment[];
  total_duration: number;
  created_at?: string;
  metadata?: Record<string, any>;
}

export interface AudioSegment {
  id: string;
  script_segment_id: string;
  audio_url: string;
  duration: number;
  start_time: number;
  end_time: number;
}

export interface AudioWalkthrough {
  id: string;
  file_path: string;
  audio_segments: AudioSegment[];
  full_audio_url: string | null;
  total_duration: number;
}

// ============================================================
// Diagrams
// ============================================================

export type DiagramType = 'flowchart' | 'classDiagram' | 'sequenceDiagram' | 'erDiagram';

export interface Diagram {
  id: string;
  type: DiagramType;
  title: string;
  mermaid_code: string;
  source_file: string | null;
}

// ============================================================
// Sandbox
// ============================================================

export interface SandboxResult {
  success: boolean;
  output: string;
  error: string | null;
  execution_time: number;
}

// ============================================================
// Documentation
// ============================================================

export interface DocSection {
  title: string;
  content: string;
}

export interface FileDocumentation {
  path: string;
  language: string;
  summary: string;
  sections: DocSection[];
}

export interface RepositoryDocumentation {
  overview: string;
  architecture: string;
  folder_tree: string;
  files: FileDocumentation[];
  dependencies: string;
}

// ============================================================
// GitHub Automation
// ============================================================

export interface CreateRepoResponse {
  url: string;
  full_name: string;
  github_id: number;
  default_branch: string;
}

export interface PushReadmeResponse {
  success: boolean;
  commit_sha: string;
  url: string;
}

export interface CreateIssueResponse {
  issue_number: number;
  url: string;
  title: string;
}

export interface ImplementFixResponse {
  branch: string;
  pr_number: number;
  pr_url: string;
  files_changed: number;
  merged: boolean;
  readme_updated: boolean;
}

// ============================================================
// Signal (Customer Voice-to-Code)
// ============================================================

export type SignalIssueType = 'bug' | 'feature_request' | 'question' | 'performance' | 'ux' | 'security' | 'other';
export type SignalUrgency = 'critical' | 'high' | 'medium' | 'low';

export interface SignalCodeMatch {
  file_path: string;
  symbol: string | null;
  confidence: number;
  snippet: string | null;
  start_line: number | null;
  end_line: number | null;
}

export interface SignalPacket {
  id: string;
  repo_id: string;
  signal_id: string;
  cluster_id: string | null;
  issue_type: SignalIssueType;
  business_urgency: SignalUrgency;
  duplicate_count: number;
  likely_files: string[];
  likely_symbols: string[];
  code_matches: SignalCodeMatch[];
  owner_suggestions: string[];
  fix_summary: string;
  root_cause_hypothesis: string;
  docs_update_suggestions: string[];
  customer_response_draft: string;
  confidence_score: number;
  github_issue_url: string | null;
  github_issue_number: number | null;
  created_at: string;
  updated_at: string;
}

export interface SignalPacketListResponse {
  success: boolean;
  packets: SignalPacket[] | null;
  total: number;
}
