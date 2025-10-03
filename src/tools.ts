import * as fs from 'fs';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ToolResult {
  success: boolean;
  output?: string;
  error?: string;
}

export class ToolSystem {
  private workingDirectory: string;

  constructor(workingDirectory: string = process.cwd()) {
    this.workingDirectory = workingDirectory;
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

export function getAvailableTools(toolSystem: ToolSystem): Tool[] {
  return [
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
  ];
}
