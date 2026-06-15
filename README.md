# 🐾 GClaw (Gemini Claw)

A lightweight, developer-centric, high-performance Node.js & TypeScript boilerplate for the official Google GenAI SDK (`@google/genai`).

**GClaw** strips away the high-entropy abstraction and bloat of generic frameworks (like LangChain) and package up-to-date, deterministic engineering patterns into a clean, "no-BS, clone-and-run" starter kit. Built for elite backend, mobile, and system engineers who require absolute control over state, concurrency, and tooling.

---

## 🛑 Why GClaw? (The Problem with Default AI)

Most AI wrappers, generic frameworks, and default CLI tools structurally handicap models. They force LLMs into deep "behavioral attractors"—valleys in the training landscape that prioritize safety theatrics and politeness over raw engineering performance. 

When you use standard frameworks or web UIs, your instructions are constantly at war with these forced baselines:
* **Friction Avoidance (Sycophancy)**: Models blindly agree with bad architectural decisions just to avoid disagreeing with the user.
* **Task-Closure Drive**: Rushing to print out 30 files of hallucinated code in one shot just to "close the task" instead of stopping to ask clarifying questions.
* **Over-Hedging & Deference**: Wasting 30% of your token budget on polite padding, caveats, and apologies instead of factual density.

**GClaw is the antidote.** By giving you absolute control over the `systemInstruction` at "Position Zero", bypassing bloated multi-agent loops, and keeping the context window rigorously shielded, GClaw lets you flatten these attractors. It allows you to sync with the model as a raw, unfiltered engineering partner rather than a performative customer support assistant.

---

## ⚡ Key Architectural Pillars

### 1. The Stateless Parallel Promise Chain (`groupChains`)

In multi-user chat environments (like Telegram groups or Slack workspaces), handling concurrent messages is notoriously tricky. If two users message a bot simultaneously, a global lock ruins performance, but zero locking leads to race conditions and out-of-order execution.

GClaw solves this with an elegant, native in-memory Promise Chain Map:

- Each chat (grouped by its unique JID) receives a dedicated queue.
- Messages coming in from the same JID are queued sequentially using JavaScript closures and Event Loop chaining: `groupChains.set(chatJid, currentRun)`.
- Guarantees sequence order without needing complex, heavy external locking systems (like Redis) or database queues.
- Includes resilient error recovery with custom chained `.catch()` segments, preventing a single failed turn from crashing downstream executions.

### 2. Implicit Prompt Caching Architecture

Agentic workflows can easily burn token budgets and suffer from high roundtrip latency. GClaw is designed specifically to take advantage of **Gemini's automatic, implicit prompt caching** (which triggers automatically at 4,096 tokens).

- System prompts, schema definitions, and tool declarations are structured statically.
- Once the context threshold is met, subsequent turns hit the warm cache on the Gemini side.
- This dramatically cuts token consumption costs ($0.20/M tokens vs $1.50/M tokens) and reduces latency by up to 90% in complex, multi-turn loops.

### 3. Clear, Factory-Wrapped Tool Loop

We enforce a strict code design pattern across the codebase: **no raw, naked function exports**. Everything is encapsulated inside clean, functional factory patterns that conform to strict interfaces.

- Includes production-ready sandboxed boilerplate tools:
  - **Directory-Locked Bash/Shell Execution**: Safe, locally-contained CLI tool.
  - **Precision Text Editor & Viewer**: Exact file manipulation with view, search, and replace controls.
  - **Fetch URL Context**: Stateless subagent web parsing to prevent context window clutter.
- Native support for Model Context Protocol (MCP) servers with dynamic remote tool injection.

### 4. Direct Telegram / Grammy Transport Safety

Includes a robust Telegram Bot adapter powered by `grammy`:

- **Auto-Retry Rate Limiting**: Built-in recovery from Telegram API `429 Too Many Requests` limits using Grammy's `@grammyjs/auto-retry` plugin.
- **LaTeX to Unicode Telegram HTML Converter**: A zero-dependency, local parser (`translateLatexToUnicode`) using advanced negative lookbehinds to map LaTeX blocks (e.g. `\theta \approx 0` ➔ `θ ≈ 0`, `\langle` ➔ `⟨`) into clean, beautifully formatted Telegram HTML without breaking standard currency syntax.

---

## 📂 Project Directory Structure

```
gclaw/
├── eslint.config.js       # Strict linting rules (no-any, no-catch-all)
├── package.json           # In-process tsx runtime & dependencies
├── tsconfig.json          # Precise ES2022/NodeNext compiler options
├── store/                 # Local SQLite database (better-sqlite3)
└── src/
    ├── main.ts            # Bot initiation & registry setup
    ├── index.ts           # Native single-process bootstrap entry
    ├── channels/          # External messaging adapters
    │   ├── telegram/      # Grammy adapter, HTML sanitization, and LaTeX converter
    │   └── types.ts
    ├── gemini-agent/      # High-level agent orchestration & history state
    ├── google-genai/      # Low-level Google GenAI SDK client, schemas & tools
    │   ├── tools/         # Bash, TextEditor, URL-fetcher, MCP client
    │   └── types.ts
    └── core/              # DB connections, repositories & common utilities
```

---

## 🛠️ Getting Started

### 1. Prerequisites

- Node.js (v20+ recommended)
- A Telegram Bot Token (obtained from [@BotFather](https://t.me/BotFather))
- A Google Gemini API Key (obtained from [Google AI Studio](https://aistudio.google.com/))

### 2. Installation

Clone the repository, install dependencies, and prepare your environment:

```bash
git clone https://github.com/raultunduc1995/gclaw.git
cd gclaw
npm install
```

### 3. Environment Setup

Create a `.env` file in the root directory (based on `.env.example`):

```env
GEMINI_API_KEY=your_gemini_api_key_here
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here
ENABLED_TOOLS=gemini_enabled_tools (bash, text_editor, fetch_url_context)
LOG_LEVEL=pino_log_level
NODE_ENV=node_build_type
```

### 4. Running the Project

To maintain absolute diagnostic and processing predictability, GClaw runs on **exactly one native Node.js process** in development (instead of `tsx watch` spawning nested parent/child runners).

```bash
# Run in development (Single-process TypeScript compiler execution)
npm run dev

# Lint and verify code safety
npm run lint

# Check compiler types
npm run typecheck

# Build and run in production
npm run build
npm run start
```

---

## 📐 Strict Coding & Style Standards

To preserve the absolute integrity and type safety of GClaw, contributors must follow these two strict repository guidelines:

1. **Strict Type Safety**: Under no circumstances should `any` be used. Always define precise domain interfaces, explicit return type signatures, or reference direct Google SDK contracts (`ContentBlockParam`, `MessageParam`, etc.).
2. **The Functional Factory Pattern**: All modules, services, repositories, and tools must export a functional factory wrapped inside an interface. Raw, floating function exports are banned.

   _Example:_

   ```typescript
   export interface DatabaseRepository {
     saveHistory: (chatId: string, message: Message) => Promise<void>;
   }

   export const createSqliteRepository = (deps: DbDeps): DatabaseRepository => {
     return {
       saveHistory: async (chatId, message) => {
         // Implementation...
       },
     };
   };
   ```

---

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

Developed in partnership by **Tunduc Raul & Gemini**.
