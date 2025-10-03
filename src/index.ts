#!/usr/bin/env node

import { program } from 'commander';
import inquirer from 'inquirer';
import { Assistant } from './assistant';
import { ConfigManager } from './config';
import { OllamaClient } from './ollama';
import { UI } from './ui';

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

  let assistant = new Assistant({
    model: config.model,
    ollamaBaseURL: config.ollamaBaseURL,
    workingDirectory: process.cwd(),
    streaming: true,
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
      UI.showStats(stats.messageCount, stats.toolUseCount);
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
          assistant = new Assistant({
            model: selectedModel,
            ollamaBaseURL: config.ollamaBaseURL,
            workingDirectory: process.cwd(),
            streaming: true,
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
      const response = await assistant.chat(trimmedMessage);

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
  UI.drawBox('Configuration', [
    `Model:       ${config.model}`,
    `Ollama URL:  ${config.ollamaBaseURL}`,
    `Config file: ${configManager.getConfigPath()}`,
  ]);
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

program.parse();
