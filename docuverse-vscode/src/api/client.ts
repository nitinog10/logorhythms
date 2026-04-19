/**
 * DocuVerse API Client
 * HTTP client for communicating with the DocuVerse backend
 */

import * as vscode from 'vscode';
import * as https from 'https';
import * as http from 'http';
import { URL } from 'url';
import {
  Repository, GitHubRepository, RepoStatus, FileNode, ASTNode,
  ImpactAnalysis, CodebaseImpact, WalkthroughScript, AudioWalkthrough,
  Diagram, DiagramType, SandboxResult, RepositoryDocumentation,
  FileDocumentation, AuthResponse, VerifyResponse
} from './types';

export class APIError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.name = 'APIError';
    this.status = status;
    this.data = data;
  }
}

export class DocuVerseClient {
  private getBaseUrl(): string {
    return vscode.workspace.getConfiguration('docuverse').get<string>('apiUrl')
      || 'https://xpbgkuukxp.ap-south-1.awsapprunner.com/api';
  }

  private tokenProvider: () => Promise<string | null>;

  constructor(tokenProvider: () => Promise<string | null>) {
    this.tokenProvider = tokenProvider;
  }

  private async request<T>(endpoint: string, options: {
    method?: string;
    body?: any;
    rawResponse?: boolean;
  } = {}): Promise<T> {
    const { method = 'GET', body } = options;
    const baseUrl = this.getBaseUrl();
    const fullUrl = `${baseUrl}${endpoint}`;
    const token = await this.tokenProvider();

    const url = new URL(fullUrl);
    const isHttps = url.protocol === 'https:';
    const transport = isHttps ? https : http;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const bodyStr = body ? JSON.stringify(body) : undefined;
    if (bodyStr) {
      headers['Content-Length'] = Buffer.byteLength(bodyStr).toString();
    }

    return new Promise<T>((resolve, reject) => {
      const req = transport.request(
        {
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: url.pathname + url.search,
          method,
          headers,
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
              if (!data) {
                resolve({} as T);
                return;
              }
              try {
                resolve(JSON.parse(data));
              } catch {
                resolve(data as unknown as T);
              }
            } else {
              let errorData: any = {};
              try { errorData = JSON.parse(data); } catch { /* ignore */ }
              reject(new APIError(
                errorData.detail || `HTTP ${res.statusCode}`,
                res.statusCode || 500,
                errorData
              ));
            }
          });
        }
      );

      req.on('error', (err) => {
        reject(new APIError(err.message, 0));
      });

