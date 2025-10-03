import { OllamaClient, OllamaMessage } from './ollama';
import { ToolSystem, getAvailableTools, Tool } from './tools';
import { UI } from './ui';

export interface AssistantConfig {
  model: string;
  ollamaBaseURL?: string;
  workingDirectory?: string;
  streaming?: boolean;
}

export class Assistant {
  private ollama: OllamaClient;
  private toolSystem: ToolSystem;
  private conversationHistory: OllamaMessage[];
  private tools: Tool[];
  private systemPrompt: string;
  private toolUseCount: number = 0;
  private streaming: boolean;

  constructor(config: AssistantConfig) {
    this.ollama = new OllamaClient({
      baseURL: config.ollamaBaseURL,
      model: config.model,
    });

    this.toolSystem = new ToolSystem(config.workingDirectory);
    this.tools = getAvailableTools(this.toolSystem);
    this.conversationHistory = [];
    this.streaming = config.streaming ?? true;

    this.systemPrompt = this.buildSystemPrompt();
    this.conversationHistory.push({
      role: 'system',
      content: this.systemPrompt,
    });
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

    return `You are a helpful coding assistant running locally via Ollama. You help users with software development tasks directly from their terminal.

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

  async chat(userMessage: string): Promise<string> {
    this.conversationHistory.push({
      role: 'user',
      content: userMessage,
    });

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
        const result = await this.executeTool(toolUse);
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

  private async executeTool(toolUse: {
    name: string;
    parameters: any;
  }): Promise<string> {
    const tool = this.tools.find((t) => t.name === toolUse.name);

    if (!tool) {
      UI.showToolUse(toolUse.name, 'error');
      return `Error: Tool '${toolUse.name}' not found`;
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
  }

  getHistory(): OllamaMessage[] {
    return [...this.conversationHistory];
  }

  getStats(): { messageCount: number; toolUseCount: number } {
    // Subtract system message
    const messageCount = this.conversationHistory.filter(m => m.role !== 'system').length;
    return {
      messageCount,
      toolUseCount: this.toolUseCount,
    };
  }
}
