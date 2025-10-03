#!/usr/bin/env node

import { program } from 'commander';
import inquirer from 'inquirer';
import { Assistant } from './assistant';
import { ConfigManager } from './config';
import { OllamaClient } from './ollama';
import { UI } from './ui';
import { PluginManager } from './plugins';

const configManager = new ConfigManager();

async function runChat() {
  let config = configManager.getConfig();

  // Show welcome screen with mascot
  UI.showWelcome(config.model, config.ollamaBaseURL, process.cwd());

  // Check Ollama health
  let ollama = new OllamaClient({ model: config.model, baseURL: config.ollamaBaseURL });
  const isHealthy = await ollama.checkHealth();

  UI.showConnectionStatus(isHealthy);

  if (!isHealthy) {
    process.exit(1);
  }

  let assistant = await Assistant.create({
    model: config.model,
    ollamaBaseURL: config.ollamaBaseURL,
    workingDirectory: process.cwd(),
    streaming: true,
    customSystemPrompt: config.customSystemPrompt,
  });

  while (true) {
    const { message } = await inquirer.prompt([
      {
        type: 'input',
        name: 'message',
        message: '💬',
        prefix: '',
      },
    ]);

    const trimmedMessage = message.trim();

    if (!trimmedMessage) continue;

    // Handle commands
    if (trimmedMessage === '/exit' || trimmedMessage === '/quit') {
      UI.showGoodbye();
      process.exit(0);
    }

    if (trimmedMessage === '/clear') {
      assistant.clearHistory();
      UI.showSuccess('Conversation history cleared');
      continue;
    }

    if (trimmedMessage === '/help') {
      UI.showHelp();
      continue;
    }

    if (trimmedMessage === '/stats') {
      const stats = assistant.getStats();
      UI.showStats(stats.messageCount, stats.toolUseCount, stats.estimatedTokens, stats.tokenLimit);
      continue;
    }

    if (trimmedMessage.startsWith('/save')) {
      const parts = trimmedMessage.split(' ');
      if (parts.length < 2) {
        UI.showWarning('Usage: /save <conversation-name>');
        continue;
      }
      const name = parts.slice(1).join('-');
      const result = await assistant.saveConversation(name);
      if (result.success) {
        UI.showSuccess(result.message);
      } else {
        UI.showError(result.message);
      }
      continue;
    }

    if (trimmedMessage.startsWith('/load')) {
      const parts = trimmedMessage.split(' ');
      if (parts.length < 2) {
        UI.showWarning('Usage: /load <conversation-name>');
        continue;
      }
      const name = parts.slice(1).join('-');
      const result = await assistant.loadConversation(name);
      if (result.success) {
        UI.showSuccess(result.message);
      } else {
        UI.showError(result.message);
      }
      continue;
    }

    if (trimmedMessage === '/list' || trimmedMessage === '/conversations') {
      const conversations = await assistant.listConversations();
      if (conversations.length === 0) {
        UI.showWarning('No saved conversations found');
      } else {
        UI.drawBox('Saved Conversations', conversations);
      }
      continue;
    }

    if (trimmedMessage === '/plugins') {
      const pluginManager = new PluginManager();
      const plugins = pluginManager.getLoadedPlugins();
      if (plugins.length === 0) {
        UI.showWarning(`No plugins loaded. Add plugins to: ${pluginManager.getPluginsDirectory()}`);
      } else {
        const pluginInfo = plugins.map(p => `${p.name} v${p.version} - ${p.description}`);
        UI.drawBox('Loaded Plugins', pluginInfo);
      }
      continue;
    }

    if (trimmedMessage.startsWith('/export')) {
      const parts = trimmedMessage.split(' ');
      const format = parts[1] || 'markdown';
      const filename = parts[2] || `conversation-${Date.now()}`;

      const result = await assistant.exportConversation(filename, format as 'markdown' | 'pdf');
      if (result.success) {
        UI.showSuccess(result.message);
      } else {
        UI.showError(result.message);
      }
      continue;
    }

    if (trimmedMessage === '/model' || trimmedMessage === '/models') {
      try {
        // Fetch available models
        const models = await ollama.listModels();

        if (models.length === 0) {
          UI.showWarning('No models available. Pull a model with: ollama pull <model-name>');
          continue;
        }

        // Show current model and let user select a new one
        const { selectedModel } = await inquirer.prompt([
          {
            type: 'list',
            name: 'selectedModel',
            message: 'Select a model:',
            choices: models.map(model => ({
              name: model === config.model ? `${model} (current)` : model,
              value: model,
            })),
            default: config.model,
          },
        ]);

        if (selectedModel !== config.model) {
          // Update config
          configManager.setModel(selectedModel);
          config = configManager.getConfig();

          // Recreate assistant with new model
          assistant = await Assistant.create({
            model: selectedModel,
            ollamaBaseURL: config.ollamaBaseURL,
            workingDirectory: process.cwd(),
            streaming: true,
            customSystemPrompt: config.customSystemPrompt,
          });

          // Recreate ollama client
          ollama = new OllamaClient({ model: selectedModel, baseURL: config.ollamaBaseURL });

          UI.showSuccess(`Switched to model: ${selectedModel}`);
        } else {
          UI.showWarning('Model unchanged');
        }
      } catch (error) {
        UI.showError(error instanceof Error ? error.message : 'Failed to switch models');
      }
      continue;
    }

    // Process regular message
    try {
      UI.formatUserMessage(trimmedMessage);

      // Create confirmation callback
      const confirmCallback = async (message: string): Promise<boolean> => {
        const { confirmed } = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'confirmed',
            message: `⚠️  ${message} - Proceed?`,
            default: false,
          },
        ]);
        return confirmed;
      };

      const response = await assistant.chat(trimmedMessage, confirmCallback);

      if (response) {
        UI.formatAssistantMessage(response);
      }
    } catch (error) {
      UI.showError(error instanceof Error ? error.message : 'Unknown error');
    }
  }
}

