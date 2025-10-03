import { OllamaClient, OllamaMessage } from './ollama';
import { ToolSystem, getAvailableTools, Tool } from './tools';
import { UI } from './ui';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface AssistantConfig {
  model: string;
  ollamaBaseURL?: string;
  workingDirectory?: string;
  streaming?: boolean;
  customSystemPrompt?: string;
  tokenLimit?: number;
  requireConfirmation?: boolean;
}

export class Assistant {
  private ollama: OllamaClient;
  private toolSystem: ToolSystem;
  private conversationHistory: OllamaMessage[];
  private tools: Tool[];
  private systemPrompt: string;
  private toolUseCount: number = 0;
  private streaming: boolean;
  private customSystemPrompt?: string;
  private tokenLimit?: number;
  private requireConfirmation: boolean;
  private estimatedTokens: number = 0;

  private constructor(config: AssistantConfig) {
    this.ollama = new OllamaClient({
      baseURL: config.ollamaBaseURL,
      model: config.model,
    });

    this.toolSystem = new ToolSystem(config.workingDirectory);
    this.tools = []; // Will be loaded async
    this.conversationHistory = [];
    this.streaming = config.streaming ?? true;
    this.customSystemPrompt = config.customSystemPrompt;
    this.tokenLimit = config.tokenLimit;
    this.requireConfirmation = config.requireConfirmation ?? false;

    this.systemPrompt = '';
  }

  static async create(config: AssistantConfig): Promise<Assistant> {
    const assistant = new Assistant(config);
    assistant.tools = await getAvailableTools(assistant.toolSystem);
    assistant.systemPrompt = assistant.buildSystemPrompt();
    assistant.conversationHistory.push({
      role: 'system',
      content: assistant.systemPrompt,
    });
    return assistant;
  }

  private buildSystemPrompt(): string {
    const toolDescriptions = this.tools
      .map((tool) => {
        const params = Object.entries(tool.parameters)
          .map(([key, value]) => `  - ${key}: ${value}`)
          .join('\n');
        return `### ${tool.name}\n${tool.description}\nParameters:\n${params}`;
      })
      .join('\n\n');

    const basePrompt = this.customSystemPrompt || `You are a helpful coding assistant running locally via Ollama. You help users with software development tasks directly from their terminal.`;

    return `${basePrompt}

You have access to the following tools to help users:

${toolDescriptions}

When you need to use a tool, format your response like this:
<tool_use>
<tool_name>tool_name_here</tool_name>
<parameters>
{
  "param1": "value1",
  "param2": "value2"
}
</parameters>
</tool_use>

You can use multiple tools in sequence if needed. After using tools, provide a natural language response to the user explaining what you did.

Be concise and helpful. Focus on solving the user's problem efficiently.

Current working directory: ${this.toolSystem.getWorkingDirectory()}
`;
  }

  async chat(
    userMessage: string,
    confirmationCallback?: (message: string) => Promise<boolean>
  ): Promise<string> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

    this.updateTokenCount();

    if (!this.checkTokenLimit()) {
      return `⚠️  Token limit reached (${this.estimatedTokens}/${this.tokenLimit}). Consider clearing history with /clear or increasing the limit.`;
    }

    let response = '';
    let maxIterations = 5; // Prevent infinite loops
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;

      let aiResponse = '';

      if (this.streaming) {
        // Stream the response
        process.stdout.write('\n');
        for await (const chunk of this.ollama.chatStream(this.conversationHistory)) {
          aiResponse += chunk;
          process.stdout.write(chunk);
        }
        process.stdout.write('\n\n');
      } else {
        // Non-streaming
        UI.showThinking();
        aiResponse = await this.ollama.chat(this.conversationHistory);
        UI.clearThinking();
      }

      this.conversationHistory.push({
        role: 'assistant',
        content: aiResponse,
      });

      // Check if AI wants to use tools
      const toolUses = this.extractToolUses(aiResponse);

      if (toolUses.length === 0) {
        // No tools to use, return the response
        response = this.cleanResponse(aiResponse);
        break;
      }

      // Execute tools
      console.log(); // Space before tools
      const toolResults: string[] = [];
      for (const toolUse of toolUses) {
        const result = await this.executeTool(toolUse, confirmationCallback);
        toolResults.push(result);
      }
      console.log(); // Space after tools

      // Add tool results to conversation
      const toolResultMessage = toolResults.join('\n\n');
      this.conversationHistory.push({
        role: 'user',
        content: `Tool results:\n${toolResultMessage}`,
      });

