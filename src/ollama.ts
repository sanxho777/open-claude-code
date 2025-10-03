import axios, { AxiosInstance } from 'axios';

export interface OllamaMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
}

export interface OllamaConfig {
  baseURL?: string;
  model: string;
  temperature?: number;
  stream?: boolean;
}

export class OllamaClient {
  private client: AxiosInstance;
  private config: OllamaConfig;

  constructor(config: OllamaConfig) {
    this.config = {
      baseURL: config.baseURL || 'http://localhost:11434',
      model: config.model,
      temperature: config.temperature || 0.7,
      stream: config.stream ?? false,
    };

    this.client = axios.create({
      baseURL: this.config.baseURL,
      timeout: 300000, // 5 minutes
    });
  }

  async chat(messages: OllamaMessage[]): Promise<string> {
    try {
      const response = await this.client.post('/api/chat', {
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
        },
      });

      return response.data.message.content;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Ollama API error: ${error.message}`);
      }
      throw error;
    }
  }

  async *chatStream(messages: OllamaMessage[]): AsyncGenerator<string, void, unknown> {
    try {
      const response = await this.client.post('/api/chat', {
        model: this.config.model,
        messages,
        stream: true,
        options: {
          temperature: this.config.temperature,
        },
      }, {
        responseType: 'stream',
      });

      const stream = response.data;
      let buffer = '';

      for await (const chunk of stream) {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const data = JSON.parse(line);
              if (data.message?.content) {
                yield data.message.content;
              }
            } catch {
              // Skip invalid JSON
            }
          }
        }
      }
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Ollama API error: ${error.message}`);
      }
      throw error;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await this.client.get('/api/tags');
      return response.data.models.map((m: any) => m.name);
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to list models: ${error.message}`);
      }
      throw error;
    }
  }

  async checkHealth(): Promise<boolean> {
    try {
      await this.client.get('/');
      return true;
    } catch {
      return false;
    }
  }
}
