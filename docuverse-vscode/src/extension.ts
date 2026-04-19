/**
 * DocuVerse AI — VS Code Extension Entry Point
 * 
 * Simplified, developer-friendly extension.
 * Two sidebar states: Welcome (logged out) → Hub (logged in)
 */

import * as vscode from 'vscode';
import { DocuVerseClient } from './api/client';
import { AuthManager } from './auth/authManager';
import { WelcomeViewProvider } from './views/welcomeView';
import { HubViewProvider } from './views/hubView';
import { StatusBarManager } from './views/statusBar';
import { WalkthroughPanel } from './walkthroughs/walkthroughPanel';
import { ImpactPanel } from './impact/impactPanel';
import { DiagramPanel } from './diagrams/diagramPanel';
import { DocsPanel } from './docs/docsPanel';
import { runSandbox } from './sandbox/sandboxCommand';
import { SignalPanel } from './signal/signalPanel';
import { DiagramType, FileNode } from './api/types';

let statusBar: StatusBarManager;
let hubProvider: HubViewProvider;

export function activate(context: vscode.ExtensionContext) {
  console.log('DocuVerse AI extension activating...');

  // Initialize auth
  const auth = AuthManager.init(context);
  const client = new DocuVerseClient(() => auth.getToken());

  // Initialize status bar
  statusBar = new StatusBarManager();
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // Register sidebar views
  const welcomeProvider = new WelcomeViewProvider(context.extensionUri);
  hubProvider = new HubViewProvider(context.extensionUri, client);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('docuverse-welcome', welcomeProvider)
  );
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('docuverse-hub', hubProvider)
  );

  // Set initial login state context (controls which view is visible)
  vscode.commands.executeCommand('setContext', 'docuverse.isLoggedIn', false);

  // React to auth changes
  auth.onDidChangeAuth((loggedIn) => {
    vscode.commands.executeCommand('setContext', 'docuverse.isLoggedIn', loggedIn);
    statusBar.update();
    if (loggedIn) {
      hubProvider.refresh();
    }
  });

  // Try restoring session
  auth.tryRestoreSession(client).then(restored => {
    if (restored) {
      vscode.commands.executeCommand('setContext', 'docuverse.isLoggedIn', true);
      statusBar.update();
    }
  });

  // ============================================================
  // Commands
  // ============================================================

  // Login
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.login', () => auth.login(client))
  );

  // Logout
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.logout', () => auth.logout())
  );

  // Refresh
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.refreshExplorer', () => hubProvider.refresh())
  );

  // Connect Repository
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.connectRepo', async () => {
      if (!auth.isLoggedIn) {
        vscode.window.showWarningMessage('DocuVerse: Please sign in first.');
        return;
      }

      try {
        const githubRepos = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: 'DocuVerse: Fetching your repositories...' },
          () => client.listGitHubRepos()
        );

        const items = githubRepos.map(r => ({
          label: `$(repo) ${r.full_name}`,
          description: r.private ? '🔒 Private' : '🌐 Public',
          detail: `${r.language || 'Unknown'} · ⭐ ${r.stars}`,
          fullName: r.full_name,
        }));

        const selected = await vscode.window.showQuickPick(items, {
          title: 'DocuVerse: Connect Repository',
          placeHolder: 'Search your GitHub repositories...',
          matchOnDescription: true,
          matchOnDetail: true,
        });

        if (selected) {
          await vscode.window.withProgress(
            {
              location: vscode.ProgressLocation.Notification,
              title: `DocuVerse: Connecting ${selected.fullName}...`,
              cancellable: false,
            },
            async (progress) => {
              progress.report({ message: 'Cloning...' });
              const repo = await client.connectRepo(selected.fullName);

              progress.report({ message: 'Indexing code...' });
              let attempts = 0;
              while (attempts < 60) {
                const status = await client.getRepoStatus(repo.id);
                if (status.status === 'ready') { break; }
                await new Promise(r => setTimeout(r, 3000));
                attempts++;
              }

              hubProvider.refresh();
              vscode.window.showInformationMessage(`✅ Connected: ${selected.fullName}`);
            }
          );
        }
      } catch (err: any) {
        vscode.window.showErrorMessage(`DocuVerse: ${err.message}`);
      }
    })
  );

  // View File Content
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.viewFile', async (args?: { repoId: string; filePath: string }) => {
      if (!args?.repoId || !args?.filePath) { return; }

      const { repoId, filePath } = args;
      const fileName = filePath.split('/').pop() || filePath;

      try {
        const content = await vscode.window.withProgress(
          { location: vscode.ProgressLocation.Notification, title: `DocuVerse: Loading ${fileName}...` },
          () => client.getFileContent(repoId, filePath)
        );

        const panel = vscode.window.createWebviewPanel(
          'docuverseFileView',
          `📄 ${fileName}`,
          vscode.ViewColumn.One,
          { enableScripts: false, retainContextWhenHidden: false }
        );

        const ext = fileName.split('.').pop()?.toLowerCase() || '';
        const codeStr = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        const escapedCode = codeStr
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;');

        const lines = escapedCode.split('\n');
        const codeHtml = lines.map((line: string, i: number) => {
          const num = i + 1;
          return `<div class="code-line"><span class="ln">${num}</span><span class="code">${line || ' '}</span></div>`;
        }).join('');

        panel.webview.html = `<!DOCTYPE html><html><head><style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body { font-family:var(--vscode-editor-font-family); color:var(--vscode-foreground);
            background:var(--vscode-editor-background); overflow-y:auto; }
          .header { padding:12px 16px; border-bottom:1px solid rgba(255,255,255,0.08);
            display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.02); }
          .header-title { font-size:13px; font-weight:600; }
          .header-path { font-size:11px; opacity:0.4; }
          .code-line { display:flex; font-size:var(--vscode-editor-font-size,13px); line-height:22px; }
          .code-line:hover { background:rgba(255,255,255,0.03); }
          .ln { min-width:52px; text-align:right; padding-right:16px; color:rgba(255,255,255,0.2);
            user-select:none; flex-shrink:0; }
          .code { white-space:pre; padding-right:16px; flex:1; }
          ::-webkit-scrollbar { width:6px; height:6px; }
          ::-webkit-scrollbar-thumb { background:rgba(255,255,255,0.1); border-radius:3px; }
        </style></head><body>
          <div class="header">
            <span style="font-size:14px">📄</span>
            <div>
              <div class="header-title">${fileName}</div>
              <div class="header-path">${filePath} · ${lines.length} lines · ${ext.toUpperCase()}</div>
            </div>
          </div>
          <div style="padding:4px 0">${codeHtml}</div>
        </body></html>`;
      } catch (err: any) {
        vscode.window.showErrorMessage(`DocuVerse: Failed to load file — ${err.message}`);
      }
    })
  );

  // Explain This File (Walkthrough)
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.explainFile', async (args?: { repoId: string; filePath: string }) => {
      const { repoId, filePath } = args || await getActiveContext(client);
      if (!repoId || !filePath) { return; }

      const viewMode = vscode.workspace.getConfiguration('docuverse')
        .get<'developer' | 'manager'>('defaultViewMode') || 'developer';

      await WalkthroughPanel.show(context.extensionUri, client, repoId, filePath, viewMode);
    })
  );

  // What Breaks If I Change This? (Impact)
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.showImpact', async (args?: { repoId: string; filePath: string }) => {
      const { repoId, filePath } = args || await getActiveContext(client);
      if (!repoId || !filePath) { return; }

      await ImpactPanel.show(context.extensionUri, client, repoId, filePath);
    })
  );

  // Visualize as Diagram
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.generateDiagram', async (args?: { repoId: string; filePath: string }) => {
      const { repoId, filePath } = args || await getActiveContext(client);
      if (!repoId || !filePath) { return; }

      const diagramType = await vscode.window.showQuickPick(
        [
          { label: '$(type-hierarchy) Flowchart', description: 'Shows the logical flow of the code', value: 'flowchart' },
          { label: '$(symbol-class) Class Diagram', description: 'Shows classes and their relationships', value: 'classDiagram' },
          { label: '$(list-ordered) Sequence Diagram', description: 'Shows how components interact', value: 'sequenceDiagram' },
          { label: '$(database) ER Diagram', description: 'Shows data entity relationships', value: 'erDiagram' },
        ],
        { title: 'DocuVerse: Choose Diagram Type', placeHolder: 'What kind of diagram?' }
      );

      if (diagramType) {
        await DiagramPanel.show(context.extensionUri, client, repoId, filePath, diagramType.value as DiagramType);
      }
    })
  );

  // Generate Documentation — auto-uses the active repo from sidebar
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.generateDocs', async () => {
      if (!auth.isLoggedIn) {
        vscode.window.showWarningMessage('DocuVerse: Please sign in first.');
        return;
      }

      try {
        const repoId = hubProvider?.getSelectedRepoId();
        if (!repoId) {
          vscode.window.showWarningMessage('DocuVerse: Select a repository in the sidebar first.');
          return;
        }

        const repoFullName = hubProvider.getSelectedRepoFullName() || 'Repository';
        await DocsPanel.show(context.extensionUri, client, repoId, repoFullName);
      } catch (err: any) {
        vscode.window.showErrorMessage(`DocuVerse: ${err.message}`);
      }
    })
  );

  // Run in Sandbox
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.runSandbox', () => runSandbox(client))
  );

  // Open Signal Panel
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.openSignal', async () => {
      if (!auth.isLoggedIn) {
        vscode.window.showWarningMessage('DocuVerse: Please sign in first.');
        return;
      }
      const repoId = hubProvider?.getSelectedRepoId();
      if (!repoId) {
        vscode.window.showWarningMessage('DocuVerse: Select a repository in the sidebar first.');
        return;
      }
      const repoFullName = hubProvider.getSelectedRepoFullName() || 'Repository';
      await SignalPanel.show(context.extensionUri, client, repoId, repoFullName);
    })
  );

  // Quick Actions (unified entry point)
  context.subscriptions.push(
    vscode.commands.registerCommand('docuverse.quickAction', async () => {
      const action = await vscode.window.showQuickPick(
        [
          { label: '$(play) Explain This File', description: 'AI audio walkthrough', value: 'explain' },
          { label: '$(warning) What Breaks If I Change This?', description: 'Impact analysis', value: 'impact' },
          { label: '$(type-hierarchy) Visualize as Diagram', description: 'Generate diagram', value: 'diagram' },
          { label: '$(book) Generate Documentation', description: 'Auto-generate docs', value: 'docs' },
          { label: '$(play) Run Selection in Sandbox', description: 'Execute code safely', value: 'sandbox' },
          { label: '$(zap) Signal (Customer Voice)', description: 'View customer signal packets', value: 'signal' },
        ],
        { title: 'DocuVerse AI: Quick Actions', placeHolder: 'What would you like to do?' }
      );

      if (action) {
        const commandMap: Record<string, string> = {
          explain: 'docuverse.explainFile',
          impact: 'docuverse.showImpact',
          diagram: 'docuverse.generateDiagram',
          docs: 'docuverse.generateDocs',
          sandbox: 'docuverse.runSandbox',
          signal: 'docuverse.openSignal',
        };
        vscode.commands.executeCommand(commandMap[action.value]);
      }
    })
  );

  console.log('DocuVerse AI extension activated!');
}

