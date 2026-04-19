/**
 * DocuVerse Signal Panel — VS Code Webview
 *
 * Shows Signal Packets (customer voice → code mapping) inside
 * a styled webview panel.
 */

import * as vscode from 'vscode';
import { DocuVerseClient } from '../api/client';
import { SignalPacket } from '../api/types';

export class SignalPanel {
  public static currentPanel: SignalPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _client: DocuVerseClient;
  private readonly _repoId: string;
  private readonly _repoFullName: string;
  private _disposables: vscode.Disposable[] = [];

  private constructor(
    panel: vscode.WebviewPanel,
    client: DocuVerseClient,
    repoId: string,
    repoFullName: string,
  ) {
    this._panel = panel;
    this._client = client;
    this._repoId = repoId;
    this._repoFullName = repoFullName;

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);
    this._panel.webview.onDidReceiveMessage(
      (msg) => this._handleMessage(msg),
      null,
      this._disposables,
    );

    this._loadData();
  }

  public static async show(
    extensionUri: vscode.Uri,
    client: DocuVerseClient,
    repoId: string,
    repoFullName: string,
  ) {
    const column = vscode.ViewColumn.One;

    if (SignalPanel.currentPanel) {
      SignalPanel.currentPanel._panel.reveal(column);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      'docuverseSignal',
      `⚡ Signal — ${repoFullName}`,
      column,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    SignalPanel.currentPanel = new SignalPanel(panel, client, repoId, repoFullName);
  }

  private async _loadData() {
    this._panel.webview.html = this._getLoadingHtml();

    try {
      const resp = await this._client.listSignalPackets(this._repoId);
      const packets = resp.packets || [];
      this._panel.webview.html = this._getHtml(packets);
    } catch (err: any) {
      this._panel.webview.html = this._getErrorHtml(err.message);
    }
  }

  private async _handleMessage(msg: any) {
    switch (msg.command) {
      case 'createIssue': {
        const { packetId } = msg;
        const [owner, repo] = this._repoFullName.split('/');
        if (!owner || !repo) {
          vscode.window.showErrorMessage('Invalid repository name');
          return;
        }
        try {
          const result = await this._client.createIssueFromSignal(
            this._repoId,
            packetId,
            owner,
            repo,
          );
          vscode.window.showInformationMessage(
            `✅ Issue #${result.issue_number} created: ${result.title}`,
          );
          this._loadData(); // Refresh to show issue link
        } catch (err: any) {
          vscode.window.showErrorMessage(`Failed to create issue: ${err.message}`);
        }
        break;
      }
      case 'refresh': {
        this._loadData();
        break;
      }
    }
  }

  private _getLoadingHtml(): string {
    return `<!DOCTYPE html><html><head>${this._getStyles()}</head><body>
      <div class="loading">
        <div class="spinner"></div>
        <p>Loading Signal Packets…</p>
      </div>
    </body></html>`;
  }

  private _getErrorHtml(message: string): string {
    return `<!DOCTYPE html><html><head>${this._getStyles()}</head><body>
      <div class="error">
        <p>⚠️ ${message}</p>
        <button onclick="vscode.postMessage({command:'refresh'})">Retry</button>
      </div>
    </body></html>`;
  }

  private _getHtml(packets: SignalPacket[]): string {
    const urgencyColors: Record<string, string> = {
      critical: '#ef4444',
      high: '#f97316',
      medium: '#eab308',
      low: '#22c55e',
    };

    const issueIcons: Record<string, string> = {
      bug: '🐛',
      feature_request: '✨',
      question: '❓',
      performance: '⚡',
      ux: '🎨',
      security: '🔒',
      other: '⚠️',
    };

    const packetCards = packets.length === 0
      ? `<div class="empty">
           <p class="empty-title">No Signal Packets Yet</p>
           <p class="empty-desc">Import tickets from the web dashboard to generate code-aware signal analysis.</p>
         </div>`
      : packets
          .map((p) => {
            const color = urgencyColors[p.business_urgency] || '#eab308';
            const icon = issueIcons[p.issue_type] || '⚠️';
            const conf = Math.round(p.confidence_score * 100);
            const filesHtml = p.likely_files
              .slice(0, 5)
              .map((f) => `<div class="file-item"><code>${f}</code></div>`)
              .join('');

            const issueBtn = p.github_issue_url
              ? `<a href="${p.github_issue_url}" class="btn btn-green">View Issue #${p.github_issue_number}</a>`
              : `<button class="btn btn-primary" onclick="vscode.postMessage({command:'createIssue',packetId:'${p.id}'})">Create Issue</button>`;

            return `<div class="packet">
              <div class="packet-header">
                <span class="icon">${icon}</span>
                <span class="badge" style="background:${color}20;color:${color}">${p.business_urgency.toUpperCase()}</span>
                <span class="type-badge">${p.issue_type.replace('_', ' ')}</span>
                ${p.duplicate_count > 1 ? `<span class="dup-badge">${p.duplicate_count} dups</span>` : ''}
                <span class="confidence">${conf}%</span>
              </div>
              <p class="fix-summary">${p.fix_summary || p.root_cause_hypothesis || 'Investigation needed'}</p>
              ${p.root_cause_hypothesis ? `<div class="section"><h4>Root Cause</h4><p>${p.root_cause_hypothesis}</p></div>` : ''}
              ${filesHtml ? `<div class="section"><h4>Likely Files</h4>${filesHtml}</div>` : ''}
              ${p.customer_response_draft ? `<div class="section"><h4>Customer Response Draft</h4><p class="italic">${p.customer_response_draft}</p></div>` : ''}
              <div class="actions">${issueBtn}</div>
            </div>`;
          })
          .join('');

    return `<!DOCTYPE html><html><head>
      ${this._getStyles()}
      <script>const vscode = acquireVsCodeApi();</script>
    </head><body>
      <div class="header">
        <span class="header-icon">⚡</span>
        <div>
          <div class="header-title">Signal — ${this._repoFullName}</div>
          <div class="header-subtitle">${packets.length} packet${packets.length !== 1 ? 's' : ''}</div>
        </div>
        <button class="refresh-btn" onclick="vscode.postMessage({command:'refresh'})">↻ Refresh</button>
      </div>
      <div class="packets">${packetCards}</div>
    </body></html>`;
  }

  private _getStyles(): string {
    return `<style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: var(--vscode-font-family); color: var(--vscode-foreground);
        background: var(--vscode-editor-background); padding: 16px; }
      .loading, .error { text-align: center; padding: 60px 20px; }
      .spinner { width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.1);
        border-top-color: #818cf8; border-radius: 50%; animation: spin 0.8s linear infinite; margin: 0 auto 12px; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .error p { color: #f87171; margin-bottom: 12px; }
      .header { display: flex; align-items: center; gap: 12px; padding: 12px 16px;
        border-bottom: 1px solid rgba(255,255,255,0.06); margin-bottom: 16px; }
      .header-icon { font-size: 20px; }
      .header-title { font-size: 14px; font-weight: 600; }
      .header-subtitle { font-size: 11px; opacity: 0.5; }
      .refresh-btn { margin-left: auto; padding: 4px 12px; border-radius: 6px; border: 1px solid rgba(255,255,255,0.1);
        background: transparent; color: var(--vscode-foreground); cursor: pointer; font-size: 12px; }
      .refresh-btn:hover { background: rgba(255,255,255,0.05); }
      .empty { text-align: center; padding: 48px 20px; }
      .empty-title { font-size: 15px; font-weight: 600; margin-bottom: 8px; }
      .empty-desc { font-size: 12px; opacity: 0.5; max-width: 300px; margin: 0 auto; }
      .packet { background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.06);
        border-radius: 12px; padding: 16px; margin-bottom: 12px; }
      .packet-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
      .icon { font-size: 16px; }
      .badge { padding: 2px 8px; border-radius: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; }
      .type-badge { padding: 2px 8px; border-radius: 6px; font-size: 10px; background: rgba(255,255,255,0.06); }
      .dup-badge { padding: 2px 8px; border-radius: 6px; font-size: 10px; background: rgba(168,85,247,0.1); color: #c084fc; }
      .confidence { margin-left: auto; font-size: 11px; opacity: 0.5; font-variant-numeric: tabular-nums; }
      .fix-summary { font-size: 13px; font-weight: 500; margin-bottom: 12px; line-height: 1.5; }
      .section { margin-bottom: 12px; }
      .section h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.4; margin-bottom: 6px; }
      .section p { font-size: 12px; line-height: 1.6; opacity: 0.8; }
      .italic { font-style: italic; }
      .file-item { padding: 4px 8px; background: rgba(255,255,255,0.03); border-radius: 6px; margin-bottom: 4px; }
      .file-item code { font-size: 12px; color: #818cf8; }
      .actions { display: flex; gap: 8px; margin-top: 12px; }
      .btn { padding: 6px 16px; border-radius: 8px; font-size: 12px; font-weight: 600; cursor: pointer; border: none; }
      .btn-primary { background: #fff; color: #000; }
      .btn-primary:hover { box-shadow: 0 0 16px rgba(168,85,247,0.3); }
      .btn-green { background: rgba(34,197,94,0.1); color: #22c55e; text-decoration: none; display: inline-block; }
    </style>`;
  }

  public dispose() {
    SignalPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const d = this._disposables.pop();
      if (d) { d.dispose(); }
    }
  }
}