      // Continue the loop to get AI's next response
    }

    return response;
  }

  private extractToolUses(text: string): Array<{ name: string; parameters: any }> {
    const toolUses: Array<{ name: string; parameters: any }> = [];
    const toolUseRegex = /<tool_use>([\s\S]*?)<\/tool_use>/g;
    let match;

    while ((match = toolUseRegex.exec(text)) !== null) {
      const toolContent = match[1];
      const nameMatch = /<tool_name>(.*?)<\/tool_name>/.exec(toolContent);
      const paramsMatch = /<parameters>([\s\S]*?)<\/parameters>/.exec(toolContent);

      if (nameMatch && paramsMatch) {
        try {
          const parameters = JSON.parse(paramsMatch[1].trim());
          toolUses.push({
            name: nameMatch[1].trim(),
            parameters,
          });
        } catch (error) {
          // Silently skip invalid tool parameter JSON
        }
      }
    }

    return toolUses;
  }

  async executeTool(
    toolUse: {
      name: string;
      parameters: any;
    },
    confirmationCallback?: (message: string) => Promise<boolean>
  ): Promise<string> {
    const tool = this.tools.find((t) => t.name === toolUse.name);

    if (!tool) {
      UI.showToolUse(toolUse.name, 'error');
      return `Error: Tool '${toolUse.name}' not found`;
    }

    // Check if confirmation is needed
    if (this.isDangerousCommand(toolUse.name, toolUse.parameters)) {
      const message = this.getToolConfirmationMessage(toolUse.name, toolUse.parameters);

      if (confirmationCallback) {
        const confirmed = await confirmationCallback(message);
        if (!confirmed) {
          UI.showToolUse(tool.name, 'error');
          return `Tool '${toolUse.name}' execution cancelled by user`;
        }
      }
    }

    UI.showToolUse(tool.name, 'start');
    this.toolUseCount++;

    try {
      const result = await tool.execute(toolUse.parameters);

      if (result.success) {
        UI.showToolUse(tool.name, 'success');
        return `Tool '${toolUse.name}' executed successfully:\n${result.output}`;
      } else {
        UI.showToolUse(tool.name, 'error');
        return `Tool '${toolUse.name}' failed:\n${result.error}`;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      UI.showToolUse(tool.name, 'error');
      return `Tool '${toolUse.name}' error: ${errorMsg}`;
    }
  }

  private cleanResponse(text: string): string {
    // Remove tool use blocks from the final response
    return text.replace(/<tool_use>[\s\S]*?<\/tool_use>/g, '').trim();
  }

  clearHistory(): void {
    this.conversationHistory = [
      {
        role: 'system',
        content: this.systemPrompt,
      },
    ];
    this.toolUseCount = 0;
    this.estimatedTokens = 0;
  }

  isDangerousCommand(toolName: string, params: any): boolean {
    if (!this.requireConfirmation) return false;

    const dangerousTools = ['execute_command', 'write_file', 'edit_file', 'git_commit'];

    if (!dangerousTools.includes(toolName)) return false;

    // Check for potentially dangerous patterns
    if (toolName === 'execute_command') {
      const cmd = params.command || '';
      const dangerousPatterns = [
        /rm\s+-rf/,
        /sudo/,
        /chmod/,
        /chown/,
        /dd\s+/,
        /mkfs/,
        /format/,
        />.*\/dev\//,
        /curl.*\|.*sh/,
        /wget.*\|.*sh/,
      ];

      return dangerousPatterns.some(pattern => pattern.test(cmd));
    }

    return true;
  }

  getToolConfirmationMessage(toolName: string, params: any): string {
    if (toolName === 'execute_command') {
      return `Execute command: ${params.command}`;
    } else if (toolName === 'write_file') {
      return `Write file: ${params.file_path}`;
    } else if (toolName === 'edit_file') {
      return `Edit file: ${params.file_path}`;
    } else if (toolName === 'git_commit') {
      return `Git commit with message: ${params.message}`;
    }
    return `Execute tool: ${toolName}`;
  }

  getHistory(): OllamaMessage[] {
    return [...this.conversationHistory];
  }

  getStats(): { messageCount: number; toolUseCount: number; estimatedTokens: number; tokenLimit?: number } {
    // Subtract system message
    const messageCount = this.conversationHistory.filter(m => m.role !== 'system').length;
    return {
      messageCount,
      toolUseCount: this.toolUseCount,
      estimatedTokens: this.estimatedTokens,
      tokenLimit: this.tokenLimit,
    };
  }

  private estimateTokens(text: string): number {
    // Simple estimation: ~4 characters per token (rough average for English)
    return Math.ceil(text.length / 4);
  }

  private updateTokenCount(): void {
    this.estimatedTokens = this.conversationHistory.reduce(
      (sum, msg) => sum + this.estimateTokens(msg.content),
      0
    );
  }

  private checkTokenLimit(): boolean {
    if (!this.tokenLimit) return true;
    return this.estimatedTokens < this.tokenLimit;
  }

  getRequireConfirmation(): boolean {
    return this.requireConfirmation;
  }

  async saveConversation(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const conversationsDir = path.join(os.homedir(), '.occ-conversations');

      // Create directory if it doesn't exist
      if (!fs.existsSync(conversationsDir)) {
        await fs.promises.mkdir(conversationsDir, { recursive: true });
      }

      const filename = `${name}.json`;
      const filePath = path.join(conversationsDir, filename);

      const saveData = {
        timestamp: new Date().toISOString(),
        history: this.conversationHistory,
        toolUseCount: this.toolUseCount,
      };

      await fs.promises.writeFile(filePath, JSON.stringify(saveData, null, 2));

      return {
        success: true,
        message: `Conversation saved to ${filePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to save conversation',
      };
    }
  }

  async loadConversation(name: string): Promise<{ success: boolean; message: string }> {
    try {
      const conversationsDir = path.join(os.homedir(), '.occ-conversations');
      const filename = `${name}.json`;
      const filePath = path.join(conversationsDir, filename);

      if (!fs.existsSync(filePath)) {
        return {
          success: false,
          message: `Conversation '${name}' not found`,
        };
      }

      const data = await fs.promises.readFile(filePath, 'utf-8');
      const saveData = JSON.parse(data);

      this.conversationHistory = saveData.history;
      this.toolUseCount = saveData.toolUseCount || 0;

      return {
        success: true,
        message: `Conversation '${name}' loaded (saved: ${saveData.timestamp})`,
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to load conversation',
      };
    }
  }

  async listConversations(): Promise<string[]> {
    try {
      const conversationsDir = path.join(os.homedir(), '.occ-conversations');

      if (!fs.existsSync(conversationsDir)) {
        return [];
      }

      const files = await fs.promises.readdir(conversationsDir);
      return files
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    } catch (error) {
      return [];
    }
  }

  async exportConversation(
    filename: string,
    format: 'markdown' | 'pdf' = 'markdown'
  ): Promise<{ success: boolean; message: string }> {
    try {
      const exportsDir = path.join(os.homedir(), '.occ-exports');

      if (!fs.existsSync(exportsDir)) {
        await fs.promises.mkdir(exportsDir, { recursive: true });
      }

      if (format === 'markdown') {
        return await this.exportToMarkdown(exportsDir, filename);
      } else if (format === 'pdf') {
        return await this.exportToPDF(exportsDir, filename);
      }

      return {
        success: false,
        message: 'Unsupported format. Use "markdown" or "pdf"',
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Export failed',
      };
    }
  }

  private async exportToMarkdown(
    dir: string,
    filename: string
  ): Promise<{ success: boolean; message: string }> {
    const filePath = path.join(dir, `${filename}.md`);
    let markdown = `# Conversation Export\n\n`;
    markdown += `**Exported:** ${new Date().toISOString()}\n\n`;
    markdown += `**Messages:** ${this.conversationHistory.filter(m => m.role !== 'system').length}\n`;
    markdown += `**Tool Uses:** ${this.toolUseCount}\n\n`;
    markdown += `---\n\n`;

    for (const msg of this.conversationHistory) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      markdown += `## ${role}\n\n`;
      markdown += `${msg.content}\n\n`;
      markdown += `---\n\n`;
    }

    await fs.promises.writeFile(filePath, markdown, 'utf-8');

    return {
      success: true,
      message: `Conversation exported to ${filePath}`,
    };
  }

  private async exportToPDF(
    dir: string,
    filename: string
  ): Promise<{ success: boolean; message: string }> {
    // For PDF, we'll create an HTML file and suggest using a converter
    // A full PDF implementation would require additional dependencies
    const htmlPath = path.join(dir, `${filename}.html`);

    let html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Conversation Export</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
    }
    .metadata {
      background: #f5f5f5;
      padding: 15px;
      border-radius: 5px;
      margin-bottom: 30px;
    }
    .message {
      margin-bottom: 30px;
      padding: 15px;
      border-left: 4px solid #ddd;
    }
    .user {
      border-left-color: #4CAF50;
    }
    .assistant {
      border-left-color: #2196F3;
    }
    .role {
      font-weight: bold;
      margin-bottom: 10px;
    }
    pre {
      background: #f5f5f5;
      padding: 10px;
      border-radius: 3px;
      overflow-x: auto;
    }
  </style>
</head>
<body>
  <h1>Conversation Export</h1>
  <div class="metadata">
    <p><strong>Exported:</strong> ${new Date().toISOString()}</p>
    <p><strong>Messages:</strong> ${this.conversationHistory.filter(m => m.role !== 'system').length}</p>
    <p><strong>Tool Uses:</strong> ${this.toolUseCount}</p>
  </div>
`;

    for (const msg of this.conversationHistory) {
      if (msg.role === 'system') continue;

      const role = msg.role === 'user' ? '👤 User' : '🤖 Assistant';
      const cssClass = msg.role;

      html += `  <div class="message ${cssClass}">
    <div class="role">${role}</div>
    <div>${this.escapeHtml(msg.content).replace(/\n/g, '<br>')}</div>
  </div>\n`;
    }

    html += `</body>
</html>`;

    await fs.promises.writeFile(htmlPath, html, 'utf-8');

    return {
      success: true,
      message: `Conversation exported to ${htmlPath} (HTML format - use browser "Print to PDF" for PDF)`,
    };
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
