import chalk from 'chalk';
import { marked } from 'marked';
import TerminalRenderer from 'marked-terminal';
import stripAnsi from 'strip-ansi';

// Configure marked for terminal output
marked.setOptions({
  // @ts-ignore
  renderer: new TerminalRenderer({
    code: chalk.cyan,
    blockquote: chalk.gray.italic,
    html: chalk.gray,
    heading: chalk.bold.blue,
    firstHeading: chalk.bold.magenta,
    hr: chalk.reset,
    listitem: chalk.reset,
    list: chalk.reset,
    table: chalk.reset,
    paragraph: chalk.reset,
    strong: chalk.bold,
    em: chalk.italic,
    codespan: chalk.yellow,
    del: chalk.dim.strikethrough,
    link: chalk.blue.underline,
    href: chalk.blue.underline,
  }),
});

export class UI {
  static readonly MASCOT = `
    ╔═══════════════════════════════════════╗
    ║                                       ║
    ║     🦙  Open Claude Code  🦙          ║
    ║                                       ║
    ║     Your Local AI Coding Buddy        ║
    ║                                       ║
    ╚═══════════════════════════════════════╝
  `;

  static showWelcome(model: string, ollamaURL: string, cwd: string): void {
    console.clear();
    console.log(chalk.cyan(this.MASCOT));
    console.log();
    console.log(chalk.gray('━'.repeat(60)));
    console.log(chalk.bold('  Configuration'));
    console.log(chalk.gray('━'.repeat(60)));
    console.log(chalk.blue('  Model:     '), chalk.white(model));
    console.log(chalk.blue('  Ollama:    '), chalk.white(ollamaURL));
    console.log(chalk.blue('  Directory: '), chalk.white(cwd));
    console.log(chalk.gray('━'.repeat(60)));
    console.log();
  }

  static showHelp(): void {
    console.log(chalk.gray('  Commands:'));
    console.log(chalk.yellow('    /clear              '), chalk.gray('- Clear conversation history'));
    console.log(chalk.yellow('    /model              '), chalk.gray('- Switch between Ollama models'));
    console.log(chalk.yellow('    /stats              '), chalk.gray('- Show conversation statistics'));
    console.log(chalk.yellow('    /save <name>        '), chalk.gray('- Save conversation'));
    console.log(chalk.yellow('    /load <name>        '), chalk.gray('- Load saved conversation'));
    console.log(chalk.yellow('    /list               '), chalk.gray('- List saved conversations'));
    console.log(chalk.yellow('    /export [format]    '), chalk.gray('- Export conversation (markdown/pdf)'));
    console.log(chalk.yellow('    /plugins            '), chalk.gray('- List loaded plugins'));
    console.log(chalk.yellow('    /help               '), chalk.gray('- Show this help message'));
    console.log(chalk.yellow('    /exit               '), chalk.gray('- Exit the program'));
    console.log();
  }

  static showConnectionStatus(isConnected: boolean): void {
    if (isConnected) {
      console.log(chalk.green('  ✓ Connected to Ollama'));
      console.log();
      this.showHelp();
    } else {
      console.log(chalk.red('  ✗ Cannot connect to Ollama'));
      console.log(chalk.yellow('  Please ensure Ollama is running'));
      console.log();
    }
  }

  static formatUserMessage(message: string): void {
    const border = chalk.gray('─'.repeat(60));
    console.log(border);
    console.log(chalk.bold.blue('You'));
    console.log(chalk.white(message));
    console.log(border);
    console.log();
  }

  static formatAssistantMessage(message: string): void {
    console.log(chalk.bold.green('🦙 Assistant'));
    console.log();

    try {
      // Try to parse as markdown
      const rendered = marked.parse(message) as string;
      console.log(rendered);
    } catch {
      // Fallback to plain text
      console.log(chalk.white(message));
    }

    console.log();
  }

  static showToolUse(toolName: string, status: 'start' | 'success' | 'error'): void {
    const icons = {
      start: '⚙️ ',
      success: '✓',
      error: '✗',
    };

    const colors = {
      start: chalk.blue,
      success: chalk.green,
      error: chalk.red,
    };

    const messages = {
      start: `Using ${toolName}`,
      success: `${toolName} completed`,
      error: `${toolName} failed`,
    };

    console.log(colors[status](`  ${icons[status]} ${messages[status]}`));
  }

  static showStats(messageCount: number, toolUseCount: number, estimatedTokens: number, tokenLimit?: number): void {
    console.log(chalk.gray('━'.repeat(60)));
    console.log(chalk.bold('  Conversation Statistics'));
    console.log(chalk.gray('━'.repeat(60)));
    console.log(chalk.blue('  Messages:       '), chalk.white(messageCount));
    console.log(chalk.blue('  Tool uses:      '), chalk.white(toolUseCount));
    console.log(chalk.blue('  Est. tokens:    '), chalk.white(estimatedTokens));
    if (tokenLimit) {
      const percentage = ((estimatedTokens / tokenLimit) * 100).toFixed(1);
      const color = estimatedTokens > tokenLimit * 0.9 ? chalk.red : estimatedTokens > tokenLimit * 0.7 ? chalk.yellow : chalk.green;
      console.log(chalk.blue('  Token limit:    '), color(`${estimatedTokens}/${tokenLimit} (${percentage}%)`));
    }
    console.log(chalk.gray('━'.repeat(60)));
    console.log();
  }

  static showError(error: string): void {
    console.log(chalk.red('  ✗ Error: ') + chalk.white(error));
    console.log();
  }

  static showSuccess(message: string): void {
    console.log(chalk.green('  ✓ ') + chalk.white(message));
    console.log();
  }

  static showWarning(message: string): void {
    console.log(chalk.yellow('  ⚠ ') + chalk.white(message));
    console.log();
  }

  static showThinking(): void {
    console.log(chalk.gray('  💭 Thinking...'));
  }

  static clearThinking(): void {
    process.stdout.write('\r\x1b[K'); // Clear the line
  }

  static drawBox(title: string, content: string[]): void {
    const maxWidth = Math.max(
      title.length,
      ...content.map(line => stripAnsi(line).length)
    );
    const width = Math.min(maxWidth + 4, 70);

    console.log(chalk.gray('╔' + '═'.repeat(width) + '╗'));
    console.log(chalk.gray('║ ') + chalk.bold(title) + ' '.repeat(width - title.length - 1) + chalk.gray('║'));
    console.log(chalk.gray('╠' + '═'.repeat(width) + '╣'));

    content.forEach(line => {
      const stripped = stripAnsi(line);
      const padding = width - stripped.length - 1;
      console.log(chalk.gray('║ ') + line + ' '.repeat(Math.max(0, padding)) + chalk.gray('║'));
    });

    console.log(chalk.gray('╚' + '═'.repeat(width) + '╝'));
    console.log();
  }

  static showGoodbye(): void {
    console.log();
    console.log(chalk.cyan('    ╔════════════════════════════╗'));
    console.log(chalk.cyan('    ║  Thanks for coding with    ║'));
    console.log(chalk.cyan('    ║  🦙 Open Claude Code 🦙    ║'));
    console.log(chalk.cyan('    ║  Happy coding! 👋          ║'));
    console.log(chalk.cyan('    ╚════════════════════════════╝'));
    console.log();
  }
}
