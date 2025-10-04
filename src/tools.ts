import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { PluginManager } from './plugins';
import { SimpleRAG } from './rag';
import { chromium, Browser, Page } from 'playwright';

const execAsync = promisify(exec);

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class ToolSystem {
  private workingDirectory: string;
  private rag: SimpleRAG;
  private browser: Browser | null = null;
  private page: Page | null = null;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
    this.rag = new SimpleRAG();
  }

  async readFile(filePath: string): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, filePath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');
      const numberedContent = lines
        .map((line, idx) => `${idx + 1}\t${line}`)
        .join('\n');

      return {
        success: true,
        output: numberedContent,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async writeFile(filePath: string, content: string): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, filePath);
      const dir = path.dirname(fullPath);

      // Create directory if it doesn't exist
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      await fs.promises.writeFile(fullPath, content, 'utf-8');

      return {
        success: true,
        output: `File written successfully: ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async editFile(
    filePath: string,
    oldString: string,
    newString: string
  ): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, filePath);
      const content = await fs.promises.readFile(fullPath, 'utf-8');

      if (!content.includes(oldString)) {
        return {
          success: false,
          error: 'Old string not found in file',
        };
      }

      const newContent = content.replace(oldString, newString);
      await fs.promises.writeFile(fullPath, newContent, 'utf-8');

      return {
        success: true,
        output: `File edited successfully: ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async listFiles(directory: string = '.'): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, directory);
      const files = await fs.promises.readdir(fullPath, { withFileTypes: true });

      const output = files
        .map((file) => {
          const prefix = file.isDirectory() ? 'd' : '-';
          return `${prefix} ${file.name}`;
        })
        .join('\n');

      return {
        success: true,
        output,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async executeCommand(command: string, timeout: number = 120000): Promise<ToolResult> {
    try {
      const { stdout, stderr } = await execAsync(command, {
        cwd: this.workingDirectory,
        timeout,
        maxBuffer: 1024 * 1024 * 10, // 10MB
      });

      return {
        success: true,
        output: stdout + (stderr ? '\n' + stderr : ''),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
        output: error.stdout || error.stderr,
      };
    }
  }

  async glob(pattern: string): Promise<ToolResult> {
    try {
      const { stdout } = await execAsync(`find . -name "${pattern}"`, {
        cwd: this.workingDirectory,
      });

      return {
        success: true,
        output: stdout.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async grep(pattern: string, directory: string = '.'): Promise<ToolResult> {
    try {
      const { stdout } = await execAsync(
        `grep -r "${pattern}" ${directory} || true`,
        {
          cwd: this.workingDirectory,
        }
      );

      return {
        success: true,
        output: stdout.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async analyzeImage(imagePath: string): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, imagePath);

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: 'Image file not found',
        };
      }

      // Read image and convert to base64
      const imageBuffer = await fs.promises.readFile(fullPath);
      const base64Image = imageBuffer.toString('base64');

      return {
        success: true,
        output: base64Image,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async gitStatus(): Promise<ToolResult> {
    return this.executeCommand('git status');
  }

  async gitDiff(file?: string): Promise<ToolResult> {
    const command = file ? `git diff ${file}` : 'git diff';
    return this.executeCommand(command);
  }

  async gitCommit(message: string): Promise<ToolResult> {
    return this.executeCommand(`git commit -m "${message}"`);
  }

  async gitBranch(branchName?: string): Promise<ToolResult> {
    const command = branchName ? `git branch ${branchName}` : 'git branch';
    return this.executeCommand(command);
  }

  async gitCheckout(branch: string): Promise<ToolResult> {
    return this.executeCommand(`git checkout ${branch}`);
  }

  async gitAdd(files: string = '.'): Promise<ToolResult> {
    return this.executeCommand(`git add ${files}`);
  }

  async getWorkspaceFiles(extensions?: string[]): Promise<ToolResult> {
    try {
      let command = 'find . -type f';

      if (extensions && extensions.length > 0) {
        const extPattern = extensions.map(ext => `-name "*.${ext}"`).join(' -o ');
        command += ` \\( ${extPattern} \\)`;
      }

      command += ' | head -100'; // Limit results

      const { stdout } = await execAsync(command, {
        cwd: this.workingDirectory,
      });

      return {
        success: true,
        output: stdout.trim(),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async runLinter(files?: string): Promise<ToolResult> {
    try {
      const target = files || '.';

      // Try ESLint first
      const eslintResult = await execAsync(`npx eslint ${target} --format compact 2>&1 || true`, {
        cwd: this.workingDirectory,
      });

      if (eslintResult.stdout) {
        return {
          success: true,
          output: `ESLint results:\n${eslintResult.stdout}`,
        };
      }

      // Try TypeScript compiler check
      const tscResult = await execAsync('npx tsc --noEmit 2>&1 || true', {
        cwd: this.workingDirectory,
      });

      if (tscResult.stdout) {
        return {
          success: true,
          output: `TypeScript check:\n${tscResult.stdout}`,
        };
      }

      return {
        success: true,
        output: 'No linters found or no issues detected',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async runTests(testPattern?: string): Promise<ToolResult> {
    try {
      const pattern = testPattern || '';

      // Try common test runners
      const commands = [
        `npm test ${pattern}`,
        `npx jest ${pattern}`,
        `npx vitest run ${pattern}`,
        `npx mocha ${pattern}`,
      ];

      for (const cmd of commands) {
        try {
          const result = await execAsync(`${cmd} 2>&1`, {
            cwd: this.workingDirectory,
            timeout: 60000,
          });

          if (result.stdout || result.stderr) {
            return {
              success: true,
              output: result.stdout + (result.stderr ? '\n' + result.stderr : ''),
            };
          }
        } catch (error: any) {
          // If command exists but tests failed, return the output
          if (error.stdout || error.stderr) {
            return {
              success: true,
              output: error.stdout + (error.stderr ? '\n' + error.stderr : ''),
            };
          }
          // Otherwise continue to next test runner
        }
      }

      return {
        success: false,
        error: 'No test runner found',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async analyzeCode(filePath: string): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, filePath);

      if (!fs.existsSync(fullPath)) {
        return {
          success: false,
          error: 'File not found',
        };
      }

      const content = await fs.promises.readFile(fullPath, 'utf-8');
      const lines = content.split('\n');

      // Basic code analysis
      const analysis = {
        totalLines: lines.length,
        codeLines: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
        commentLines: lines.filter(l => l.trim().startsWith('//')).length,
        emptyLines: lines.filter(l => !l.trim()).length,
        functions: (content.match(/function\s+\w+|const\s+\w+\s*=\s*\(.*\)\s*=>/g) || []).length,
        classes: (content.match(/class\s+\w+/g) || []).length,
        imports: (content.match(/^import\s+.*from/gm) || []).length,
      };

      return {
        success: true,
        output: JSON.stringify(analysis, null, 2),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  async webSearch(query: string, engine: string = 'duckduckgo'): Promise<ToolResult> {
    try {
      // Use DuckDuckGo lite HTML version for simple searches
      const encodedQuery = encodeURIComponent(query);
      const url = `https://lite.duckduckgo.com/lite/?q=${encodedQuery}`;

      const { stdout } = await execAsync(
        `curl -s -A "Mozilla/5.0" "${url}" | grep -oP '(?<=href=")[^"]*' | head -10`,
        {
          timeout: 15000,
        }
      );

      if (!stdout.trim()) {
        return {
          success: true,
          output: `No results found for: ${query}`,
        };
      }

      const results = stdout.trim().split('\n').filter(r => r.startsWith('http'));
      const formattedResults = results.map((url, i) => `${i + 1}. ${url}`).join('\n');

      return {
        success: true,
        output: `Search results for "${query}":\n\n${formattedResults}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Web search failed',
      };
    }
  }

  async ragIndexFile(filePath: string): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, filePath);
      await this.rag.indexFile(fullPath);

      return {
        success: true,
        output: `Successfully indexed: ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to index file',
      };
    }
  }

  async ragIndexDirectory(dirPath: string): Promise<ToolResult> {
    try {
      const fullPath = path.resolve(this.workingDirectory, dirPath);
      const count = await this.rag.indexDirectory(fullPath);

      return {
        success: true,
        output: `Successfully indexed ${count} files from: ${dirPath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to index directory',
      };
    }
  }

  async ragSearch(query: string, limit: number = 5): Promise<ToolResult> {
    try {
      const results = this.rag.search(query, limit);

      if (results.length === 0) {
        return {
          success: true,
          output: `No results found for: ${query}`,
        };
      }

      const formattedResults = results.map((r, i) => {
        return `${i + 1}. [Score: ${r.score}] ${r.document.metadata.source}\n${r.document.content.substring(0, 300)}...\n`;
      }).join('\n');

      return {
        success: true,
        output: `Search results for "${query}":\n\n${formattedResults}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'RAG search failed',
      };
    }
  }

  async ragInfo(): Promise<ToolResult> {
    try {
      const count = this.rag.getDocumentCount();
      const sources = this.rag.getIndexedSources();

      return {
        success: true,
        output: `RAG Index Info:\n- Total chunks: ${count}\n- Indexed sources: ${sources.length}\n\nSources:\n${sources.join('\n')}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get RAG info',
      };
    }
  }

  async ragClear(): Promise<ToolResult> {
    try {
      this.rag.clearIndex();

      return {
        success: true,
        output: 'RAG index cleared',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to clear RAG index',
      };
    }
  }

  async browserLaunch(headless: boolean = false): Promise<ToolResult> {
    try {
      if (this.browser) {
        return {
          success: true,
          output: 'Browser already launched',
        };
      }

      this.browser = await chromium.launch({ headless });
      this.page = await this.browser.newPage();

      return {
        success: true,
        output: `Browser launched in ${headless ? 'headless' : 'headed'} mode`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to launch browser',
      };
    }
  }

  async browserNavigate(url: string): Promise<ToolResult> {
    try {
      if (!this.browser || !this.page) {
        const launchResult = await this.browserLaunch();
        if (!launchResult.success) {
          return launchResult;
        }
      }

      await this.page!.goto(url, { waitUntil: 'networkidle' });

      return {
        success: true,
        output: `Navigated to: ${url}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to navigate',
      };
    }
  }

  async browserGetContent(): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      const content = await this.page.content();

      return {
        success: true,
        output: content,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get content',
      };
    }
  }

  async browserGetText(): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      const text = await this.page.innerText('body');

      return {
        success: true,
        output: text,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get text',
      };
    }
  }

  async browserScreenshot(filePath: string): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      const fullPath = path.resolve(this.workingDirectory, filePath);
      const dir = path.dirname(fullPath);

      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }

      await this.page.screenshot({ path: fullPath, fullPage: true });

      return {
        success: true,
        output: `Screenshot saved to: ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to take screenshot',
      };
    }
  }

  async browserClick(selector: string): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      await this.page.click(selector);

      return {
        success: true,
        output: `Clicked element: ${selector}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to click element',
      };
    }
  }

  async browserType(selector: string, text: string): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      await this.page.fill(selector, text);

      return {
        success: true,
        output: `Typed text into: ${selector}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to type text',
      };
    }
  }

  async browserWaitForSelector(selector: string, timeout: number = 30000): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      await this.page.waitForSelector(selector, { timeout });

      return {
        success: true,
        output: `Element found: ${selector}`,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to find element',
      };
    }
  }

  async browserEvaluate(script: string): Promise<ToolResult> {
    try {
      if (!this.page) {
        return {
          success: false,
          error: 'Browser not launched. Use browser_launch first.',
        };
      }

      const result = await this.page.evaluate(script);

      return {
        success: true,
        output: JSON.stringify(result, null, 2),
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to evaluate script',
      };
    }
  }

  async browserClose(): Promise<ToolResult> {
    try {
      if (!this.browser) {
        return {
          success: true,
          output: 'Browser already closed',
        };
      }

      await this.browser.close();
      this.browser = null;
      this.page = null;

      return {
        success: true,
        output: 'Browser closed',
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to close browser',
      };
    }
  }

  getWorkingDirectory(): string {
    return this.workingDirectory;
  }
}

export interface Tool {
  name: string;
  description: string;
  parameters: Record<string, any>;
  execute: (args: any) => Promise<ToolResult>;
}

export async function getAvailableTools(toolSystem: ToolSystem): Promise<Tool[]> {
  const builtInTools: Tool[] = [
    {
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        file_path: 'string - path to the file to read',
      },
      execute: async (args) => toolSystem.readFile(args.file_path),
    },
    {
      name: 'write_file',
      description: 'Write content to a file',
      parameters: {
        file_path: 'string - path to the file',
        content: 'string - content to write',
      },
      execute: async (args) => toolSystem.writeFile(args.file_path, args.content),
    },
    {
      name: 'edit_file',
      description: 'Edit a file by replacing old string with new string',
      parameters: {
        file_path: 'string - path to the file',
        old_string: 'string - text to replace',
        new_string: 'string - replacement text',
      },
      execute: async (args) =>
        toolSystem.editFile(args.file_path, args.old_string, args.new_string),
    },
    {
      name: 'list_files',
      description: 'List files in a directory',
      parameters: {
        directory: 'string - directory path (optional, defaults to current)',
      },
      execute: async (args) => toolSystem.listFiles(args.directory || '.'),
    },
    {
      name: 'execute_command',
      description: 'Execute a bash command',
      parameters: {
        command: 'string - the command to execute',
        timeout: 'number - timeout in milliseconds (optional)',
      },
      execute: async (args) =>
        toolSystem.executeCommand(args.command, args.timeout),
    },
    {
      name: 'glob',
      description: 'Find files matching a pattern',
      parameters: {
        pattern: 'string - glob pattern to match',
      },
      execute: async (args) => toolSystem.glob(args.pattern),
    },
    {
      name: 'grep',
      description: 'Search for text in files',
      parameters: {
        pattern: 'string - text pattern to search',
        directory: 'string - directory to search (optional)',
      },
      execute: async (args) => toolSystem.grep(args.pattern, args.directory),
    },
    {
      name: 'analyze_image',
      description: 'Analyze an image file (requires vision-capable model like llava)',
      parameters: {
        image_path: 'string - path to the image file',
      },
      execute: async (args) => toolSystem.analyzeImage(args.image_path),
    },
    {
      name: 'git_status',
      description: 'Get git repository status',
      parameters: {},
      execute: async () => toolSystem.gitStatus(),
    },
    {
      name: 'git_diff',
      description: 'Show git diff for changes',
      parameters: {
        file: 'string - specific file to diff (optional)',
      },
      execute: async (args) => toolSystem.gitDiff(args.file),
    },
    {
      name: 'git_add',
      description: 'Stage files for git commit',
      parameters: {
        files: 'string - files to add (default: ".")',
      },
      execute: async (args) => toolSystem.gitAdd(args.files || '.'),
    },
    {
      name: 'git_commit',
      description: 'Create a git commit',
      parameters: {
        message: 'string - commit message',
      },
      execute: async (args) => toolSystem.gitCommit(args.message),
    },
    {
      name: 'git_branch',
      description: 'List or create git branches',
      parameters: {
        branch_name: 'string - name of branch to create (optional)',
      },
      execute: async (args) => toolSystem.gitBranch(args.branch_name),
    },
    {
      name: 'git_checkout',
      description: 'Switch to a git branch',
      parameters: {
        branch: 'string - branch name to checkout',
      },
      execute: async (args) => toolSystem.gitCheckout(args.branch),
    },
    {
      name: 'workspace_files',
      description: 'List all files in the workspace with optional file type filtering',
      parameters: {
        extensions: 'array of strings - file extensions to filter (e.g., ["ts", "js"])',
      },
      execute: async (args) => toolSystem.getWorkspaceFiles(args.extensions),
    },
    {
      name: 'run_linter',
      description: 'Run linters (ESLint, TypeScript) on code files',
      parameters: {
        files: 'string - files to lint (optional, defaults to all files)',
      },
      execute: async (args) => toolSystem.runLinter(args.files),
    },
    {
      name: 'run_tests',
      description: 'Run tests using available test runner (Jest, Vitest, Mocha)',
      parameters: {
        pattern: 'string - test pattern or file to run (optional)',
      },
      execute: async (args) => toolSystem.runTests(args.pattern),
    },
    {
      name: 'analyze_code',
      description: 'Analyze code file and get statistics (lines, functions, classes, etc.)',
      parameters: {
        file_path: 'string - path to the file to analyze',
      },
      execute: async (args) => toolSystem.analyzeCode(args.file_path),
    },
    {
      name: 'web_search',
      description: 'Search the web using DuckDuckGo',
      parameters: {
        query: 'string - search query',
        engine: 'string - search engine (default: duckduckgo)',
      },
      execute: async (args) => toolSystem.webSearch(args.query, args.engine),
    },
    {
      name: 'rag_index_file',
      description: 'Index a documentation file for RAG search',
      parameters: {
        file_path: 'string - path to the file to index',
      },
      execute: async (args) => toolSystem.ragIndexFile(args.file_path),
    },
    {
      name: 'rag_index_directory',
      description: 'Index all documentation files in a directory for RAG search',
      parameters: {
        dir_path: 'string - path to the directory to index',
      },
      execute: async (args) => toolSystem.ragIndexDirectory(args.dir_path),
    },
    {
      name: 'rag_search',
      description: 'Search indexed documentation using RAG',
      parameters: {
        query: 'string - search query',
        limit: 'number - maximum results (default: 5)',
      },
      execute: async (args) => toolSystem.ragSearch(args.query, args.limit || 5),
    },
    {
      name: 'rag_info',
      description: 'Get information about the RAG index',
      parameters: {},
      execute: async () => toolSystem.ragInfo(),
    },
    {
      name: 'rag_clear',
      description: 'Clear the RAG index',
      parameters: {},
      execute: async () => toolSystem.ragClear(),
    },
    {
      name: 'browser_launch',
      description: 'Launch a browser instance for automation (uses Playwright)',
      parameters: {
        headless: 'boolean - run in headless mode (default: false)',
      },
      execute: async (args) => toolSystem.browserLaunch(args.headless ?? false),
    },
    {
      name: 'browser_navigate',
      description: 'Navigate to a URL in the browser',
      parameters: {
        url: 'string - URL to navigate to',
      },
      execute: async (args) => toolSystem.browserNavigate(args.url),
    },
    {
      name: 'browser_get_content',
      description: 'Get the HTML content of the current page',
      parameters: {},
      execute: async () => toolSystem.browserGetContent(),
    },
    {
      name: 'browser_get_text',
      description: 'Get the text content of the current page',
      parameters: {},
      execute: async () => toolSystem.browserGetText(),
    },
    {
      name: 'browser_screenshot',
      description: 'Take a screenshot of the current page',
      parameters: {
        file_path: 'string - path to save the screenshot',
      },
      execute: async (args) => toolSystem.browserScreenshot(args.file_path),
    },
    {
      name: 'browser_click',
      description: 'Click an element on the page using a CSS selector',
      parameters: {
        selector: 'string - CSS selector of the element to click',
      },
      execute: async (args) => toolSystem.browserClick(args.selector),
    },
    {
      name: 'browser_type',
      description: 'Type text into an input field using a CSS selector',
      parameters: {
        selector: 'string - CSS selector of the input field',
        text: 'string - text to type',
      },
      execute: async (args) => toolSystem.browserType(args.selector, args.text),
    },
    {
      name: 'browser_wait_for_selector',
      description: 'Wait for an element to appear on the page',
      parameters: {
        selector: 'string - CSS selector to wait for',
        timeout: 'number - timeout in milliseconds (default: 30000)',
      },
      execute: async (args) => toolSystem.browserWaitForSelector(args.selector, args.timeout || 30000),
    },
    {
      name: 'browser_evaluate',
      description: 'Execute JavaScript code in the browser context',
      parameters: {
        script: 'string - JavaScript code to execute',
      },
      execute: async (args) => toolSystem.browserEvaluate(args.script),
    },
    {
      name: 'browser_close',
      description: 'Close the browser instance',
      parameters: {},
      execute: async () => toolSystem.browserClose(),
    },
  ];

  // Load plugin tools
  const pluginManager = new PluginManager();
  const pluginTools = await pluginManager.loadPlugins();

  return [...builtInTools, ...pluginTools];
}
