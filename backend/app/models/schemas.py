"""
Pydantic schemas for DocuVerse API
"""

from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field


# ============================================================
# Enums
# ============================================================

class ViewMode(str, Enum):
    """Documentation view modes"""
    DEVELOPER = "developer"
    MANAGER = "manager"


class NodeType(str, Enum):
    """AST Node types"""
    FUNCTION = "function"
    CLASS = "class"
    METHOD = "method"
    VARIABLE = "variable"
    IMPORT = "import"
    MODULE = "module"
    SECTION = "section"


class DiagramType(str, Enum):
    """Mermaid diagram types"""
    FLOWCHART = "flowchart"
    CLASS_DIAGRAM = "classDiagram"
    SEQUENCE = "sequenceDiagram"
    ER_DIAGRAM = "erDiagram"


# ============================================================
# User Models
# ============================================================

class User(BaseModel):
    """User model"""
    id: str
    github_id: int
    username: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None
    access_token: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class UserResponse(BaseModel):
    """User response (without sensitive data)"""
    id: str
    username: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None


# ============================================================
# Repository Models
# ============================================================

class Repository(BaseModel):
    """Repository model"""
    id: str
    user_id: str
    github_repo_id: int
    name: str
    full_name: str
    description: Optional[str] = None
    default_branch: str = "main"
    language: Optional[str] = None
    clone_url: str
    local_path: Optional[str] = None
    is_indexed: bool = False
    indexed_at: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    source: str = "github"  # "github" or "upload"


class RepositoryCreate(BaseModel):
    """Repository creation request"""
    full_name: str  # e.g., "owner/repo-name"


class RepositoryResponse(BaseModel):
    """Repository response"""
    id: str
    name: str
    full_name: str
    description: Optional[str] = None
    language: Optional[str] = None
    is_indexed: bool
    indexed_at: Optional[datetime] = None
    created_at: Optional[datetime] = None
    source: str = "github"


# ============================================================
# File & Code Models
# ============================================================

class FileNode(BaseModel):
    """File system node"""
    id: str
    path: str
    name: str
    is_directory: bool
    language: Optional[str] = None
    size: Optional[int] = None
    children: List["FileNode"] = []


class ASTNode(BaseModel):
    """Abstract Syntax Tree node"""
    id: str
    type: NodeType
    name: str
    start_line: int
    end_line: int
    start_col: int
    end_col: int
    docstring: Optional[str] = None
    parameters: Optional[List[str]] = None
    return_type: Optional[str] = None
    children: List["ASTNode"] = []
    metadata: Dict[str, Any] = {}


class CodeChunk(BaseModel):
    """Code chunk for vector storage"""
    id: str
    file_path: str
    content: str
    start_line: int
    end_line: int
    chunk_type: NodeType
    name: Optional[str] = None
    embedding: Optional[List[float]] = None
    metadata: Dict[str, Any] = {}


class DependencyEdge(BaseModel):
    """Dependency graph edge"""
    source: str  # File path
    target: str  # File path
    import_name: str
    is_external: bool = False


class DependencyGraph(BaseModel):
    """Dependency DAG for repository"""
    nodes: List[str]  # File paths
    edges: List[DependencyEdge]


# ============================================================
# Walkthrough Models
# ============================================================

class ScriptSegment(BaseModel):
    """Single segment of walkthrough script"""
    id: str
    order: int
    text: str
    start_line: int
    end_line: int
    highlight_lines: List[int] = []
    duration_estimate: float  # seconds
    code_context: Optional[str] = None


class WalkthroughScript(BaseModel):
    """Complete walkthrough script for a file"""
    id: str
    file_path: str
    title: str
    summary: str
    view_mode: ViewMode
    segments: List[ScriptSegment]
    total_duration: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = {}


class WalkthroughRequest(BaseModel):
    """Request to generate walkthrough"""
    repository_id: str
    file_path: str
    view_mode: ViewMode = ViewMode.DEVELOPER


# ============================================================
# Audio Models
# ============================================================

class AudioSegment(BaseModel):
    """Audio segment with timing info"""
    id: str
    script_segment_id: str
    audio_url: str
    duration: float  # seconds
    start_time: float  # seconds from beginning
    end_time: float


class AudioWalkthrough(BaseModel):
    """Complete audio walkthrough"""
    id: str
    walkthrough_script_id: str
    file_path: str
    audio_segments: List[AudioSegment]
    full_audio_url: Optional[str] = None
    total_duration: float
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ============================================================
# Diagram Models
# ============================================================