/**
 * Flatten file tree into a list of file paths for the picker
 */
function flattenFileTree(nodes: FileNode[], prefix: string = ''): { label: string; path: string; language: string | null }[] {
  const result: { label: string; path: string; language: string | null }[] = [];
  for (const node of nodes) {
    const fullPath = prefix ? `${prefix}/${node.name}` : node.name;
    if (node.is_directory) {
      result.push(...flattenFileTree(node.children || [], fullPath));
    } else {
      // Determine icon based on language/extension
      let icon = '$(file)';
      const ext = node.name.split('.').pop()?.toLowerCase();
      if (['py'].includes(ext || '')) { icon = '$(symbol-method)'; }
      else if (['ts', 'tsx', 'js', 'jsx'].includes(ext || '')) { icon = '$(symbol-field)'; }
      else if (['java', 'go', 'rs', 'cpp', 'c'].includes(ext || '')) { icon = '$(symbol-class)'; }
      else if (['md', 'txt'].includes(ext || '')) { icon = '$(markdown)'; }
      else if (['json', 'yaml', 'yml', 'toml'].includes(ext || '')) { icon = '$(settings-gear)'; }

      result.push({
        label: `${icon} ${fullPath}`,
        path: fullPath,
        language: node.language,
      });
    }
  }
  return result;
}

