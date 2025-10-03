# Open Claude Code (OCC)

A local AI coding assistant powered by Ollama - similar to Claude Code but running entirely on your machine.

## Features

- 🦙 **Local AI Assistant**: Uses Ollama models running on your computer
- 🛠️ **Built-in Tools**: File operations, bash commands, code editing, and more
- 💬 **Interactive Chat**: Beautiful terminal UI with streaming responses
- 🎨 **Rich Formatting**: Markdown rendering with syntax highlighting
- 📊 **Stats Tracking**: Monitor your conversation and tool usage
- 🔧 **Configurable**: Choose your preferred Ollama model
- 🚀 **Fast & Private**: All processing happens locally
- ⚡ **Streaming**: Real-time response streaming for better UX

## Prerequisites

1. **Node.js** (v16 or higher)
2. **Ollama** installed and running
   - Install from: https://ollama.ai
   - Pull a model: `ollama pull llama2` (or codellama, mistral, etc.)

## Installation

```bash
# Clone or navigate to the project directory
cd open-claude-code

# Install dependencies
npm install

# Build the project
npm run build

# Optional: Link globally to use 'occ' command anywhere
npm link
```

## Usage

### Start a Chat Session

```bash
npm start
# or if globally linked:
occ
```

You'll be greeted by the 🦙 llama mascot and a beautiful terminal interface!

### Available Commands

#### Within the chat:
- `/help` - Show help message with all commands
- `/clear` - Clear conversation history
- `/model` - Switch between Ollama models (interactive picker)
- `/stats` - Show conversation statistics
- `/exit` or `/quit` - Exit the program

#### CLI commands:
- `occ` or `occ chat` - Start interactive chat (default)
- `occ models` - List available Ollama models
- `occ set-model <model>` - Set default model (e.g., `occ set-model qwen2.5-coder:14b`)
- `occ set-url <url>` - Set Ollama server URL (default: http://localhost:11434)
- `occ config` - Show current configuration

### Available Tools

The assistant can use these tools to help you:

- **read_file** - Read file contents
- **write_file** - Create or overwrite files
- **edit_file** - Edit files by replacing text
- **list_files** - List files in a directory
- **execute_command** - Run bash commands
- **glob** - Find files matching a pattern
- **grep** - Search for text in files

## Recommended Models

For coding tasks, these Ollama models work great:
- `qwen2.5-coder:14b` - Excellent for coding (recommended)
- `codellama:13b` - Optimized for code generation
- `deepseek-coder:6.7b` - Fast and capable
- `llama3.1:8b` - Good general-purpose model

## Example Usage

```
You: Can you read the package.json file and tell me what dependencies we have?

🦙 Assistant: Let me check that for you.
⚙️  Using read_file
✓ read_file completed

Based on the package.json file, here are the dependencies:
- axios: For making HTTP requests to Ollama
- chalk: For terminal colors and formatting
- commander: For CLI argument parsing
...

You: /stats

Conversation Statistics
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Messages:   4
Tool uses:  1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You: /model
? Select a model: (Use arrow keys)
❯ qwen2.5-coder:14b (current)
  codellama:13b
  llama3.1:8b
  deepseek-coder:6.7b

✓ Switched to model: codellama:13b
```

## Key Improvements Over Basic Ollama Chat

1. **🎨 Beautiful UI**: Enhanced terminal interface with colors, boxes, and formatting
2. **⚡ Streaming**: Real-time response streaming as the model generates
3. **🛠️ Tool Use**: Assistant can actually read/write files and execute commands
4. **📊 Stats**: Track your conversation and see how many tools were used
5. **💾 Memory**: Maintains conversation context across multiple exchanges
6. **🎯 Smart Tool Detection**: Automatically detects when to use tools
7. **🦙 Personality**: Fun llama mascot and friendly interface

## Future Enhancement Ideas

Want to contribute? Here are some ideas for improvements:

### High Priority
- [ ] Add support for vision models (analyze images/screenshots)
- [ ] Implement conversation save/load functionality
- [ ] Add support for custom system prompts
- [ ] Multi-file context (workspace awareness)
- [ ] Git integration (commit, branch, status)
- [ ] Code analysis and linting integration

### Medium Priority
- [ ] Plugin system for custom tools
- [ ] Export conversations to markdown/PDF
- [ ] Web search integration (local Searxng/etc)
- [ ] RAG support (load documentation, codebases)
- [ ] Token usage tracking and limits
- [ ] Interactive code execution with confirmation

### Nice to Have
- [ ] Multiple conversation threads
- [ ] Keyboard shortcuts for common commands
- [ ] Auto-suggestions based on context
- [ ] Integration with VS Code / other IDEs
- [ ] Voice input/output support
- [ ] Collaborative sessions (multi-user)

## Architecture

```
src/
├── index.ts       # Main CLI entry point with commands
├── assistant.ts   # Core assistant logic & tool orchestration
├── ollama.ts      # Ollama API client (chat & streaming)
├── tools.ts       # File operations & bash commands
├── config.ts      # Configuration management
└── ui.ts          # Terminal UI formatting & display
```

## Contributing

This is a community project! Contributions welcome:
1. Fork the repository
2. Create a feature branch
3. Make your improvements
4. Test thoroughly with various Ollama models
5. Submit a pull request

## License

MIT - Feel free to use, modify, and distribute!

## Acknowledgments

- Inspired by [Claude Code](https://claude.com/claude-code) by Anthropic
- Powered by [Ollama](https://ollama.ai) for local LLM inference
- Built with ❤️ for the open-source community