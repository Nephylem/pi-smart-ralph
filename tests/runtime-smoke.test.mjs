import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as waitImmediate } from 'node:timers/promises';

import ralphSpecumExtension from '../extensions/ralph-specum/index.ts';

function createMockPi() {
  const commands = new Map();
  const events = new Map();
  const rpcCalls = [];
  return {
    commands,
    events,
    rpcCalls,
    registerCommand(name, definition) {
      if (commands.has(name)) throw new Error(`duplicate command: ${name}`);
      commands.set(name, definition);
    },
    on(name, handler) {
      const handlers = events.get(name) ?? [];
      handlers.push(handler);
      events.set(name, handlers);
    },
    async rpcCall(name, payload) {
      rpcCalls.push({ name, payload });
      throw new Error(`mock rpc unavailable: ${name}`);
    },
    registerTool() {},
    registerPrompt() {},
    registerResource() {},
  };
}

function createMockCtx(cwd) {
  const notifications = [];
  const widgets = [];
  const statuses = [];
  return {
    cwd,
    hasUI: true,
    notifications,
    widgets,
    statuses,
    async waitForIdle() {},
    async notify(message, type = 'info') {
      notifications.push({ message, type });
    },
    ui: {
      async notify(message, type = 'info') { notifications.push({ message, type }); },
      setFooter(value) { widgets.push({ kind: 'footer', value }); },
      setWidget(key, value) { widgets.push({ kind: 'widget', key, value }); },
      setStatus(key, message) { statuses.push({ key, message }); },
      async confirm() { return false; },
      async select(_title, options) { return options?.[0] ?? null; },
      async input() { return null; },
    },
  };
}

test('extension registers the expected Ralph command surface once', () => {
  const pi = createMockPi();
  ralphSpecumExtension(pi);

  const expectedCommands = [
    'ralph-help',
    'ralph-feedback',
    'ralph-model',
    'ralph-triage',
    'ralph-epic-status',
    'ralph-epic-switch',
    'ralph-epic-next',
    'ralph-epic-cancel',
    'ralph-start',
    'ralph-new',
    'ralph-research',
    'ralph-requirements',
    'ralph-design',
    'ralph-tasks',
    'ralph-implement',
    'ralph-refactor',
    'ralph-index',
    'ralph-status',
    'ralph-switch',
    'ralph-cancel',
    'ralph-init',
  ];

  assert.deepEqual([...pi.commands.keys()].sort(), expectedCommands.sort());
  assert.equal(pi.events.has('session_start'), true);
  assert.equal(pi.events.has('session_shutdown'), true);
  assert.equal(pi.events.has('resources_discover'), true);
});

test('core command handlers work with a minimal Pi context', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.commands.get('ralph-help').handler('', ctx);
    assert.match(ctx.notifications.at(-1).message, /Smart Ralph Pi shell/);
    assert.match(ctx.notifications.at(-1).message, /\/ralph-index/);

    await pi.commands.get('ralph-status').handler('', ctx);
    assert.match(ctx.notifications.at(-1).message, /Ralph Specum Status/);

    await pi.commands.get('ralph-index').handler('--bad-option', ctx);
    assert.equal(ctx.notifications.at(-1).type, 'warning');
    assert.match(ctx.notifications.at(-1).message, /Unsupported \/ralph-index option/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('phase command handler returns after startup before delegated coordinator work resolves', async () => {
  // BEFORE failure mode: there was no regression proof that /ralph-* command handlers
  // return after startup while coordinator/delegated work remains pending in the background.
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    let delegatedWorkStarted = false;
    ctx.waitForIdle = () => {
      delegatedWorkStarted = true;
      return new Promise(() => {});
    };

    await pi.commands.get('ralph-research').handler('pending-delegated-work', ctx);
    await waitImmediate();

    assert.equal(
      delegatedWorkStarted,
      false,
      'expected /ralph-* handler to return before pending delegated coordinator work starts or resolves',
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('coordinator startup publishes a non-empty Ralph status', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    ctx.waitForIdle = () => new Promise(() => {});

    await pi.commands.get('ralph-research').handler('status-startup', ctx);

    const ralphStatus = ctx.statuses.find((status) => status.key === 'ralph' && status.message);
    assert.ok(ralphStatus, 'expected coordinator startup to publish a non-empty Ralph status');
    assert.equal(ralphStatus.message, 'Running Ralph research');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('concurrent Ralph phase command is rejected while one coordinator job is active', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    let delegatedStartCount = 0;
    ctx.waitForIdle = () => {
      delegatedStartCount += 1;
      return new Promise(() => {});
    };

    await pi.commands.get('ralph-research').handler('pending-first-job', ctx);
    await pi.commands.get('ralph-design').handler('overlapping-second-job', ctx);
    await waitImmediate();

    assert.equal(delegatedStartCount, 1, 'expected only the first delegated coordinator promise to start');
    assert.equal(ctx.notifications.at(-1).type, 'warning');
    assert.match(ctx.notifications.at(-1).message, /already running/i);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('resources_discover is registered and safe before bundled runtime bootstrap', async () => {
  const pi = createMockPi();
  ralphSpecumExtension(pi);

  const handlers = pi.events.get('resources_discover');
  assert.equal(handlers.length, 1);
  const result = await handlers[0]();
  assert.equal(typeof result, 'object');
  assert.equal(Array.isArray(result.skillPaths) || result.skillPaths === undefined, true);
});
