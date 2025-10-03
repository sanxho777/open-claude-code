import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Config {
  model: string;
  ollamaBaseURL: string;
  defaultDirectory?: string;
}

const DEFAULT_CONFIG: Config = {
  model: 'qwen2.5-coder:14b',
  ollamaBaseURL: 'http://localhost:11434',
};

export class ConfigManager {
  private configPath: string;
  private config: Config;

  constructor() {
    this.configPath = path.join(os.homedir(), '.occ-config.json');
    this.config = this.loadConfig();
  }

  private loadConfig(): Config {
    try {
      if (fs.existsSync(this.configPath)) {
        const data = fs.readFileSync(this.configPath, 'utf-8');
        return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
      }
    } catch (error) {
      console.error('Error loading config, using defaults');
    }
    return { ...DEFAULT_CONFIG };
  }

  saveConfig(config: Partial<Config>): void {
    this.config = { ...this.config, ...config };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2));
    } catch (error) {
      console.error('Error saving config:', error);
    }
  }

  getConfig(): Config {
    return { ...this.config };
  }

  setModel(model: string): void {
    this.saveConfig({ model });
  }

  setOllamaBaseURL(url: string): void {
    this.saveConfig({ ollamaBaseURL: url });
  }

  getConfigPath(): string {
    return this.configPath;
  }
}
