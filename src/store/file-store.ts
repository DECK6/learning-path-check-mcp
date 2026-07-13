import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { BaseStore, type ScopeState } from "./base-store.js";

interface FilePayload {
  version: 1;
  scopes: Array<{ scopeKey: string; state: ScopeState }>;
}

export class FileStore extends BaseStore {
  private loaded = false;
  private writeQueue = Promise.resolve();

  constructor(private readonly path: string) {
    super();
  }

  protected override async beforeAccess(): Promise<void> {
    if (this.loaded) return;
    try {
      const payload = JSON.parse(await readFile(this.path, "utf8")) as FilePayload;
      this.importScopes(Array.isArray(payload.scopes) ? payload.scopes : []);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    this.loaded = true;
  }

  protected override async afterMutation(): Promise<void> {
    const payload: FilePayload = { version: 1, scopes: this.exportScopes() };
    this.writeQueue = this.writeQueue.then(async () => {
      await mkdir(dirname(this.path), { recursive: true });
      const temporary = `${this.path}.${process.pid}.${Date.now()}.tmp`;
      await writeFile(temporary, JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
      await rename(temporary, this.path);
    });
    await this.writeQueue;
  }
}