async function listModels() {
  const config = configManager.getConfig();
  const ollama = new OllamaClient({ model: config.model, baseURL: config.ollamaBaseURL });

  try {
    const models = await ollama.listModels();
    const modelList = models.map((model) =>
      model === config.model ? `${model} ← active` : model
    );
    UI.drawBox('Available Ollama Models', modelList);
  } catch (error) {
    UI.showError(error instanceof Error ? error.message : 'Failed to list models');
  }
}

async function setModel(modelName: string) {
  configManager.setModel(modelName);
  UI.showSuccess(`Model set to: ${modelName}`);
}

async function setOllamaURL(url: string) {
  configManager.setOllamaBaseURL(url);
  UI.showSuccess(`Ollama URL set to: ${url}`);
}

async function showConfig() {
  const config = configManager.getConfig();
  const configLines = [
    `Model:       ${config.model}`,
    `Ollama URL:  ${config.ollamaBaseURL}`,
    `Config file: ${configManager.getConfigPath()}`,
  ];

  if (config.customSystemPrompt) {
    configLines.push(`Custom System Prompt: ${config.customSystemPrompt.substring(0, 50)}...`);
  }

  UI.drawBox('Configuration', configLines);
}

async function setSystemPrompt(prompt: string) {
  configManager.setCustomSystemPrompt(prompt);
  UI.showSuccess(`Custom system prompt set`);
}

async function clearSystemPrompt() {
  configManager.clearCustomSystemPrompt();
  UI.showSuccess(`Custom system prompt cleared`);
}

program
  .name('occ')
  .description('Open Claude Code - A local AI coding assistant powered by Ollama')
  .version('1.0.0');

program
  .command('chat', { isDefault: true })
  .description('Start an interactive chat session')
  .action(runChat);

program
  .command('models')
  .description('List available Ollama models')
  .action(listModels);

program
  .command('set-model <model>')
  .description('Set the default Ollama model')
  .action(setModel);

program
  .command('set-url <url>')
  .description('Set the Ollama base URL')
  .action(setOllamaURL);

program
  .command('config')
  .description('Show current configuration')
  .action(showConfig);

program
  .command('set-prompt <prompt>')
  .description('Set a custom system prompt')
  .action(setSystemPrompt);

program
  .command('clear-prompt')
  .description('Clear custom system prompt')
  .action(clearSystemPrompt);

program.parse();
