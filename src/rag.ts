import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

export interface Document {
  id: string;
  content: string;
  metadata: {
    source: string;
    title?: string;
    type: string;
  };
}

export interface SearchResult {
  document: Document;
  score: number;
}

export class SimpleRAG {
  private documents: Document[] = [];
  private indexPath: string;

  constructor() {
    this.indexPath = path.join(os.homedir(), '.occ-rag-index.json');
    this.loadIndex();
  }

  private loadIndex(): void {
    try {
      if (fs.existsSync(this.indexPath)) {
        const data = fs.readFileSync(this.indexPath, 'utf-8');
        this.documents = JSON.parse(data);
      }
    } catch (error) {
      console.error('Failed to load RAG index:', error);
      this.documents = [];
    }
  }

  private saveIndex(): void {
    try {
      fs.writeFileSync(this.indexPath, JSON.stringify(this.documents, null, 2));
    } catch (error) {
      console.error('Failed to save RAG index:', error);
    }
  }

  async indexFile(filePath: string, type: string = 'documentation'): Promise<void> {
    try {
      const content = await fs.promises.readFile(filePath, 'utf-8');
      const fileName = path.basename(filePath);

      // Split into chunks for large files
      const chunkSize = 2000; // characters
      const chunks = this.splitIntoChunks(content, chunkSize);

      for (let i = 0; i < chunks.length; i++) {
        const doc: Document = {
          id: `${filePath}:${i}`,
          content: chunks[i],
          metadata: {
            source: filePath,
            title: fileName,
            type,
          },
        };

        // Remove existing chunk if it exists
        this.documents = this.documents.filter(d => d.id !== doc.id);
        this.documents.push(doc);
      }

      this.saveIndex();
    } catch (error) {
      throw new Error(`Failed to index file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async indexDirectory(dirPath: string, extensions: string[] = ['.md', '.txt', '.rst']): Promise<number> {
    let count = 0;

    try {
      const files = await this.getAllFiles(dirPath, extensions);

      for (const file of files) {
        await this.indexFile(file, 'documentation');
        count++;
      }

      return count;
    } catch (error) {
      throw new Error(`Failed to index directory: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private async getAllFiles(dirPath: string, extensions: string[]): Promise<string[]> {
    const files: string[] = [];

    async function walk(dir: string) {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          // Skip common directories
          if (!['node_modules', '.git', 'dist', 'build'].includes(entry.name)) {
            await walk(fullPath);
          }
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          if (extensions.includes(ext)) {
            files.push(fullPath);
          }
        }
      }
    }

    await walk(dirPath);
    return files;
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    const lines = text.split('\n');
    let currentChunk = '';

    for (const line of lines) {
      if (currentChunk.length + line.length > chunkSize && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = line + '\n';
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk.trim().length > 0) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  search(query: string, limit: number = 5): SearchResult[] {
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

    const results: SearchResult[] = this.documents.map(doc => {
      const contentLower = doc.content.toLowerCase();
      let score = 0;

      // Simple TF-based scoring
      for (const term of queryTerms) {
        const regex = new RegExp(term, 'gi');
        const matches = contentLower.match(regex);
        if (matches) {
          score += matches.length;
        }
      }

      // Boost for title matches
      if (doc.metadata.title && doc.metadata.title.toLowerCase().includes(queryLower)) {
        score += 10;
      }

      return { document: doc, score };
    });

    return results
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getDocumentCount(): number {
    return this.documents.length;
  }

  clearIndex(): void {
    this.documents = [];
    this.saveIndex();
  }

  getIndexedSources(): string[] {
    const sources = new Set(this.documents.map(d => d.metadata.source));
    return Array.from(sources);
  }
}
