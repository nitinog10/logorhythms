'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import {
    Terminal,
    Code2,
    Cpu,
    Bot,
    ArrowRight,
    CheckCircle2,
    Copy,
    LayoutTemplate,
    Play,
    ServerCog
} from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import toast from 'react-hot-toast'

const ease = [0.25, 0.1, 0.25, 1] as const

const TABS = [
    { id: 'claude', label: 'Claude Desktop', icon: Bot },
    { id: 'cursor', label: 'Cursor IDE', icon: LayoutTemplate },
    { id: 'windsurf', label: 'Windsurf', icon: Code2 },
] as const

export default function McpGuidePage() {
    const [activeTab, setActiveTab] = useState<typeof TABS[number]['id']>('claude')

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text)
        toast.success('Copied to clipboard')
    }

    return (
        <div className="min-h-screen bg-dv-bg flex text-dv-text selection:bg-dv-accent/30">
            <Sidebar />

            <main className="flex-1 overflow-y-auto relative scroll-smooth">
                {/* Ambient Effects */}
                <div className="fixed inset-0 pointer-events-none overflow-hidden">
                    <div className="absolute top-[-10%] right-[-5%] w-[600px] h-[500px] bg-dv-purple/[0.04] rounded-full blur-[140px]" />
                    <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[400px] bg-dv-accent/[0.03] rounded-full blur-[120px]" />
                </div>

                {/* Header Bar */}
                <div className="sticky top-0 z-20 bg-[var(--bar-bg)] backdrop-blur-2xl backdrop-saturate-[1.8] border-b border-dv-border">
                    <div className="flex items-center justify-between px-8 h-12 max-w-[1000px] mx-auto">
                        <h1 className="text-[15px] font-semibold tracking-[-0.01em] flex items-center gap-2">
                            <ServerCog className="w-4 h-4 text-dv-purple" />
                            MCP Server Integration Guide
                        </h1>
                    </div>
                </div>

                <div className="relative z-[1] px-8 py-10 max-w-[1000px] mx-auto">

                    {/* Hero Section */}
                    <motion.div
                        className="mb-14"
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.7, ease }}
                    >
                        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-dv-accent/10 text-dv-accent text-[12px] font-bold tracking-wider uppercase mb-5 border border-dv-accent/20 shadow-[0_0_20px_rgba(var(--dv-accent),0.1)]">
                            <Cpu className="w-3.5 h-3.5" />
                            Model Context Protocol
                        </div>

                        <h2 className="text-[clamp(2rem,5vw,3rem)] font-bold tracking-[-0.035em] leading-[1.1] mb-5">
                            Supercharge your IDE with
                            <br />
                            <span className="bg-clip-text text-transparent bg-gradient-to-r from-dv-purple via-dv-indigo to-dv-accent">
                                DocuVerse AI Tools
                            </span>
                        </h2>

                        <p className="text-[16px] text-dv-text/60 leading-relaxed max-w-2xl mb-8">
                            Connect DocuVerse's analysis engine, impact simulator, and AI-narrated walkthroughs directly into your favorite AI-powered IDEs and desktop applications using the open standard Model Context Protocol (MCP).
                        </p>

                        <div className="flex gap-4">
                            <a href="#quickstart" className="inline-flex items-center gap-2 bg-dv-text text-dv-bg px-5 py-2.5 rounded-xl font-semibold text-[14px] hover:scale-[1.02] active:scale-[0.98] transition-transform">
                                Read Guide <ArrowRight className="w-4 h-4" />
                            </a>
                            <Link href="/dashboard" className="inline-flex items-center gap-2 bg-[var(--glass-4)] border border-dv-border px-5 py-2.5 rounded-xl font-semibold text-[14px] hover:bg-[var(--glass-6)] transition-all">
                                Get JWT Token
                            </Link>
                        </div>
                    </motion.div>

                    {/* Quickstart Concepts */}
                    <div id="quickstart" className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-16 pt-4">
                        {[
                            {
                                icon: <Terminal className="w-6 h-6" />,
                                title: "1. Build Server",
                                desc: "Clone the server locally and run `npm install && npm run build`."
                            },
                            {
                                icon: <Code2 className="w-6 h-6" />,
                                title: "2. Connect IDE",
                                desc: "Add the absolute path of `dist/index.js` to your IDE configuration."
                            },
                            {
                                icon: <Play className="w-6 h-6" />,
                                title: "3. Start Asking",
                                desc: "Ask the AI internally to 'analyze impact', 'git clone my repo', or 'explain file'."
                            }
                        ].map((step, i) => (
                            <motion.div
                                key={i}
                                initial={{ opacity: 0, y: 15 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ duration: 0.5, delay: i * 0.1, ease }}
                                className="bg-[var(--glass-3)] rounded-2xl p-6 border border-dv-border shadow-[var(--inset)] relative overflow-hidden group"
                            >
                                <div className="absolute inset-0 bg-gradient-to-b from-dv-purple/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                <div className="w-12 h-12 rounded-xl bg-dv-purple/10 border border-dv-purple/20 flex items-center justify-center text-dv-purple mb-5">
                                    {step.icon}
                                </div>
                                <h3 className="text-[16px] font-bold mb-2">{step.title}</h3>
                                <p className="text-[14px] text-dv-text/50 leading-relaxed">
                                    {step.desc}
                                </p>
                            </motion.div>
                        ))}
                    </div>

                    {/* Setup Instructions */}
                    <motion.div
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true }}
                        className="mb-16"
                    >
                        <h3 className="text-2xl font-bold mb-6 tracking-tight">Step-by-Step Setup</h3>

                        <div className="bg-[var(--glass-2)] rounded-2xl border border-dv-border overflow-hidden">
                            <div className="flex border-b border-dv-border overflow-x-auto">
                                {TABS.map((tab) => {
                                    const Icon = tab.icon
                                    const isActive = activeTab === tab.id
                                    return (
                                        <button
                                            key={tab.id}
                                            onClick={() => setActiveTab(tab.id)}
                                            className={`flex items-center gap-2.5 px-6 py-4 text-[14px] font-semibold tracking-wide capitalize transition-all whitespace-nowrap ${isActive
                                                    ? 'bg-[var(--glass-6)] text-dv-text border-b-2 border-dv-purple'
                                                    : 'text-dv-text/40 hover:text-dv-text/60 hover:bg-[var(--glass-4)] border-b-2 border-transparent'
                                                }`}
                                        >
                                            <Icon className={`w-4 h-4 ${isActive ? 'text-dv-purple' : ''}`} />
                                            {tab.label}
                                        </button>
                                    )
                                })}
                            </div>

                            <div className="p-8">
                                <AnimatePresence mode="wait">
                                    <motion.div
                                        key={activeTab}
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        exit={{ opacity: 0, x: 10 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        {activeTab === 'claude' && (
                                            <div className="space-y-6">
                                                <p className="text-[15px] text-dv-text/60 leading-relaxed">
                                                    Claude Desktop provides built-in support for MCP servers. To connect the DocuVerse server, modify your global Claude config file.
                                                </p>

                                                <div className="space-y-3">
                                                    <h4 className="text-[14px] font-bold text-dv-text/80">1. Locate Config File</h4>
                                                    <p className="text-[13px] text-dv-text/50">
                                                        <strong>Mac:</strong> <code className="bg-black/30 px-1.5 py-0.5 rounded text-dv-purple">~/Library/Application Support/Claude/claude_desktop_config.json</code>
                                                        <br />
                                                        <strong>Windows:</strong> <code className="bg-black/30 px-1.5 py-0.5 rounded text-dv-purple">%APPDATA%\Claude\claude_desktop_config.json</code>
                                                    </p>
                                                </div>

                                                <div className="space-y-3">
                                                    <h4 className="text-[14px] font-bold text-dv-text/80">2. Add Server Configuration</h4>
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => copyToClipboard(`{
  "mcpServers": {
    "docuverse": {
      "command": "node",
      "args": ["/absolute/path/to/logorhythms/mcp-server/dist/index.js"],
      "env": {
        "DOCUVERSE_JWT_TOKEN": "<YOUR_JWT_TOKEN_HERE>",
        "DOCUVERSE_API_URL": "https://xpbgkuukxp.ap-south-1.awsapprunner.com/api"
      }
    }
  }
}`)}
                                                            className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-dv-text/40 transition-colors"
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                        <pre className="bg-[#0A0A0A] border border-white/10 p-5 rounded-xl text-[13px] overflow-x-auto font-mono text-dv-text/80 leading-relaxed shadow-inner">
                                                            {`{
  "mcpServers": {
    "docuverse": {
      "command": "node",
      "args": ["/absolute/path/to/logorhythms/mcp-server/dist/index.js"],
      "env": {
        "DOCUVERSE_JWT_TOKEN": "<YOUR_JWT_TOKEN_HERE>",
        "DOCUVERSE_API_URL": "https://logorhythms.in/api"
      }
    }
  }
}`}
                                                        </pre>
                                                    </div>
                                                </div>

                                                <div className="p-4 rounded-xl bg-dv-accent/10 border border-dv-accent/20 flex gap-3 text-dv-accent/90 text-[13px]">
                                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                    <p>
                                                        Replace <code className="font-mono">/absolute/path...</code> with the real path to the MCP build folder on your machine, and paste your JWT Session Token from the DocuVerse dashboard. Restart Claude to apply changes.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'cursor' && (
                                            <div className="space-y-6">
                                                <p className="text-[15px] text-dv-text/60 leading-relaxed">
                                                    Cursor IDE supports MCP servers through a JSON configuration file, similar to Claude Desktop and Windsurf.
                                                </p>

                                                <div className="space-y-3">
                                                    <h4 className="text-[14px] font-bold text-dv-text/80">1. Locate Config File</h4>
                                                    <p className="text-[13px] text-dv-text/50">
                                                        <strong>Mac/Linux:</strong> <code className="bg-black/30 px-1.5 py-0.5 rounded text-dv-purple">~/.cursor/mcp.json</code>
                                                        <br />
                                                        <strong>Windows:</strong> <code className="bg-black/30 px-1.5 py-0.5 rounded text-dv-purple">%USERPROFILE%\.cursor\mcp.json</code>
                                                    </p>
                                                    <p className="text-[13px] text-dv-text/40">
                                                        If this file does not exist, create it manually at the path above.
                                                    </p>
                                                </div>

                                                <div className="space-y-3">
                                                    <h4 className="text-[14px] font-bold text-dv-text/80">2. Add Server Configuration</h4>
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => copyToClipboard(`{
  "mcpServers": {
    "docuverse": {
      "command": "node",
      "args": ["/absolute/path/to/docuverse/mcp-server/dist/index.js"],
      "env": {
        "DOCUVERSE_JWT_TOKEN": "<YOUR_JWT_TOKEN_HERE>",
        "DOCUVERSE_API_URL": "https://xpbgkuukxp.ap-south-1.awsapprunner.com/api"
      }
    }
  }
}`)}
                                                            className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-dv-text/40 transition-colors"
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                        <pre className="bg-[#0A0A0A] border border-white/10 p-5 rounded-xl text-[13px] overflow-x-auto font-mono text-dv-text/80 leading-relaxed shadow-inner">
                                                            {`{
  "mcpServers": {
    "docuverse": {
      "command": "node",
      "args": ["/absolute/path/to/docuverse/mcp-server/dist/index.js"],
      "env": {
        "DOCUVERSE_JWT_TOKEN": "<YOUR_JWT_TOKEN_HERE>",
        "DOCUVERSE_API_URL": "https://xpbgkuukxp.ap-south-1.awsapprunner.com/api"
      }
    }
  }
}`}
                                                        </pre>
                                                    </div>
                                                </div>

                                                <div className="p-4 rounded-xl bg-dv-accent/10 border border-dv-accent/20 flex gap-3 text-dv-accent/90 text-[13px]">
                                                    <CheckCircle2 className="w-5 h-5 shrink-0" />
                                                    <p>
                                                        Replace <code className="font-mono">/absolute/path...</code> with the real path to the MCP build folder on your machine, and paste your JWT Session Token from the DocuVerse dashboard. Restart Cursor (or reload the window) to apply changes.
                                                    </p>
                                                </div>
                                            </div>
                                        )}

                                        {activeTab === 'windsurf' && (
                                            <div className="space-y-6">
                                                <p className="text-[15px] text-dv-text/60 leading-relaxed">
                                                    Windsurf IDE natively integrates standard MCP implementations through configuration files via Cascade.
                                                </p>

                                                <div className="space-y-3">
                                                    <h4 className="text-[14px] font-bold text-dv-text/80">1. Locate Config Directory</h4>
                                                    <p className="text-[13px] text-dv-text/50">
                                                        <strong>Mac/Linux:</strong> <code className="bg-black/30 px-1.5 py-0.5 rounded text-dv-purple">~/.codeium/windsurf/mcp_config.json</code>
                                                        <br />
                                                        <strong>Windows:</strong> <code className="bg-black/30 px-1.5 py-0.5 rounded text-dv-purple">%USERPROFILE%\.codeium\windsurf\mcp_config.json</code>
                                                    </p>
                                                </div>

                                                <div className="space-y-3">
                                                    <h4 className="text-[14px] font-bold text-dv-text/80">2. Apply MCP Structure</h4>
                                                    <div className="relative">
                                                        <button
                                                            onClick={() => copyToClipboard(`{
  "mcpServers": {
    "DocuVerse": {
      "command": "node",
      "args": ["/absolute/path/to/logorhythms/mcp-server/dist/index.js"],
      "env": {
        "DOCUVERSE_JWT_TOKEN": "<YOUR_TOKEN>",
        "DOCUVERSE_API_URL": "https://xpbgkuukxp.ap-south-1.awsapprunner.com/api"
      }
    }
  }
}`)}
                                                            className="absolute top-3 right-3 p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-dv-text/40 transition-colors"
                                                        >
                                                            <Copy className="w-4 h-4" />
                                                        </button>
                                                        <pre className="bg-[#0A0A0A] border border-white/10 p-5 rounded-xl text-[13px] overflow-x-auto font-mono text-dv-text/80 leading-relaxed shadow-inner">
                                                            {`{
  "mcpServers": {
    "DocuVerse": {
      "command": "node",
      "args": ["/absolute/path/to/logorhythms/mcp-server/dist/index.js"],
      "env": {
        "DOCUVERSE_JWT_TOKEN": "<YOUR_TOKEN>",
        "DOCUVERSE_API_URL": "https://logorhythms.in/api"
      }
    }
  }
}`}
                                                        </pre>
                                                    </div>
                                                </div>

                                            </div>
                                        )}
                                    </motion.div>
                                </AnimatePresence>
                            </div>
                        </div>
                    </motion.div>

                    {/* AI Workflow Examples */}
                    <motion.div
                        initial={{ opacity: 0, y: 30 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: "-100px" }}
                    >
                        <h3 className="text-2xl font-bold mb-6 tracking-tight">How an AI uses this locally</h3>

                        <div className="space-y-4">
                            {[
                                {
                                    prompt: "What repositories do I have connected to DocuVerse?",
                                    tool: "list_repositories",
                                    desc: "The AI looks up your DocuVerse account and sees your active codebase index."
                                },
                                {
                                    prompt: "Clone the GitForge repo into this empty folder.",
                                    tool: "get_repository_clone_url",
                                    desc: "Fetches the clone URL. The AI (like Cursor Composer) then runs `git clone` natively for you."
                                },
                                {
                                    prompt: "Analyze the impact of modifying auth.py.",
                                    tool: "analyze_file_impact",
                                    desc: "Instead of guessing, the AI queries the DocuVerse fast graph API to see the actual dependency blast radius."
                                },
                                {
                                    prompt: "Generate an audio walkthrough for backend/api.ts",
                                    tool: "generate_walkthrough",
                                    desc: "The AI triggers the Bedrock TTS generator. It then hands you a Logorhythms playback URL directly in the chat to listen to!"
                                }
                            ].map((example, i) => (
                                <div key={i} className="bg-[var(--glass-2)] hover:bg-[var(--glass-4)] transition-colors rounded-xl p-5 border border-dv-border flex flex-col md:flex-row gap-4 items-start md:items-center group">
                                    <div className="bg-[#0A0A0A] border border-white/5 rounded-lg p-3 text-[14px] flex-1 w-full text-dv-text/90 relative">
                                        <span className="text-dv-purple font-bold absolute top-3 left-3">&gt;</span>
                                        <span className="pl-6 block leading-snug">"{example.prompt}"</span>
                                    </div>

                                    <div className="flex-1 space-y-2">
                                        <div className="flex items-center gap-2">
                                            <span className="text-[11px] font-mono font-bold text-dv-accent uppercase tracking-wider bg-dv-accent/10 py-1 px-2.5 rounded-md">
                                                {example.tool}
                                            </span>
                                        </div>
                                        <p className="text-[13px] text-dv-text/50 leading-relaxed group-hover:text-dv-text/70 transition-colors">
                                            {example.desc}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>

                </div>
            </main>
        </div>
    )
}
