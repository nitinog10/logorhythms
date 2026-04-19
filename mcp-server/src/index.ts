#!/usr/bin/env node

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config();

const API_BASE_URL = process.env.DOCUVERSE_API_URL || "https://xpbgkuukxp.ap-south-1.awsapprunner.com/api";
const JWT_TOKEN = process.env.DOCUVERSE_JWT_TOKEN;

if (!JWT_TOKEN) {
    console.error("Error: DOCUVERSE_JWT_TOKEN environment variable is required.");
    process.exit(1);
}

const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        Authorization: `Bearer ${JWT_TOKEN}`,
    },
});

const server = new Server(
    {
        name: "docuverse-mcp",
        version: "1.0.0",
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
        tools: [
            /* --- AUTHENTICATION --- */
            {
                name: "get_current_user",
                description: "Get the profile of the currently authenticated DocuVerse user.",
                inputSchema: { type: "object", properties: {}, required: [] },
            },

            /* --- REPOSITORIES --- */
            {
                name: "search_github_repos",
                description: "List the authenticated user's GitHub repositories that can be connected to DocuVerse.",
                inputSchema: { type: "object", properties: {}, required: [] },
            },
            {
                name: "connect_repository",
                description: "Connect a new GitHub repository to DocuVerse for indexing and analysis.",
                inputSchema: {
                    type: "object",
                    properties: {
                        full_name: { type: "string", description: "The full name of the repository (e.g., 'username/repo')" },
                    },
                    required: ["full_name"],
                },
            },
            {
                name: "list_repositories",
                description: "List all DocuVerse connected repositories with their IDs and indexing status.",
                inputSchema: { type: "object", properties: {}, required: [] },
            },
            {
                name: "get_repository_details",
                description: "Get the specific repository details. Gives you the git clone URL to pull into the user workspace.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "get_repository_status",
                description: "Poll the clone/index status of a repository (e.g., 'cloning', 'indexing', 'ready').",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "trigger_repository_index",
                description: "Trigger Tree-sitter parsing and DynamoDB indexing for a repository explicitly.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "delete_repository",
                description: "Remove a repository and all its associated data from DocuVerse.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },

            /* --- FILE ANALYSIS --- */
            {
                name: "get_file_tree",
                description: "Get the file tree and codebase structure for a connected repository.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID in DocuVerse" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "get_file_content",
                description: "Get the raw content of a specific file from the repository.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        path: { type: "string", description: "The file path within the repo" },
                    },
                    required: ["repo_id", "path"],
                },
            },
            {
                name: "get_file_ast",
                description: "Get Tree-sitter AST nodes (functions, classes, scopes) for a specific file.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        path: { type: "string", description: "The file path within the repo" },
                    },
                    required: ["repo_id", "path"],
                },
            },
            {
                name: "analyze_file_impact",
                description: "Analyze the impact of modifying a file, returning dependency risk score, dependents, and cycle detection.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        path: { type: "string", description: "The file path to analyze" },
                        symbol: { type: "string", description: "Optional specific symbol (e.g., function name) to analyze impact" },
                    },
                    required: ["repo_id", "path"],
                },
            },
            {
                name: "analyze_codebase_impact",
                description: "Get a comprehensive codebase impact report showing hotspots, circular dependencies, and general risk level.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "get_full_dependency_graph",
                description: "Get the full repository dependency graph nodes and edges.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },

            /* --- WALKTHROUGHS (AUTO-CAST) --- */
            {
                name: "generate_walkthrough",
                description: "Generate an AI-narrated code walkthrough for a file and get the playback URL for the end-user.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        file_path: { type: "string", description: "The file path to generate a walkthrough for" },
                        view_mode: { type: "string", description: "Mode: 'developer' or 'manager'" },
                    },
                    required: ["repo_id", "file_path", "view_mode"],
                },
            },
            {
                name: "get_walkthroughs_for_file",
                description: "Get a list of all existing walkthroughs that were generated for a specific file path.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        file_path: { type: "string", description: "The file path" },
                    },
                    required: ["repo_id", "file_path"],
                },
            },
            {
                name: "delete_walkthrough",
                description: "Delete a specific walkthrough and its generated audio files from DocuVerse.",
                inputSchema: {
                    type: "object",
                    properties: {
                        walkthrough_id: { type: "string", description: "The specific walkthrough ID to delete" },
                    },
                    required: ["walkthrough_id"],
                },
            },

            /* --- DOCUMENTATION & DIAGRAMS --- */
            {
                name: "generate_repository_documentation",
                description: "Trigger generation of full MNC-standard repository documentation. Runs in background.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "get_repository_documentation",
                description: "Poll or retrieve the repository-level documentation (returns 202 if generating, 200 with docs if ready).",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "generate_file_documentation",
                description: "Generate MNC-level on-demand docs for a single file.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        path: { type: "string", description: "The file path" },
                    },
                    required: ["repo_id", "path"],
                },
            },
            {
                name: "generate_diagram",
                description: "Generate a Mermaid.js diagram (Flowchart, Class, Sequence, etc.) for a specific file via Bedrock AI.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        file_path: { type: "string", description: "The file path" },
                        diagram_type: { type: "string", description: "The diagram type (e.g. 'flowchart', 'class', 'sequence')" },
                    },
                    required: ["repo_id", "file_path", "diagram_type"],
                },
            },

            /* --- SANDBOX --- */
            {
                name: "sandbox_execute",
                description: "Execute Python or JS code directly in the isolated DocuVerse browser sandbox.",
                inputSchema: {
                    type: "object",
                    properties: {
                        code: { type: "string", description: "The code to execute" },
                        language: { type: "string", description: "Code language (python, javascript)" },
                        variables: { type: "object", description: "Any state or variables to inject" },
                    },
                    required: ["code", "language"],
                },
            },

            /* --- GITHUB AUTOMATION --- */
            {
                name: "github_push_readme",
                description: "Push the generated repository documentation directly to the repository's README.md.",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "GitHub owner" },
                        repo: { type: "string", description: "GitHub repo name" },
                        content: { type: "string", description: "The README content to push" },
                        branch: { type: "string", description: "Branch (default: main)" },
                        message: { type: "string", description: "Commit message" },
                    },
                    required: ["owner", "repo", "content"],
                },
            },
            {
                name: "github_create_issue",
                description: "Turn risk scores, affected files, and refactor suggestions into a structured GitHub Issue.",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "GitHub owner" },
                        repo: { type: "string", description: "GitHub repo name" },
                        title: { type: "string", description: "Issue title" },
                        body: { type: "string", description: "Issue body (markdown allowed)" },
                        labels: { type: "array", items: { type: "string" }, description: "List of labels" },
                    },
                    required: ["owner", "repo", "title", "body"],
                },
            },
            {
                name: "github_implement_fix",
                description: "Trigger a codebase-wide AI-based auto-fix that branches, generates PRs, auto-merges, and fixes issues.",
                inputSchema: {
                    type: "object",
                    properties: {
                        owner: { type: "string", description: "The GitHub owner (user or organization)" },
                        repo: { type: "string", description: "The GitHub repository name" },
                        issue_number: { type: "number", description: "The GitHub issue number to fix" },
                        instruction: { type: "string", description: "Instructions for the AI to fix" },
                    },
                    required: ["owner", "repo", "issue_number", "instruction"],
                },
            },

            /* --- SIGNAL (Customer Voice-to-Code) --- */
            {
                name: "import_customer_signal",
                description: "Import a customer support ticket and generate a Signal Packet with AI code mapping, classification, and fix recommendations.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        title: { type: "string", description: "The customer ticket title" },
                        body: { type: "string", description: "The customer ticket body/description" },
                        customer_segment: { type: "string", description: "Optional customer segment (e.g. 'enterprise', 'free')" },
                    },
                    required: ["repo_id", "title", "body"],
                },
            },
            {
                name: "list_signal_packets",
                description: "List all Signal Packets for a repository. Each packet contains issue classification, code matches, fix plan, and customer response draft.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                    },
                    required: ["repo_id"],
                },
            },
            {
                name: "get_signal_packet",
                description: "Get a single Signal Packet by ID with full details including code matches, fix summary, and customer response draft.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        packet_id: { type: "string", description: "The Signal Packet ID" },
                    },
                    required: ["repo_id", "packet_id"],
                },
            },
            {
                name: "create_issue_from_signal",
                description: "Create a GitHub issue from a Signal Packet with structured issue body including root cause, fix plan, and affected files.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        packet_id: { type: "string", description: "The Signal Packet ID" },
                        owner: { type: "string", description: "GitHub repo owner" },
                        repo: { type: "string", description: "GitHub repo name" },
                    },
                    required: ["repo_id", "packet_id", "owner", "repo"],
                },
            },
            {
                name: "get_signal_resolution_draft",
                description: "Get the customer-safe response draft from a Signal Packet, ready to send to the customer.",
                inputSchema: {
                    type: "object",
                    properties: {
                        repo_id: { type: "string", description: "The repository ID" },
                        packet_id: { type: "string", description: "The Signal Packet ID" },
                    },
                    required: ["repo_id", "packet_id"],
                },
            }
        ],
    };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    try {
        switch (name) {
            /* --- AUTHENTICATION --- */
            case "get_current_user": {
                const res = await apiClient.get(`/auth/me`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- REPOSITORIES --- */
            case "search_github_repos": {
                const res = await apiClient.get(`/repositories/github`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "connect_repository": {
                if (!args.full_name) throw new Error("Missing 'full_name'");
                const res = await apiClient.post(`/repositories/connect`, { full_name: args.full_name });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "list_repositories": {
                const res = await apiClient.get(`/repositories/`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_repository_details": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/repositories/${args.repo_id}`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_repository_status": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/repositories/${args.repo_id}/status`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "trigger_repository_index": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.post(`/repositories/${args.repo_id}/index`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "delete_repository": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.delete(`/repositories/${args.repo_id}`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- FILE ANALYSIS --- */
            case "get_file_tree": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/files/${args.repo_id}/tree`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_file_content": {
                if (!args.repo_id || !args.path) throw new Error("Missing 'repo_id' or 'path'");
                const res = await apiClient.get(`/files/${args.repo_id}/content`, { params: { path: args.path } });
                return { content: [{ type: "text", text: res.data }] };
            }
            case "get_file_ast": {
                if (!args.repo_id || !args.path) throw new Error("Missing 'repo_id' or 'path'");
                const res = await apiClient.get(`/files/${args.repo_id}/ast`, { params: { path: args.path } });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "analyze_file_impact": {
                if (!args.repo_id || !args.path) throw new Error("Missing 'repo_id' or 'path'");
                const res = await apiClient.get(`/files/${args.repo_id}/impact`, {
                    params: { path: args.path, ...(args.symbol ? { symbol: args.symbol } : {}) }
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "analyze_codebase_impact": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/files/${args.repo_id}/impact/codebase`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_full_dependency_graph": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/files/${args.repo_id}/dependencies`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- WALKTHROUGHS (AUTO-CAST) --- */
            case "generate_walkthrough": {
                if (!args.repo_id || !args.file_path || !args.view_mode) throw new Error("Missing inputs");
                const res = await apiClient.post(`/walkthroughs/generate`, {
                    repository_id: args.repo_id,
                    file_path: args.file_path,
                    view_mode: args.view_mode,
                });
                const playbackUrl = `https://logorhythms.in/repository/${args.repo_id}/walkthrough?file=${encodeURIComponent(String(args.file_path))}`;
                const outputMsg = `Walkthrough generation initiated successfully. You can watch the full audio-synced cinematic walkthrough on Logorhythms here:\n\n${playbackUrl}\n\nWalkthrough ID: ${res.data.id}`;

                return {
                    content: [{ type: "text", text: outputMsg }]
                };
            }
            case "get_walkthroughs_for_file": {
                if (!args.repo_id || !args.file_path) throw new Error("Missing inputs");
                const res = await apiClient.get(`/walkthroughs/file/${args.repo_id}`, { params: { file_path: args.file_path } });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "delete_walkthrough": {
                if (!args.walkthrough_id) throw new Error("Missing 'walkthrough_id'");
                const res = await apiClient.delete(`/walkthroughs/${args.walkthrough_id}`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- DOCUMENTATION & DIAGRAMS --- */
            case "generate_repository_documentation": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.post(`/documentation/${args.repo_id}/generate`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_repository_documentation": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/documentation/${args.repo_id}`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "generate_file_documentation": {
                if (!args.repo_id || !args.path) throw new Error("Missing inputs");
                const res = await apiClient.get(`/documentation/${args.repo_id}/file`, { params: { path: args.path } });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "generate_diagram": {
                if (!args.repo_id || !args.file_path || !args.diagram_type) throw new Error("Missing inputs");
                const res = await apiClient.post(`/diagrams/generate`, {
                    repository_id: args.repo_id,
                    file_path: args.file_path,
                    diagram_type: args.diagram_type,
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- SANDBOX --- */
            case "sandbox_execute": {
                if (!args.code || !args.language) throw new Error("Missing inputs");
                const res = await apiClient.post(`/sandbox/execute`, {
                    code: args.code,
                    language: args.language,
                    variables: args.variables || {},
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- GITHUB AUTOMATION --- */
            case "github_push_readme": {
                if (!args.owner || !args.repo || !args.content) throw new Error("Missing inputs");
                const res = await apiClient.post(`/github/push-readme`, {
                    owner: args.owner,
                    repo: args.repo,
                    content: args.content,
                    branch: args.branch || "main",
                    message: args.message || "docs: automate README generation via DocuVerse AI"
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "github_create_issue": {
                if (!args.owner || !args.repo || !args.title || !args.body) throw new Error("Missing inputs");
                const res = await apiClient.post(`/github/create-issue`, {
                    owner: args.owner,
                    repo: args.repo,
                    title: args.title,
                    body: args.body,
                    labels: args.labels || ["impact-analysis", "ai-generated"]
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "github_implement_fix": {
                if (!args.owner || !args.repo || !args.issue_number || !args.instruction) throw new Error("Missing inputs");
                const res = await apiClient.post(`/github/implement-fix`, {
                    owner: args.owner,
                    repo: args.repo,
                    issue_number: args.issue_number,
                    instruction: args.instruction,
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }

            /* --- SIGNAL (Customer Voice-to-Code) --- */
            case "import_customer_signal": {
                if (!args.repo_id || !args.title || !args.body) throw new Error("Missing 'repo_id', 'title', or 'body'");
                const res = await apiClient.post(`/signal/import`, {
                    repo_id: args.repo_id,
                    title: args.title,
                    body: args.body,
                    source: "manual",
                    customer_segment: args.customer_segment || null,
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "list_signal_packets": {
                if (!args.repo_id) throw new Error("Missing 'repo_id'");
                const res = await apiClient.get(`/signal/${args.repo_id}/packets`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_signal_packet": {
                if (!args.repo_id || !args.packet_id) throw new Error("Missing 'repo_id' or 'packet_id'");
                const res = await apiClient.get(`/signal/${args.repo_id}/packets/${args.packet_id}`);
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "create_issue_from_signal": {
                if (!args.repo_id || !args.packet_id || !args.owner || !args.repo) throw new Error("Missing inputs");
                const res = await apiClient.post(`/signal/${args.repo_id}/packets/${args.packet_id}/create-issue`, {
                    owner: args.owner,
                    repo: args.repo,
                    additional_labels: [],
                });
                return { content: [{ type: "text", text: JSON.stringify(res.data, null, 2) }] };
            }
            case "get_signal_resolution_draft": {
                if (!args.repo_id || !args.packet_id) throw new Error("Missing 'repo_id' or 'packet_id'");
                const res = await apiClient.get(`/signal/${args.repo_id}/packets/${args.packet_id}`);
                const packet = res.data;
                const draft = {
                    customer_response_draft: packet.customer_response_draft || "No draft available.",
                    issue_type: packet.issue_type,
                    business_urgency: packet.business_urgency,
                    fix_summary: packet.fix_summary,
                };
                return { content: [{ type: "text", text: JSON.stringify(draft, null, 2) }] };
            }

            default:
                throw new Error(`Unknown tool: ${name}`);
        }
    } catch (error: any) {
        const errorMsg = error.response?.data?.detail || error.message || String(error);
        return {
            content: [{ type: "text", text: `Error executing ${name}: ${errorMsg}` }],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("DocuVerse MCP server successfully running on stdio");
}

main().catch((error) => {
    console.error("Fatal error starting server:", error);
    process.exit(1);
});