      if (bodyStr) {
        req.write(bodyStr);
      }
      req.end();
    });
  }

  // ----------------------------------------------------------
  // Auth
  // ----------------------------------------------------------

  getGitHubAuthUrl() {
    return this.request<AuthResponse>('/auth/github');
  }

  verifyToken() {
    return this.request<VerifyResponse>('/auth/verify');
  }

  // ----------------------------------------------------------
  // Repositories
  // ----------------------------------------------------------

  listGitHubRepos() {
    return this.request<GitHubRepository[]>('/repositories/github');
  }

  connectRepo(fullName: string) {
    return this.request<Repository>('/repositories/connect', {
      method: 'POST',
      body: { full_name: fullName },
    });
  }

  listRepos() {
    return this.request<Repository[]>('/repositories/');
  }

  getRepo(id: string) {
    return this.request<Repository>(`/repositories/${id}`);
  }

  getRepoStatus(id: string) {
    return this.request<RepoStatus>(`/repositories/${id}/status`);
  }

  deleteRepo(id: string) {
    return this.request(`/repositories/${id}`, { method: 'DELETE' });
  }

  // ----------------------------------------------------------
  // Files
  // ----------------------------------------------------------

  getFileTree(repoId: string) {
    return this.request<FileNode[]>(`/files/${repoId}/tree`);
  }

  getFileContent(repoId: string, path: string) {
    return this.request<string>(`/files/${repoId}/content?path=${encodeURIComponent(path)}`);
  }

  getAST(repoId: string, path: string) {
    return this.request<ASTNode[]>(`/files/${repoId}/ast?path=${encodeURIComponent(path)}`);
  }

  getImpact(repoId: string, path: string, symbol?: string) {
    const symbolParam = symbol ? `&symbol=${encodeURIComponent(symbol)}` : '';
    return this.request<ImpactAnalysis>(
      `/files/${repoId}/impact?path=${encodeURIComponent(path)}${symbolParam}`
    );
  }

  getCodebaseImpact(repoId: string) {
    return this.request<CodebaseImpact>(`/files/${repoId}/impact/codebase`);
  }

  // ----------------------------------------------------------
  // Walkthroughs
  // ----------------------------------------------------------

  generateWalkthrough(repositoryId: string, filePath: string, viewMode: 'developer' | 'manager' = 'developer') {
    return this.request<WalkthroughScript>('/walkthroughs/generate', {
      method: 'POST',
      body: { repository_id: repositoryId, file_path: filePath, view_mode: viewMode },
    });
  }

  getWalkthrough(id: string) {
    return this.request<WalkthroughScript>(`/walkthroughs/${id}`);
  }

  getAudio(id: string) {
    return this.request<AudioWalkthrough>(`/walkthroughs/${id}/audio`);
  }

  getWalkthroughsForFile(repoId: string, filePath: string) {
    return this.request<WalkthroughScript[]>(
      `/walkthroughs/file/${repoId}?file_path=${encodeURIComponent(filePath)}`
    );
  }

  getWalkthroughsForRepo(repoId: string) {
    return this.request<WalkthroughScript[]>(`/walkthroughs/repo/${repoId}`);
  }

  deleteWalkthrough(id: string) {
    return this.request(`/walkthroughs/${id}`, { method: 'DELETE' });
  }

  getAudioStreamUrl(id: string): string {
    return `${this.getBaseUrl()}/walkthroughs/${id}/audio/stream`;
  }

  // ----------------------------------------------------------
  // Diagrams
  // ----------------------------------------------------------

  generateDiagram(repositoryId: string, diagramType: DiagramType, filePath?: string) {
    return this.request<Diagram>('/diagrams/generate', {
      method: 'POST',
      body: { repository_id: repositoryId, diagram_type: diagramType, file_path: filePath },
    });
  }

  getDiagram(id: string) {
    return this.request<Diagram>(`/diagrams/${id}`);
  }

  // ----------------------------------------------------------
  // Sandbox
  // ----------------------------------------------------------

  executeSandbox(code: string, language: string, variables: Record<string, any> = {}) {
    return this.request<SandboxResult>('/sandbox/execute', {
      method: 'POST',
      body: { code, language, variables },
    });
  }

  // ----------------------------------------------------------
  // Documentation
  // ----------------------------------------------------------

  generateDocs(repoId: string) {
    return this.request<{ status: string; message: string }>(`/documentation/${repoId}/generate`, {
      method: 'POST',
    });
  }

  getDocs(repoId: string) {
    return this.request<{ status: string; data?: RepositoryDocumentation | null }>(
      `/documentation/${repoId}`
    );
  }

  getFileDocs(repoId: string, filePath: string) {
    return this.request<{ status: string; data: FileDocumentation }>(
      `/documentation/${repoId}/file?path=${encodeURIComponent(filePath)}`
    );
  }

  // ----------------------------------------------------------
  // GitHub Automation
  // ----------------------------------------------------------

  pushReadme(owner: string, repo: string, content: string, branch: string = 'main') {
    return this.request<{ success: boolean; commit_sha: string; url: string }>('/github/push-readme', {
      method: 'POST',
      body: { owner, repo, content, branch, message: 'docs: auto-generated by DocuVerse' },
    });
  }

  createIssue(owner: string, repo: string, title: string, body: string, labels: string[] = []) {
    return this.request<{ issue_number: number; url: string; title: string }>('/github/create-issue', {
      method: 'POST',
      body: { owner, repo, title, body, labels },
    });
  }

  // ----------------------------------------------------------
  // Signal (Customer Voice-to-Code)
  // ----------------------------------------------------------

  listSignalPackets(repoId: string) {
    return this.request<import('./types').SignalPacketListResponse>(`/signal/${repoId}/packets`);
  }

  getSignalPacket(repoId: string, packetId: string) {
    return this.request<import('./types').SignalPacket>(`/signal/${repoId}/packets/${packetId}`);
  }

  createIssueFromSignal(repoId: string, packetId: string, owner: string, repo: string) {
    return this.request<{ issue_number: number; url: string; title: string }>(
      `/signal/${repoId}/packets/${packetId}/create-issue`,
      { method: 'POST', body: { owner, repo, additional_labels: [] } }
    );
  }
}