/**
 * Resolves the active repo + file.
 * Shows a file picker with the repo's actual files — user just clicks to select.
 */
async function getActiveContext(client: DocuVerseClient): Promise<{ repoId: string | null; filePath: string | null }> {
  const auth = AuthManager.getInstance();
  if (!auth.isLoggedIn) {
    vscode.window.showWarningMessage('DocuVerse: Please sign in first.');
    return { repoId: null, filePath: null };
  }

  try {
    // Get repo from hub view selection
    const repoId = hubProvider?.getSelectedRepoId() || null;
    if (!repoId) {
      vscode.window.showWarningMessage('DocuVerse: Select a repository in the sidebar first.');
      return { repoId: null, filePath: null };
    }

    // Fetch the file tree from the API and show a searchable picker
    const fileTree = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'DocuVerse: Loading files...' },
      () => client.getFileTree(repoId)
    );

    const files = flattenFileTree(fileTree);
    if (files.length === 0) {
      vscode.window.showWarningMessage('DocuVerse: No files found in this repository.');
      return { repoId: null, filePath: null };
    }

    const picked = await vscode.window.showQuickPick(
      files.map(f => ({
        label: f.label,
        description: f.language || '',
        filePath: f.path,
      })),
      {
        title: 'DocuVerse: Select a File',
        placeHolder: 'Search files...',
        matchOnDescription: true,
      }
    );

    if (!picked) { return { repoId: null, filePath: null }; }
    return { repoId, filePath: picked.filePath };
  } catch (err: any) {
    vscode.window.showErrorMessage(`DocuVerse: ${err.message}`);
    return { repoId: null, filePath: null };
  }
}

export function deactivate() {
  console.log('DocuVerse AI extension deactivated.');
}
