'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronRight,
  ChevronDown,
  Folder,
  FolderOpen,
  FileCode,
  File,
  Search,
} from 'lucide-react'
import { clsx } from 'clsx'

interface FileNode {
  id: string
  path: string
  name: string
  isDirectory: boolean
  language?: string
  children?: FileNode[]
}

interface FileExplorerProps {
  files: FileNode[]
  selectedFile: string
  onSelectFile: (path: string) => void
}

const languageIcons: Record<string, string> = {
  python: '🐍',
  javascript: '📜',
  typescript: '💎',
  java: '☕',
  go: '🔵',
  rust: '🦀',
}

// Extensions that are NOT eligible for walkthroughs (config/doc/asset files)
const NON_CODE_EXTENSIONS = new Set([
  '.md', '.txt', '.rst', '.json', '.yaml', '.yml', '.toml', '.cfg',
  '.ini', '.csv', '.xml', '.env', '.gitignore', '.editorconfig',
  '.lock', '.svg', '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.eot', '.map', '.log',
])
const NON_CODE_FILENAMES = new Set([
  'readme.md', 'license', 'license.md', 'license.txt',
  'changelog.md', 'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  '.prettierrc', '.eslintrc', 'tsconfig.json', 'jsconfig.json',
  'dockerfile', 'makefile', 'procfile', '.dockerignore', '.gitattributes',
])

export function isCodeFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (NON_CODE_FILENAMES.has(lower)) return false
  const ext = lower.slice(lower.lastIndexOf('.'))
  if (NON_CODE_EXTENSIONS.has(ext)) return false
  return true
}

export function FileExplorer({ files, selectedFile, onSelectFile }: FileExplorerProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['src', 'src_auth']))

  const toggleFolder = (id: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const filterFiles = (nodes: FileNode[], query: string): FileNode[] => {
    if (!query) return nodes

    return nodes.reduce<FileNode[]>((acc, node) => {
      if (node.isDirectory) {
        const filteredChildren = filterFiles(node.children || [], query)
        if (filteredChildren.length > 0) {
          acc.push({ ...node, children: filteredChildren })
        }
      } else if (node.name.toLowerCase().includes(query.toLowerCase())) {
        acc.push(node)
      }
      return acc
    }, [])
  }

  const filteredFiles = filterFiles(files, searchQuery)

  return (
    <div className="h-full flex flex-col">
      {/* Search */}
      <div className="p-3 border-b border-dv-border-subtle">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dv-text-muted" />
          <input
            type="text"
            placeholder="Search files..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[var(--glass-4)] border border-dv-border rounded-[10px] py-2 pl-9 pr-3
                     ios-caption1 text-dv-text placeholder:text-dv-text-muted
                     focus:outline-none focus:ring-1 focus:ring-dv-accent/30 focus:border-dv-accent/40"
          />
        </div>
      </div>

      {/* File tree */}
      <div className="flex-1 overflow-auto p-1.5">
        {filteredFiles.map((node) => (
          <FileTreeNode
            key={node.id}
            node={node}
            depth={0}
            selectedFile={selectedFile}
            expandedFolders={expandedFolders}
            onSelectFile={onSelectFile}
            onToggleFolder={toggleFolder}
          />
        ))}
      </div>
    </div>
  )
}

interface FileTreeNodeProps {
  node: FileNode
  depth: number
  selectedFile: string
  expandedFolders: Set<string>
  onSelectFile: (path: string) => void
  onToggleFolder: (id: string) => void
}

function FileTreeNode({
  node,
  depth,
  selectedFile,
  expandedFolders,
  onSelectFile,
  onToggleFolder,
}: FileTreeNodeProps) {
  const isExpanded = expandedFolders.has(node.id)
  const isSelected = selectedFile === node.path
  const paddingLeft = depth * 14 + 8

  if (node.isDirectory) {
    return (
      <div>
        <button
          onClick={() => onToggleFolder(node.id)}
          className={clsx(
            'w-full flex items-center gap-2 py-1.5 px-2 rounded-[8px] transition-all text-left active:scale-[0.98]',
            'hover:bg-[var(--glass-4)]'
          )}
          style={{ paddingLeft }}
        >
          <motion.div
            initial={false}
            animate={{ rotate: isExpanded ? 90 : 0 }}
            transition={{ duration: 0.1 }}
          >
            <ChevronRight className="w-3.5 h-3.5 text-dv-text-muted" />
          </motion.div>
          {isExpanded ? (
            <FolderOpen className="w-3.5 h-3.5 text-dv-accent" />
          ) : (
            <Folder className="w-3.5 h-3.5 text-dv-accent" />
          )}
          <span className="ios-caption1">{node.name}</span>
        </button>

        <AnimatePresence initial={false}>
          {isExpanded && node.children && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {node.children.map((child) => (
                <FileTreeNode
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  selectedFile={selectedFile}
                  expandedFolders={expandedFolders}
                  onSelectFile={onSelectFile}
                  onToggleFolder={onToggleFolder}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  return (
    <button
      onClick={() => onSelectFile(node.path)}
      className={clsx(
        'w-full flex items-center gap-2 py-1.5 px-2 rounded-[8px] transition-all text-left active:scale-[0.98]',
        isSelected ? 'bg-dv-accent/10 text-dv-accent' : 'hover:bg-[var(--glass-4)]',
        !isCodeFile(node.name) && !isSelected && 'opacity-40'
      )}
      style={{ paddingLeft: paddingLeft + 18 }}
      title={!isCodeFile(node.name) ? 'Not eligible for walkthrough' : undefined}
    >
      <span className="ios-caption1">
        {node.language && languageIcons[node.language] ? (
          languageIcons[node.language]
        ) : (
          <FileCode className="w-3.5 h-3.5 text-dv-text-muted" />
        )}
      </span>
      <span className="ios-caption1 truncate">{node.name}</span>
      {!isCodeFile(node.name) && (
        <span className="ml-auto text-[9px] text-dv-text-muted bg-[var(--glass-4)] px-1.5 py-0.5 rounded">doc</span>
      )}
    </button>
  )
}

