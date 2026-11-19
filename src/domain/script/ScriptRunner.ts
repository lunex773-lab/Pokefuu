import type { Condition, ScriptCommand, ScriptDef } from '../types';

export type CommandHandler = (cmd: ScriptCommand, runner: ScriptRunner) => Promise<void> | void;

class StopSignal {}

/**
 * イベントスクリプトのインタプリタ。
 * コマンドはレジストリに登録する方式（新コマンド追加でランナー本体を変更しない＝開放閉鎖原則）。
 * 制御構文（if / call / end）だけを組み込みで持つ。
 */
export class ScriptRunner {
  private handlers = new Map<string, CommandHandler>();
  private depth = 0;
  running = false;

  constructor(
    private readonly lookup: (id: string) => ScriptDef,
    private readonly check: (cond: Condition) => boolean,
  ) {
    this.register('if', async (cmd, r) => {
      const ok = this.check(cmd.when as Condition);
      const branch = (ok ? cmd.then : cmd.else) as ScriptCommand[] | undefined;
      if (branch) await r.exec(branch);
    });
    this.register('call', async (cmd, r) => {
      await r.exec(this.lookup(String(cmd.script)).commands);
    });
    this.register('end', () => {
      throw new StopSignal();
    });
  }

  register(name: string, handler: CommandHandler): void {
    this.handlers.set(name, handler);
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  get commandNames(): string[] {
    return [...this.handlers.keys()];
  }

  async run(scriptId: string): Promise<void> {
    await this.runCommands(this.lookup(scriptId).commands);
  }

  async runCommands(commands: ScriptCommand[]): Promise<void> {
    const outer = this.depth === 0;
    if (outer) this.running = true;
    this.depth++;
    try {
      await this.exec(commands);
    } catch (e) {
      if (!(e instanceof StopSignal)) throw e;
      if (!outer) throw e;
    } finally {
      this.depth--;
      if (outer) this.running = false;
    }
  }

  async exec(commands: ScriptCommand[]): Promise<void> {
    for (const cmd of commands) {
      const h = this.handlers.get(cmd.cmd);
      if (!h) {
        console.warn(`[Script] unknown command: ${cmd.cmd}`);
        continue;
      }
      await h(cmd, this);
    }
  }
}