class DiagramData(BaseModel):
    """Mermaid diagram data"""
    id: str
    type: DiagramType
    title: str
    mermaid_code: str
    source_file: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class DiagramRequest(BaseModel):
    """Request to generate diagram"""
    repository_id: str
    file_path: Optional[str] = None
    diagram_type: DiagramType


# ============================================================
# Impact Analysis Models
# ============================================================

class ImpactAnalysisResponse(BaseModel):
    """Impact analysis result for a file/symbol change"""
    target_file: str
    symbol: Optional[str] = None
    symbol_context: Optional[Dict[str, Any]] = None
    direct_dependents: List[str]
    affected_files: List[str]
    total_affected: int
    dependency_chain: Dict[str, List[str]]
    circular_dependencies: List[List[str]]
    risk_score: int = Field(ge=0, le=100)
    risk_level: str
    recommended_refactor_steps: List[str]
    brief_script: str
    impact_mermaid: str


class FileImpactSummary(BaseModel):
    """Per-file summary inside a codebase impact report"""
    file: str
    direct_dependents: int
    total_affected: int
    risk_score: int = Field(ge=0, le=100)
    risk_level: str


class CodebaseImpactResponse(BaseModel):
    """Full-codebase impact analysis"""
    total_files: int
    total_dependencies: int
    is_dag: bool
    connected_components: int
    circular_dependencies: List[List[str]]
    hotspots: List[FileImpactSummary]
    most_imported: List[Dict[str, Any]]
    overall_risk_score: int = Field(ge=0, le=100)
    overall_risk_level: str
    recommended_actions: List[str]
    brief_script: str
    impact_mermaid: str


# ============================================================
# Sandbox Models
# ============================================================

class SandboxExecutionRequest(BaseModel):
    """Request to execute code in sandbox"""
    code: str
    language: str
    variables: Dict[str, Any] = {}


class SandboxExecutionResult(BaseModel):
    """Sandbox execution result"""
    success: bool
    output: str
    error: Optional[str] = None
    execution_time: float  # milliseconds


# ============================================================
# API Response Models
# ============================================================

class APIResponse(BaseModel):
    """Standard API response wrapper"""
    success: bool
    message: Optional[str] = None
    data: Optional[Any] = None


class PaginatedResponse(BaseModel):
    """Paginated response"""
    items: List[Any]
    total: int
    page: int
    per_page: int
    has_next: bool
    has_prev: bool


# ============================================================
# GitHub Integration Models
# ============================================================

class CreateRepoRequest(BaseModel):
    """Request to create a new GitHub repository"""
    name: str
    description: str = ""
    private: bool = False


class CreateRepoResponse(BaseModel):
    """Response after creating a GitHub repository"""
    url: str
    full_name: str
    github_id: int
    default_branch: str = "main"


class CreateRepoWithUploadResponse(BaseModel):
    """Response after creating a GitHub repository and pushing project files"""
    url: str
    full_name: str
    github_id: int
    default_branch: str = "main"
    files_pushed: int = 0
    commit_sha: str = ""
    repository_id: str = ""


class PushReadmeRequest(BaseModel):
    """Request to push documentation to a repo README"""
    owner: str
    repo: str
    content: str
    branch: str = "main"
    message: str = "docs: auto-generated by DocuVerse"


class PushReadmeResponse(BaseModel):
    """Response after pushing README"""
    success: bool
    commit_sha: str
    url: str


class CreateIssueRequest(BaseModel):
    """Request to create a GitHub issue from impact analysis"""
    owner: str
    repo: str
    title: str
    body: str
    labels: List[str] = []


class CreateIssueResponse(BaseModel):
    """Response after creating a GitHub issue"""
    issue_number: int
    url: str
    title: str


class ImplementFixRequest(BaseModel):
    """Request to auto-implement codebase-wide fixes, create PR, merge, and update README"""
    owner: str
    repo: str
    suggestions: List[str]
    impact_summary: str = ""
    base_branch: str = "main"


class ImplementFixResponse(BaseModel):
    """Response after implementing codebase-wide fix"""
    branch: str
    pr_number: int
    pr_url: str
    files_changed: int
    merged: bool
    readme_updated: bool


