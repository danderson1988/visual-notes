// A minimal in-memory stand-in for Obsidian's Vault/FileManager, covering
// only the methods file-io.ts and asset-manager.ts actually call
// (getAbstractFileByPath, getFiles, read, modify, create, createBinary,
// createFolder, fileManager.renameFile). Shared across their test files so
// each one isn't hand-rolling its own fake Vault.
import { TFile, type App } from 'obsidian';

export interface FakeFile { path: string; name: string; basename: string; extension: string; }

// A real instance of the stubbed TFile class (not a plain object) — some
// production code (installStarterTemplate) does `existing instanceof TFile`,
// which a plain duck-typed object would always fail.
function makeFile(path: string): FakeFile {
  const name = path.split('/').pop() ?? path;
  const dot = name.lastIndexOf('.');
  const basename = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot + 1) : '';
  const file = new TFile() as unknown as FakeFile;
  Object.assign(file, { path, name, basename, extension });
  return file;
}

export class FakeVault {
  private entries = new Map<string, { file: FakeFile; content: string | ArrayBuffer }>();
  private folders = new Set<string>();

  putText(path: string, content: string): FakeFile {
    const file = makeFile(path);
    this.entries.set(path, { file, content });
    return file;
  }

  textAt(path: string): string {
    const entry = this.entries.get(path);
    if (!entry) throw new Error(`FakeVault: no such file ${path}`);
    return entry.content as string;
  }

  has(path: string): boolean {
    return this.entries.has(path) || this.folders.has(path);
  }

  toApp(): App {
    const vault = {
      getAbstractFileByPath: (path: string) => {
        const entry = this.entries.get(path);
        if (entry) return entry.file;
        if (this.folders.has(path)) return { path, name: path.split('/').pop() ?? path };
        return null;
      },
      getFiles: () => Array.from(this.entries.values()).map(e => e.file),
      read: async (file: FakeFile) => {
        const entry = this.entries.get(file.path);
        if (!entry) throw new Error(`FakeVault: no such file ${file.path}`);
        return entry.content as string;
      },
      modify: async (file: FakeFile, content: string) => {
        const entry = this.entries.get(file.path);
        if (!entry) throw new Error(`FakeVault: no such file ${file.path}`);
        entry.content = content;
      },
      create: async (path: string, content: string) => {
        if (this.entries.has(path)) throw new Error(`FakeVault: ${path} already exists`);
        return this.putText(path, content);
      },
      createBinary: async (path: string, data: ArrayBuffer) => {
        if (this.entries.has(path)) throw new Error(`FakeVault: ${path} already exists`);
        const file = makeFile(path);
        this.entries.set(path, { file, content: data });
        return file;
      },
      createFolder: async (path: string) => { this.folders.add(path); },
    };
    const fileManager = {
      renameFile: async (file: FakeFile, newPath: string) => {
        const entry = this.entries.get(file.path);
        if (!entry) throw new Error(`FakeVault: no such file ${file.path}`);
        this.entries.delete(file.path);
        entry.file = makeFile(newPath);
        this.entries.set(newPath, entry);
      },
    };
    return { vault, fileManager } as unknown as App;
  }
}
