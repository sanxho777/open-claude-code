import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Tool, ToolResult } from './tools';

export interface PluginManifest {
  name: string;
  version: string;
  description: string;
  author?: string;
  tools: PluginTool[];
}

export interface PluginTool {
  name: string;
  description: string;
  parameters: Record<string, string>;
  handler: string; // Path to the handler file
}

export class PluginManager {
  private pluginsDir: string;
  private loadedPlugins: Map<string, PluginManifest> = new Map();

  constructor() {
    this.pluginsDir = path.join(os.homedir(), '.occ-plugins');
    this.ensurePluginsDirectory();
  }

  private ensurePluginsDirectory(): void {
    if (!fs.existsSync(this.pluginsDir)) {
      fs.mkdirSync(this.pluginsDir, { recursive: true });
      this.createExamplePlugin();
    }
  }

  private createExamplePlugin(): void {
    const exampleDir = path.join(this.pluginsDir, 'example-plugin');

    if (!fs.existsSync(exampleDir)) {
      fs.mkdirSync(exampleDir, { recursive: true });

      // Create manifest
      const manifest: PluginManifest = {
        name: 'example-plugin',
        version: '1.0.0',
        description: 'An example plugin demonstrating custom tool creation',
        author: 'OCC Community',
        tools: [
          {
            name: 'hello_world',
            description: 'A simple hello world tool',
            parameters: {
              name: 'string - name to greet (optional)',
            },
            handler: 'handler.js',
          },
        ],
      };

      fs.writeFileSync(
        path.join(exampleDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2)
      );

      // Create example handler
      const handlerCode = `module.exports = async function(args) {
  const name = args.name || 'World';
  return {
    success: true,
    output: \`Hello, \${name}! This is from a custom plugin.\`
  };
};
`;

      fs.writeFileSync(path.join(exampleDir, 'handler.js'), handlerCode);

      // Create README
      const readme = `# Example Plugin

This is an example plugin for Open Claude Code.

## Structure

- \`manifest.json\` - Plugin metadata and tool definitions
- \`handler.js\` - Tool implementation

## Creating Your Own Plugin

1. Create a new directory in ~/.occ-plugins/
2. Add a manifest.json file with your plugin metadata
3. Create handler files for your tools
4. Restart OCC to load the plugin

## Handler Format

Handlers should export an async function that:
- Accepts an \`args\` object with the tool parameters
- Returns an object with \`success\` (boolean) and \`output\` or \`error\` (string)

Example:
\`\`\`javascript
module.exports = async function(args) {
  try {
    // Your tool logic here
    return {
      success: true,
      output: 'Result of your tool'
    };
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }
};
\`\`\`
`;

      fs.writeFileSync(path.join(exampleDir, 'README.md'), readme);
    }
  }

  async loadPlugins(): Promise<Tool[]> {
    const pluginTools: Tool[] = [];

    if (!fs.existsSync(this.pluginsDir)) {
      return pluginTools;
    }

    const pluginDirs = fs.readdirSync(this.pluginsDir, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);

    for (const pluginDir of pluginDirs) {
      try {
        const manifestPath = path.join(this.pluginsDir, pluginDir, 'manifest.json');

        if (!fs.existsSync(manifestPath)) {
          continue;
        }

        const manifestData = fs.readFileSync(manifestPath, 'utf-8');
        const manifest: PluginManifest = JSON.parse(manifestData);

        this.loadedPlugins.set(manifest.name, manifest);

        // Load tools from plugin
        for (const tool of manifest.tools) {
          const handlerPath = path.join(this.pluginsDir, pluginDir, tool.handler);

          if (!fs.existsSync(handlerPath)) {
            console.error(`Handler not found for tool ${tool.name}: ${handlerPath}`);
            continue;
          }

          // Clear require cache to allow hot reloading
          delete require.cache[require.resolve(handlerPath)];

          const handler = require(handlerPath);

          pluginTools.push({
            name: `plugin_${tool.name}`,
            description: `${tool.description} [Plugin: ${manifest.name}]`,
            parameters: tool.parameters,
            execute: async (args: any): Promise<ToolResult> => {
              try {
                const result = await handler(args);
                return result;
              } catch (error) {
                return {
                  success: false,
                  error: error instanceof Error ? error.message : 'Plugin execution failed',
                };
              }
            },
          });
        }
      } catch (error) {
        console.error(`Failed to load plugin from ${pluginDir}:`, error);
      }
    }

    return pluginTools;
  }

  getLoadedPlugins(): PluginManifest[] {
    return Array.from(this.loadedPlugins.values());
  }

  getPluginsDirectory(): string {
    return this.pluginsDir;
  }
}