class AutomationHistory(BaseModel):
    """Persisted state of GitHub automation actions for a repo"""
    full_name: str  # "owner/repo"
    # Fix / PR
    fix_pr_url: Optional[str] = None
    fix_pr_number: Optional[int] = None
    fix_branch: Optional[str] = None
    fix_files_changed: int = 0
    fix_merged: bool = False
    fix_readme_updated: bool = False
    fix_suggestions: List[str] = []
    fix_created_at: Optional[str] = None
    # Issue
    issue_url: Optional[str] = None
    issue_number: Optional[int] = None
    issue_title: Optional[str] = None
    issue_created_at: Optional[str] = None
    # Docs push
    docs_url: Optional[str] = None
    docs_commit_sha: Optional[str] = None
    docs_pushed_at: Optional[str] = None


# ============================================================
# Provenance (Why Graph + Assumption Ledger)
# ============================================================


class EvidenceSourceType(str, Enum):
    """Origin of a piece of provenance evidence"""

    COMMIT = "commit"
    PULL_REQUEST = "pull_request"
    ISSUE = "issue"
    ADR = "adr"
    DOC = "doc"
    COMMENT = "comment"
    OTHER = "other"


class AssumptionStatus(str, Enum):
    """Lifecycle status for an extracted assumption"""

    ACTIVE = "active"
    LIKELY_STALE = "likely_stale"
    SUPERSEDED = "superseded"
    UNKNOWN = "unknown"


class EvidenceLink(BaseModel):
    """Single grounded evidence item (commit, PR, issue, etc.)"""

    id: str
    source_type: EvidenceSourceType
    source_url: str
    title: str
    excerpt: str = ""
    confidence: float = Field(ge=0.0, le=1.0)
    created_at: Optional[datetime] = None


class AssumptionEntry(BaseModel):
    """One assumption or constraint inferred from evidence + code"""

    id: str
    statement: str
    status: AssumptionStatus = AssumptionStatus.UNKNOWN
    confidence: float = Field(ge=0.0, le=1.0)
    evidence_ids: List[str] = []
    last_validated_at: Optional[datetime] = None


class DecisionThread(BaseModel):
    """Thread of related decisions (supersession chain)"""

    id: str
    summary: str
    evidence_ids: List[str] = []
    confidence: float = Field(ge=0.0, le=1.0)


class StaleAssumptionAlert(BaseModel):
    """Warning that an assumption may no longer hold"""

    id: str
    assumption_id: str
    statement: str
    file_path: str
    symbol: Optional[str] = None
    reason: str
    severity: str = "medium"  # low | medium | high
    evidence_ids: List[str] = []


class ProvenanceCard(BaseModel):
    """Symbol- or file-level provenance card"""

    id: str
    repo_id: str
    file_path: str
    symbol: Optional[str] = None
    symbol_type: Optional[str] = None
    current_purpose: str = ""
    origin_summary: str = ""
    decision_summary: str = ""
    assumptions: List[AssumptionEntry] = []
    stale_assumptions: List[StaleAssumptionAlert] = []
    safe_change_notes: List[str] = []
    evidence_links: List[EvidenceLink] = []
    confidence_score: float = Field(ge=0.0, le=1.0)
    decision_threads: List[DecisionThread] = []
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = {}


class ProvenanceQueryRequest(BaseModel):
    """Request body for POST /provenance/query"""

    repository_id: str
    file_path: str
    symbol: Optional[str] = None
    symbol_type: Optional[str] = None
    force_refresh: bool = False


class ProvenanceConfig(BaseModel):
    """Optional overrides for a single provenance run"""

    max_history_commits: Optional[int] = None
    max_prs: Optional[int] = None
    confidence_threshold: Optional[float] = None


class ProvenanceQueryResponse(BaseModel):
    """API wrapper for a provenance card + status"""

    success: bool = True
    message: Optional[str] = None
    card: Optional[ProvenanceCard] = None
    from_cache: bool = False


class ProvenanceFeedbackRequest(BaseModel):
    """User feedback on provenance quality"""

    file_path: str
    symbol: Optional[str] = None
    rating: str  # correct | partially_correct | wrong


class ProvenanceRefreshBody(BaseModel):
    """Force-refresh payload (repo id comes from URL)."""

    file_path: str
    symbol: Optional[str] = None
    symbol_type: Optional[str] = None



# ============================================================
# Signal Models (Customer Voice-to-Code Copilot)
# ============================================================


class SignalSource(str, Enum):
    """Ticket source platform"""
    LINEAR = "linear"
    ZENDESK = "zendesk"
    INTERCOM = "intercom"
    MANUAL = "manual"


class SignalStatus(str, Enum):
    """Signal processing status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class SignalIssueType(str, Enum):
    """Classified issue type"""
    BUG = "bug"
    FEATURE_REQUEST = "feature_request"
    QUESTION = "question"
    PERFORMANCE = "performance"
    UX = "ux"
    SECURITY = "security"
    OTHER = "other"


class SignalUrgency(str, Enum):
    """Business urgency level"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


class SignalSourceConfig(BaseModel):
    """Configuration for a ticket source integration"""
    id: str
    repo_id: str
    source: SignalSource = SignalSource.MANUAL
    enabled: bool = True
    api_key: Optional[str] = None
    webhook_secret: Optional[str] = None
    auto_create_issues: bool = False
    priority_threshold: float = Field(default=0.5, ge=0.0, le=1.0)
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CustomerSignal(BaseModel):
    """Normalized customer ticket / feedback signal"""
    id: str
    repo_id: str
    source: SignalSource = SignalSource.MANUAL
    external_ticket_id: Optional[str] = None
    title: str
    body: str
    customer_segment: Optional[str] = None
    priority: Optional[str] = None
    status: SignalStatus = SignalStatus.PENDING
    tags: List[str] = []
    metadata: Dict[str, Any] = {}
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SignalCluster(BaseModel):
    """Cluster of related customer signals (duplicate detection)"""
    id: str
    repo_id: str
    representative_title: str
    signal_ids: List[str] = []
    size: int = 0
    combined_urgency: SignalUrgency = SignalUrgency.MEDIUM
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class SignalCodeMatch(BaseModel):
    """A code area matched to a signal"""
    file_path: str
    symbol: Optional[str] = None
    confidence: float = Field(ge=0.0, le=1.0)
    snippet: Optional[str] = None
    start_line: Optional[int] = None
    end_line: Optional[int] = None


class SignalPacket(BaseModel):
    """Complete Signal Packet — the core output of the Signal feature"""
    id: str
    repo_id: str
    signal_id: str
    cluster_id: Optional[str] = None
    issue_type: SignalIssueType = SignalIssueType.OTHER
    business_urgency: SignalUrgency = SignalUrgency.MEDIUM
    duplicate_count: int = 0
    likely_files: List[str] = []
    likely_symbols: List[str] = []
    code_matches: List[SignalCodeMatch] = []
    owner_suggestions: List[str] = []
    fix_summary: str = ""
    root_cause_hypothesis: str = ""
    docs_update_suggestions: List[str] = []
    customer_response_draft: str = ""
    confidence_score: float = Field(default=0.5, ge=0.0, le=1.0)
    github_issue_url: Optional[str] = None
    github_issue_number: Optional[int] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    metadata: Dict[str, Any] = {}


class ResolutionDraft(BaseModel):
    """Customer-safe resolution summary after a fix lands"""
    id: str
    packet_id: str
    summary: str
    changelog_entry: Optional[str] = None
    help_center_update: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ── Signal Request / Response models ──

class SignalImportRequest(BaseModel):
    """Request to import a customer signal manually"""
    repo_id: str
    title: str
    body: str
    source: SignalSource = SignalSource.MANUAL
    external_ticket_id: Optional[str] = None
    customer_segment: Optional[str] = None
    priority: Optional[str] = None
    tags: List[str] = []


class SignalConfigRequest(BaseModel):
    """Request to update signal source configuration"""
    source: SignalSource = SignalSource.MANUAL
    enabled: bool = True
    api_key: Optional[str] = None
    auto_create_issues: bool = False
    priority_threshold: float = Field(default=0.5, ge=0.0, le=1.0)


class SignalPacketResponse(BaseModel):
    """API response wrapper for signal packets"""
    success: bool = True
    message: Optional[str] = None
    packet: Optional[SignalPacket] = None
    packets: Optional[List[SignalPacket]] = None
    total: int = 0


class CreateIssueFromSignalRequest(BaseModel):
    """Request to create a GitHub issue from a Signal Packet"""
    owner: str
    repo: str
    additional_labels: List[str] = []


# Resolve forward references
FileNode.model_rebuild()
ASTNode.model_rebuild()