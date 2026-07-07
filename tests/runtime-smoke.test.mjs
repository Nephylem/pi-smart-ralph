import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setImmediate as waitImmediate, setTimeout as waitTimeout } from 'node:timers/promises';

import ralphSpecumExtension from '../extensions/ralph-specum/index.ts';

function createMockPi() {
  const commands = new Map();
  const events = new Map();
  const rpcCalls = [];
  const sendUserMessages = [];
  const toolNames = ['Agent', 'TaskCreate', 'TaskUpdate', 'TaskExecute', 'agent_browser', 'mcp'];
  const emit = (name, payload) => {
    for (const handler of events.get(name) ?? []) handler(payload);
  };
  events.emit = emit;
  events.on = (name, handler) => {
    const handlers = events.get(name) ?? [];
    handlers.push(handler);
    events.set(name, handlers);
    return () => {
      const current = events.get(name) ?? [];
      const next = current.filter((candidate) => candidate !== handler);
      if (next.length > 0) events.set(name, next);
      else events.delete(name);
    };
  };
  events.off = (name, handler) => {
    const current = events.get(name) ?? [];
    const next = current.filter((candidate) => candidate !== handler);
    if (next.length > 0) events.set(name, next);
    else events.delete(name);
  };
  return {
    commands,
    events,
    rpcCalls,
    sendUserMessages,
    registerCommand(name, definition) {
      if (commands.has(name)) throw new Error(`duplicate command: ${name}`);
      commands.set(name, definition);
    },
    on(name, handler) {
      events.on(name, handler);
    },
    emit,
    async rpcCall(name, payload) {
      rpcCalls.push({ name, payload });
      throw new Error(`mock rpc unavailable: ${name}`);
    },
    sendUserMessage(content, options) {
      sendUserMessages.push({ content, options });
    },
    getAllTools() {
      return toolNames.map((name) => ({ name, sourceInfo: { source: 'mock' } }));
    },
    getActiveTools() {
      return [...toolNames];
    },
    getThinkingLevel() {
      return 'medium';
    },
    registerTool() {},
    registerPrompt() {},
    registerResource() {},
  };
}

function createMockCtx(cwd, options = {}) {
  const notifications = [];
  const widgets = [];
  const statuses = [];
  const confirms = [];
  const inputResponses = [...(options.inputResponses ?? [])];
  const editorResponses = [...(options.editorResponses ?? [])];
  const customResponses = [...(options.customResponses ?? [])];
  const selectResponses = [...(options.selectResponses ?? [])];
  const confirmResponses = [...(options.confirmResponses ?? [])];
  return {
    cwd,
    mode: options.mode ?? 'rpc',
    hasUI: options.hasUI ?? true,
    notifications,
    widgets,
    statuses,
    confirms,
    sessionManager: {
      getBranch() { return []; },
      getSessionId() { return 'test-session'; },
    },
    isIdle() { return options.idle ?? true; },
    getContextUsage() { return options.contextUsage ?? { tokens: 0, contextWindow: 0 }; },
    async waitForIdle() {},
    async notify(message, type = 'info') {
      notifications.push({ message, type });
    },
    ui: {
      async notify(message, type = 'info') { notifications.push({ message, type }); },
      setFooter(value) { widgets.push({ kind: 'footer', value }); },
      setWidget(key, value, options) { widgets.push({ kind: 'widget', key, value, options }); },
      setStatus(key, message) { statuses.push({ key, message }); },
      async confirm(title, message) {
        confirms.push({ title, message });
        return confirmResponses.length > 0 ? confirmResponses.shift() : false;
      },
      async select(_title, selectOptions) { return selectResponses.length > 0 ? selectResponses.shift() : (selectOptions?.[0] ?? null); },
      async input() { return inputResponses.length > 0 ? inputResponses.shift() : null; },
      async editor(_title, initialText = '') { return editorResponses.length > 0 ? editorResponses.shift() : initialText; },
      async custom(_factory, _options) { return customResponses.length > 0 ? customResponses.shift() : null; },
    },
  };
}

function installMockSubagentRpc(pi, result) {
  const plans = Array.isArray(result) ? [...result] : [result];
  let spawnCount = 0;
  pi.on('subagents:rpc:ping', ({ requestId }) => {
    pi.emit(`subagents:rpc:ping:reply:${requestId}`, { success: true, data: { version: 1 } });
  });
  pi.on('subagents:rpc:spawn', async ({ requestId, type, options, prompt }) => {
    const id = `agent-${type}-${spawnCount + 1}`;
    const plan = plans[Math.min(spawnCount, plans.length - 1)];
    spawnCount += 1;
    pi.emit(`subagents:rpc:spawn:reply:${requestId}`, { success: true, data: { id } });
    pi.emit('subagents:created', { id, type, description: options?.description });
    pi.emit('subagents:started', { id, type, description: options?.description, status: 'running' });
    const resolved = typeof plan === 'function' ? await plan({ id, type, options, prompt, spawnCount }) : plan;
    pi.emit('subagents:completed', { id, type, description: options?.description, status: 'completed', result: resolved });
  });
}

function writeSpecArtifacts(specDir) {
  writeFileSync(
    join(specDir, 'requirements.md'),
    '# Requirements\n\n## User Stories\n- As a user, I can sign in.\n\n## Functional Requirements\n- Support login.\n',
    'utf8',
  );
  writeFileSync(
    join(specDir, 'design.md'),
    '# Design\n\n## Overview\n- Add a login flow.\n\n## File Structure\n- src/auth.ts\n\n## Test Strategy\n- Run npm test\n',
    'utf8',
  );
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
    'ralph-foreground-start',
    'ralph-foreground-continue',
    'ralph-foreground-status',
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

test('UI contexts route Ralph notifications through ctx.ui.notify with message and type', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    const legacyNotifications = [];
    const uiNotifications = [];
    ctx.notify = async (message, type = 'info') => {
      legacyNotifications.push({ message, type });
    };
    ctx.ui.notify = async (message, type = 'info') => {
      await waitImmediate();
      uiNotifications.push({ message, type });
    };

    await pi.commands.get('ralph-index').handler('--bad-option', ctx);

    assert.deepEqual(legacyNotifications, [], 'expected UI contexts not to use legacy ctx.notify');
    assert.equal(uiNotifications.length, 1, 'expected Ralph notification to be delivered through ctx.ui.notify');
    assert.equal(uiNotifications[0].type, 'warning');
    assert.match(uiNotifications[0].message, /Unsupported \/ralph-index option/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('no-UI context no-ops status, footer, and widget paths while notifications fall back to console', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  const consoleWarnings = [];
  const consoleLogs = [];
  const originalWarn = console.warn;
  const originalLog = console.log;
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const throwIfCalled = () => {
      throw new Error('no-UI test should not call Pi UI methods');
    };
    const ctx = {
      cwd: projectRoot,
      hasUI: false,
      async waitForIdle() {},
      ui: {
        notify: throwIfCalled,
        setFooter: throwIfCalled,
        setWidget: throwIfCalled,
        setStatus: throwIfCalled,
      },
    };
    console.warn = (...args) => {
      consoleWarnings.push(args.join(' '));
    };
    console.log = (...args) => {
      consoleLogs.push(args.join(' '));
    };

    await assert.doesNotReject(() => pi.events.get('session_start')[0]({}, ctx));
    await assert.doesNotReject(() => pi.commands.get('ralph-research').handler('no-ui-status-widget-paths', ctx));
    await waitImmediate();
    await assert.doesNotReject(() => pi.events.get('session_shutdown')[0]({}, ctx));
    await assert.doesNotReject(() => pi.commands.get('ralph-index').handler('--bad-option', ctx));

    assert.equal(consoleLogs.length, 1, 'expected no-UI info notification to fall back to console.log once');
    assert.match(consoleLogs[0], /Started Ralph research/);
    assert.equal(consoleWarnings.length, 1, 'expected no-UI warning notifications to fall back to console.warn');
    assert.match(consoleWarnings[0], /Unsupported \/ralph-index option/);
  } finally {
    console.warn = originalWarn;
    console.log = originalLog;
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('partial UI context without surface methods does not throw for status, footer, or widget paths', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const notifications = [];
    const ctx = {
      cwd: projectRoot,
      hasUI: true,
      async waitForIdle() {},
      ui: {
        async notify(message, type = 'info') {
          notifications.push({ message, type });
        },
      },
    };

    await assert.doesNotReject(() => pi.events.get('session_start')[0]({}, ctx));
    await assert.doesNotReject(() => pi.commands.get('ralph-research').handler('partial-ui-status-widget-paths', ctx));
    await waitImmediate();
    await assert.doesNotReject(() => pi.events.get('session_shutdown')[0]({}, ctx));
    await assert.doesNotReject(() => pi.commands.get('ralph-index').handler('--bad-option', ctx));

    assert.equal(notifications.at(-1).type, 'warning');
    assert.match(notifications.at(-1).message, /Unsupported \/ralph-index option/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('session_start installs Ralph footer and ralph-subagents widget surfaces', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.events.get('session_start')[0]({}, ctx);

    const footerInstall = ctx.widgets.find((entry) => entry.kind === 'footer');
    assert.ok(footerInstall, 'expected session_start to install the Ralph footer surface');

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.ok(subagentWidgetInstall, 'expected session_start to install the ralph-subagents widget');
    assert.equal(
      subagentWidgetInstall.options?.placement,
      'aboveEditor',
      'expected ralph-subagents widget to install as an above-editor interactive surface',
    );

    await assert.doesNotReject(
      () => pi.events.get('session_start')[0]({}, { cwd: projectRoot, hasUI: true }),
      'expected session_start surface installation to no-op safely when Pi UI methods are unavailable',
    );
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('Ralph footer renders workflow, task, and worker summaries without changing the installed surface', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, { contextUsage: { tokens: 512, contextWindow: 1024 } });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(join(projectRoot, 'specs', '.current-spec'), 'auth-spec\n', 'utf8');
    writeFileSync(
      join(specDir, '.ralph-state.json'),
      JSON.stringify({ workflowMode: 'foreground', phase: 'tasks', foreground: { currentStage: 'tasks', status: 'running' }, taskIndex: 1, totalTasks: 2 }, null, 2),
      'utf8',
    );
    writeFileSync(join(specDir, 'tasks.md'), '# Tasks\n\n- [x] 1.1 Done\n- [ ] 1.2 Pending\n', 'utf8');

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    const subagentRenderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 160 },
        requestRender() {},
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );
    pi.emit('subagents:created', { id: 'agent-footer-1', type: 'ralph-task-planner', description: 'Tasks planner agent' });
    pi.emit('subagents:started', { id: 'agent-footer-1', status: 'running' });

    const footerInstall = ctx.widgets.find((entry) => entry.kind === 'footer');
    assert.equal(typeof footerInstall?.value, 'function');
    const footerRenderer = footerInstall.value(
      {
        terminal: { columns: 200 },
        requestRender() {},
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
      {
        onBranchChange() { return () => {}; },
        getGitBranch() { return 'main'; },
      },
    );

    const rendered = footerRenderer.render(200).join('\n');
    assert.match(rendered, /🧭 FG tasks · running/);
    assert.match(rendered, /☑ .*1\/2 done/);
    assert.match(rendered, /🤖 1 active/);

    footerRenderer.dispose?.();
    subagentRenderer.dispose?.();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('Smart Ralph custom subagent widget never overwrites pi-subagents agents widget key', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.equal(typeof subagentWidgetInstall?.value, 'function');

    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 120 },
        requestRender() {},
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    pi.emit('subagents:created', { id: 'agent-widget-key-1', type: 'ralph-research' });
    pi.emit('subagents:started', { id: 'agent-widget-key-1', status: 'running' });
    pi.emit('subagents:completed', { id: 'agent-widget-key-1', status: 'completed' });
    await pi.events.get('session_shutdown')[0]({}, ctx);

    const widgetKeys = ctx.widgets.filter((entry) => entry.kind === 'widget').map((entry) => entry.key);
    assert.ok(widgetKeys.includes('ralph-subagents'), 'expected Smart Ralph to install its custom widget key');
    assert.equal(widgetKeys.includes('agents'), false, 'expected Smart Ralph not to overwrite pi-subagents agents widget');
    assert.ok(
      widgetKeys.filter((key) => key === 'ralph-subagents').length >= 3,
      'expected session and lifecycle custom widget updates to keep using ralph-subagents instead of agents',
    );

    renderer.dispose?.();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-subagents widget renders queued row after subagents:created event', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.equal(typeof subagentWidgetInstall?.value, 'function');

    const renderRequests = [];
    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 120 },
        requestRender() { renderRequests.push(Date.now()); },
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    pi.emit('subagents:created', {
      id: 'agent-queued-1',
      type: 'ralph-research',
      description: 'Research phase agent',
    });

    const renderedLines = renderer.render();
    assert.ok(renderRequests.length > 0, 'expected created event to request a widget render');
    assert.match(renderedLines.join('\n'), /Research/);
    assert.match(renderedLines.join('\n'), /queued|pending/i);

    renderer.dispose?.();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-subagents widget updates existing row to running after subagents:started event', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.equal(typeof subagentWidgetInstall?.value, 'function');

    const renderRequests = [];
    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 120 },
        requestRender() { renderRequests.push(Date.now()); },
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    pi.emit('subagents:created', {
      id: 'agent-started-1',
      type: 'ralph-design',
      description: 'Design phase agent',
    });
    pi.emit('subagents:started', {
      id: 'agent-started-1',
      status: 'started',
    });

    const ralphWidgetRegistrations = ctx.widgets.filter(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    const renderedLines = renderer.render();
    const renderedText = renderedLines.join('\n');

    assert.ok(renderRequests.length >= 2, 'expected created and started events to request widget renders');
    assert.equal(ralphWidgetRegistrations.length, 1, 'expected lifecycle updates not to register duplicate widget keys');
    assert.equal(renderedLines.length, 2, 'expected started lifecycle event to keep a summary header plus the updated row in place');
    assert.match(renderedText, /Ralph workers/);
    assert.match(renderedText, /Design/);
    assert.match(renderedText, /running|active/i);
    assert.doesNotMatch(renderedText, /queued|pending/i);

    renderer.dispose?.();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-subagents widget fills incomplete lifecycle payloads from manager records', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  const managerSymbol = Symbol.for('pi-subagents:manager');
  const previousManager = globalThis[managerSymbol];
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    globalThis[managerSymbol] = {
      getRecord(id) {
        if (id !== 'agent-manager-fallback-1') return undefined;
        return {
          id,
          type: 'ralph-requirements',
          description: 'Requirements fallback metadata from manager',
          startedAt: Date.now() - 2_000,
          status: 'running',
          toolUses: 5,
          lifetimeUsage: { input: 250, output: 125, cacheWrite: 25 },
          session: {
            getSessionStats: () => ({
              contextUsage: { tokens: 100, contextWindow: 200, percent: 50 },
            }),
          },
        };
      },
    };

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.equal(typeof subagentWidgetInstall?.value, 'function');

    const renderRequests = [];
    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 160 },
        requestRender() { renderRequests.push(Date.now()); },
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    pi.emit('subagents:started', {
      id: 'agent-manager-fallback-1',
      status: 'running',
    });

    const renderedText = renderer.render().join('\n');
    assert.ok(renderRequests.length > 0, 'expected incomplete lifecycle event to request a widget render');
    assert.match(renderedText, /Requirements/);
    assert.match(renderedText, /Requirements fallback metadata from manager/);
    assert.match(renderedText, /running|active/i);
    assert.match(renderedText, /5 tools/);
    assert.match(renderedText, /50%/);
    assert.match(renderedText, /100\/200 ctx/);

    renderer.dispose?.();
  } finally {
    if (previousManager === undefined) {
      delete globalThis[managerSymbol];
    } else {
      globalThis[managerSymbol] = previousManager;
    }
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-subagents widget renders completed row for bounded linger then prunes it', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  const originalDateNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.equal(typeof subagentWidgetInstall?.value, 'function');

    const renderRequests = [];
    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 120 },
        requestRender() { renderRequests.push(Date.now()); },
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    pi.emit('subagents:created', {
      id: 'agent-completed-1',
      type: 'ralph-tasks',
      description: 'Tasks phase agent',
    });
    pi.emit('subagents:completed', {
      id: 'agent-completed-1',
      status: 'completed',
      toolUses: 2,
      tokens: { total: 1234 },
    });

    const completedText = renderer.render().join('\n');
    assert.ok(renderRequests.length >= 2, 'expected created and completed events to request widget renders');
    assert.match(completedText, /Tasks/);
    assert.match(completedText, /done|completed/i);
    assert.doesNotMatch(completedText, /running|queued|pending/i);

    now += 4_000;
    assert.deepEqual(
      renderer.render(),
      [],
      'expected completed subagent row to prune after the bounded success linger window',
    );

    renderer.dispose?.();
  } finally {
    Date.now = originalDateNow;
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-subagents widget renders failed row with error indicator and metadata', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);

    await pi.events.get('session_start')[0]({}, ctx);

    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    assert.equal(typeof subagentWidgetInstall?.value, 'function');

    const renderRequests = [];
    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 120 },
        requestRender() { renderRequests.push(Date.now()); },
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    pi.emit('subagents:created', {
      id: 'agent-failed-1',
      type: 'ralph-implement',
      description: 'Implementation phase agent',
    });
    pi.emit('subagents:failed', {
      id: 'agent-failed-1',
      status: 'failed',
      error: 'Tool crashed while editing files',
      toolUses: 3,
      tokens: { total: 4567 },
    });

    const renderedText = renderer.render().join('\n');
    assert.ok(renderRequests.length >= 2, 'expected created and failed events to request widget renders');
    assert.match(renderedText, /Implement/);
    assert.match(renderedText, /error|failed/i);
    assert.match(renderedText, /Tool crashed while editing files/);
    assert.doesNotMatch(renderedText, /running|queued|pending/i);

    renderer.dispose?.();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-subagents widget pins blocker attention until subsequent spec activity clears it', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  const originalDateNow = Date.now;
  let now = 1_700_000_000_000;
  Date.now = () => now;
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Tasks\n\n## Phase 1\n\n- [x] 1.1 Ship auth skeleton\n  - **Do**: land the initial implementation\n  - **Files**: src/auth.ts\n  - **Done when**: auth skeleton exists\n  - **Verify**: manually inspect\n  - **Commit**: `test: auth skeleton`\n',
      'utf8',
    );

    await pi.events.get('session_start')[0]({}, ctx);
    const subagentWidgetInstall = ctx.widgets.find(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-subagents',
    );
    const renderer = subagentWidgetInstall.value(
      {
        terminal: { columns: 180 },
        requestRender() {},
      },
      {
        fg(_color, text) { return text; },
        bold(text) { return text; },
      },
    );

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-implement').handler('auth-spec', ctx);
    await waitTimeout(200);

    const blockedText = renderer.render().join('\n');
    assert.match(blockedText, /Ralph workers .*attention/);
    assert.match(blockedText, /auth-spec/);
    assert.match(blockedText, /blocked/);
    assert.match(blockedText, /\/ralph-implement auth-spec/);

    installMockSubagentRpc(pi, () => {
      writeFileSync(
        join(specDir, 'research.md'),
        '# Research\n\n## External Research\n- Auth patterns\n\n## Codebase Analysis\n- Existing auth hooks\n\n## Sources\n- https://example.com\n',
        'utf8',
      );
      return 'Generated research.md';
    });

    await pi.commands.get('ralph-research').handler('auth-spec', ctx);
    await waitTimeout(200);
    now += 5_000;

    assert.deepEqual(renderer.render(), [], 'expected blocker attention to clear after resumed work on the same spec');
    renderer.dispose?.();
  } finally {
    Date.now = originalDateNow;
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

test('native task startup widget appears only for task-oriented Ralph commands', async () => {
  const cases = [
    { command: 'ralph-start', args: 'phase-scope-start -- goal', label: 'start', shouldShowNativeTasks: true },
    { command: 'ralph-tasks', args: 'phase-scope-tasks', label: 'tasks', shouldShowNativeTasks: true },
    { command: 'ralph-implement', args: 'phase-scope-implement', label: 'implement', shouldShowNativeTasks: true },
    { command: 'ralph-research', args: 'phase-scope-research', label: 'research', shouldShowNativeTasks: false },
    { command: 'ralph-requirements', args: 'phase-scope-requirements', label: 'requirements', shouldShowNativeTasks: false },
  ];

  for (const { command, args, label, shouldShowNativeTasks } of cases) {
    const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
    try {
      const pi = createMockPi();
      ralphSpecumExtension(pi);
      const ctx = createMockCtx(projectRoot);
      ctx.waitForIdle = () => new Promise(() => {});

      await pi.commands.get(command).handler(args, ctx);

      const nativeTaskWidgets = ctx.widgets.filter(
        (entry) => entry.kind === 'widget' && entry.key === 'ralph-tasks',
      );
      if (shouldShowNativeTasks) {
        assert.equal(nativeTaskWidgets.length, 1, `expected /${command} to show the native task startup widget`);
        assert.match(nativeTaskWidgets[0].value.join('\n'), new RegExp(`Ralph ${label}: pi-tasks surface ready`));
        assert.equal(nativeTaskWidgets[0].options?.placement, 'aboveEditor');
      } else {
        assert.deepEqual(nativeTaskWidgets, [], `expected /${command} not to show the native task startup widget`);
      }
    } finally {
      rmSync(projectRoot, { recursive: true, force: true });
    }
  }
});

test('mirrored native tasks widget shows summary-first counts and prioritizes blocked work', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, { confirmResponses: [true] });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeSpecArtifacts(specDir);
    installMockSubagentRpc(pi, () => {
      writeFileSync(
        join(specDir, 'tasks.md'),
        '# Tasks\n\n## Build\n- [x] 1.1 Done foundation\n  - **Do**: finish scaffolding\n  - **Files**: src/auth.ts\n  - **Done when**: scaffolding is committed\n  - **Verify**: npm test -- auth\n  - **Commit**: `feat: foundation`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n- [ ] 1.2 Implement API\n  - **Do**: add the main login API\n  - **Files**: src/auth.ts\n  - **Done when**: login API exists\n  - **Verify**: npm test -- auth\n  - **Commit**: `feat: api`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n- [ ] [P] 1.3 Parallel docs\n  - **Do**: update docs in parallel\n  - **Files**: README.md\n  - **Done when**: docs reflect auth API\n  - **Verify**: npm test -- auth\n  - **Commit**: `docs: auth api`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n\n## Verify\n- [ ] [VERIFY] 1.4 Verify auth flow\n  - **Do**: run verification coverage\n  - **Files**: tests/auth.test.ts\n  - **Done when**: auth verification passes\n  - **Verify**: npm test -- auth\n  - **Commit**: `test: verify auth`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n',
        'utf8',
      );
      return 'Generated tasks.md for native widget summary.';
    });

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-tasks').handler('auth-spec --clarify off', ctx);
    await waitTimeout(200);

    const nativeTaskWidgets = ctx.widgets.filter(
      (entry) => entry.kind === 'widget' && entry.key === 'ralph-tasks',
    );
    const widget = nativeTaskWidgets.at(-1);
    assert.ok(Array.isArray(widget?.value));
    const lines = widget.value;
    assert.match(lines[0], /4 tasks/);
    assert.match(lines[0], /2 blocked/);
    assert.match(lines[0], /1 ready/);
    assert.match(lines[0], /1 done/);
    assert.match(lines[0], /1 verify open/);
    assert.match(lines[1], /#3 .*blocked by #2/);
    assert.match(lines[2], /#4 .*blocked by #3/);
    assert.match(lines[3], /#2 .*Implement API/);
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

test('ralph-init bootstrap preserves pi-subagents background FleetView defaults', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    const configDir = join(projectRoot, '.pi');
    const subagentsConfigPath = join(configDir, 'subagents.json');
    mkdirSync(configDir, { recursive: true });
    writeFileSync(
      subagentsConfigPath,
      `${JSON.stringify({ widgetMode: 'inline', fleetView: false, defaultJoinMode: 'manual' }, null, 2)}\n`,
      'utf8',
    );

    await pi.commands.get('ralph-init').handler('', ctx);

    const subagentsConfig = JSON.parse(readFileSync(subagentsConfigPath, 'utf8'));
    assert.equal(subagentsConfig.widgetMode, 'background');
    assert.equal(subagentsConfig.fleetView, true);
    assert.equal(subagentsConfig.defaultJoinMode, 'manual');
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-foreground-start orchestrates brainstorm and plan in the foreground session', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, { confirmResponses: [true] });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    installMockSubagentRpc(pi, [
      () => {
        mkdirSync(specDir, { recursive: true });
        writeFileSync(
          join(specDir, 'research.md'),
          '# Research\n\n## External Research\n- Auth patterns\n\n## Codebase Analysis\n- No auth module yet\n\n## Sources\n- https://example.com\n',
          'utf8',
        );
        return 'Generated research.md';
      },
      () => {
        writeFileSync(
          join(specDir, 'requirements.md'),
          '# Requirements\n\n## User Stories\n- As a user, I can sign in.\n\n## Functional Requirements\n- Support email sign-in.\n',
          'utf8',
        );
        return 'Generated requirements.md';
      },
      () => {
        writeFileSync(
          join(specDir, 'design.md'),
          '# Design\n\n## Overview\n- Add auth flow.\n\n## File Structure\n- src/auth.ts\n\n## Test Strategy\n- npm test\n',
          'utf8',
        );
        return 'Generated design.md';
      },
    ]);

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-foreground-start').handler('auth-spec --through plan -- Build authentication flow', ctx);

    const state = JSON.parse(readFileSync(join(specDir, '.ralph-state.json'), 'utf8'));
    assert.equal(state.workflowMode, 'foreground');
    assert.equal(state.foreground.lastCompletedStage, 'plan');
    assert.equal(state.foreground.status, 'paused');
    assert.match(readFileSync(join(specDir, 'research.md'), 'utf8'), /External Research/);
    assert.match(readFileSync(join(specDir, 'design.md'), 'utf8'), /Test Strategy/);
    assert.equal(ctx.confirms.some((entry) => entry.title === 'Continue foreground Ralph workflow?'), true);
    assert.equal(ctx.notifications.some((entry) => /continue in the background/i.test(entry.message)), false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-foreground-continue runs final verification for a completed spec', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeSpecArtifacts(specDir);
    writeFileSync(
      join(specDir, 'research.md'),
      '# Research\n\n## External Research\n- Auth research\n\n## Codebase Analysis\n- Existing auth hooks\n\n## Sources\n- https://example.com\n',
      'utf8',
    );
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Tasks\n\n## Phase 1\n\n- [x] 1.1 Ship auth\n  - **Do**: ship auth\n  - **Files**: src/auth.ts\n  - **Done when**: auth works\n  - **Verify**: npm test\n  - **Commit**: `feat: auth`\n',
      'utf8',
    );
    writeFileSync(
      join(specDir, '.ralph-state.json'),
      `${JSON.stringify({ phase: 'execution', awaitingApproval: false, foreground: { lastCompletedStage: 'implement' } }, null, 2)}\n`,
      'utf8',
    );
    installMockSubagentRpc(pi, 'Verified auth-spec\n- checks: PASS npm test\n\nVERIFICATION_PASS');

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-foreground-continue').handler('auth-spec --through verify', ctx);

    const state = JSON.parse(readFileSync(join(specDir, '.ralph-state.json'), 'utf8'));
    assert.equal(state.foreground.verificationStatus, 'passed');
    assert.equal(state.foreground.status, 'completed');
    assert.equal(ctx.notifications.some((entry) => /VERIFICATION_PASS/.test(entry.message)), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('triage USER_INPUT_REQUIRED escalates into a main-session user message', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    installMockSubagentRpc(pi, 'USER_INPUT_REQUIRED\nQuestions:\n- Which auth provider should we target?\n- Should MVP include SSO?');

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-triage').handler('auth-epic Build authentication flows', ctx);
    await waitTimeout(100);

    assert.equal(pi.sendUserMessages.length, 1, 'expected one handoff into the main session');
    assert.match(pi.sendUserMessages[0].content, /Smart Ralph needs help \(triage_user_input\)/);
    assert.match(pi.sendUserMessages[0].content, /Which auth provider should we target\?/);
    assert.match(pi.sendUserMessages[0].content, /When ready, resume with: \/ralph-triage auth-epic/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('implementation blocker escalates into a main-session user message', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot);
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeFileSync(
      join(specDir, 'tasks.md'),
      '# Tasks\n\n## Phase 1\n\n- [x] 1.1 Ship auth skeleton\n  - **Do**: land the initial implementation\n  - **Files**: src/auth.ts\n  - **Done when**: auth skeleton exists\n  - **Verify**: manually inspect\n  - **Commit**: `test: auth skeleton`\n',
      'utf8',
    );

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-implement').handler('auth-spec', ctx);
    await waitTimeout(200);

    assert.equal(pi.sendUserMessages.length, 1, 'expected one implementation blocker handoff');
    assert.match(pi.sendUserMessages[0].content, /Smart Ralph needs help \(implementation_blocker\)/);
    assert.match(pi.sendUserMessages[0].content, /Layer 3 review evidence is incomplete before final success/);
    assert.match(pi.sendUserMessages[0].content, /When ready, resume with: \/ralph-implement auth-spec/);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-tasks clarification loop collects answers and reruns task generation', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, {
      mode: 'tui',
      customResponses: [
        {
          action: 'submit',
          answers: [
            { question: 'Should MVP support OAuth or email/password only?', answer: 'Email/password only for MVP' },
            { question: 'Is unit coverage enough or do we require integration tests?', answer: 'Integration tests are required' },
          ],
        },
      ],
      confirmResponses: [true, true],
    });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeSpecArtifacts(specDir);
    installMockSubagentRpc(pi, [
      'TASKS_USER_INPUT_REQUIRED\nQuestions:\n1. Should MVP support OAuth or email/password only?\n2. Is unit coverage enough or do we require integration tests?',
      () => {
        writeFileSync(
          join(specDir, 'tasks.md'),
          '# Tasks\n\n- [ ] 1.1 Build login form\n  - **Do**: add the MVP email/password login UI and handler\n  - **Files**: src/auth.ts\n  - **Done when**: users can submit credentials through the MVP login path\n  - **Verify**: npm test -- auth\n  - **Commit**: `feat: add login form`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n',
          'utf8',
        );
        return 'Generated tasks.md after clarification answers.';
      },
    ]);

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-tasks').handler('auth-spec --clarify on', ctx);
    await waitTimeout(200);

    const state = JSON.parse(readFileSync(join(specDir, '.ralph-state.json'), 'utf8'));
    const progress = readFileSync(join(specDir, '.progress.md'), 'utf8');
    const tasks = readFileSync(join(specDir, 'tasks.md'), 'utf8');

    assert.equal(state.taskClarification.mode, 'on');
    assert.equal(state.taskClarification.round, 1);
    assert.equal(state.taskClarification.answers[0].answer, 'Email/password only for MVP');
    assert.equal(state.taskClarification.answers[1].answer, 'Integration tests are required');
    assert.match(progress, /Task clarification round 1/);
    assert.match(progress, /Email\/password only for MVP/);
    assert.match(tasks, /Build login form/);
    assert.equal(ctx.widgets.some((entry) => entry.key === 'ralph-task-clarification'), true);
    assert.equal(ctx.confirms.some((entry) => entry.title === 'Apply Ralph task clarification answers?'), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-tasks partial clarification warns before using best judgment for unanswered items', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, {
      mode: 'tui',
      customResponses: [
        {
          action: 'submit',
          answers: [
            { question: 'Should MVP support OAuth or email/password only?', answer: 'Email/password only for MVP' },
            { question: 'Is unit coverage enough or do we require integration tests?', answer: 'Skipped by user.' },
          ],
        },
      ],
      confirmResponses: [true, true],
    });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeSpecArtifacts(specDir);
    installMockSubagentRpc(pi, [
      'TASKS_USER_INPUT_REQUIRED\nQuestions:\n1. Should MVP support OAuth or email/password only?\n2. Is unit coverage enough or do we require integration tests?',
      () => {
        writeFileSync(
          join(specDir, 'tasks.md'),
          '# Tasks\n\n- [ ] 1.1 Build login form\n  - **Do**: add the MVP email/password login UI and handler\n  - **Files**: src/auth.ts\n  - **Done when**: users can submit credentials through the MVP login path\n  - **Verify**: npm test -- auth\n  - **Commit**: `feat: add login form`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n',
          'utf8',
        );
        return 'Generated tasks.md after partial clarification answers.';
      },
    ]);

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-tasks').handler('auth-spec --clarify on', ctx);
    await waitTimeout(200);

    const state = JSON.parse(readFileSync(join(specDir, '.ralph-state.json'), 'utf8'));
    assert.equal(state.taskClarification.answers[0].answer, 'Email/password only for MVP');
    assert.equal(state.taskClarification.answers[1].answer, 'Skipped by user.');
    const partialConfirm = ctx.confirms.find((entry) => entry.title === 'Submit partial Ralph clarification answers?');
    assert.equal(Boolean(partialConfirm), true);
    assert.equal(partialConfirm.message.includes('Ralph will use best judgment for these'), true);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-tasks --clarify off persists best-judgment mode without entering Q&A', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, { confirmResponses: [true] });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeSpecArtifacts(specDir);
    installMockSubagentRpc(pi, () => {
      writeFileSync(
        join(specDir, 'tasks.md'),
        '# Tasks\n\n- [ ] 1.1 Build login form\n  - **Do**: add the MVP login path using best judgment\n  - **Files**: src/auth.ts\n  - **Done when**: users can submit credentials\n  - **Verify**: npm test -- auth\n  - **Commit**: `feat: add login form`\n  - **Requirements**: FR-1\n  - **Design**: auth-flow\n',
        'utf8',
      );
      return 'Generated tasks.md using best judgment.';
    });

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-tasks').handler('auth-spec --clarify off', ctx);
    await waitTimeout(200);

    const state = JSON.parse(readFileSync(join(specDir, '.ralph-state.json'), 'utf8'));
    assert.equal(state.taskClarification.mode, 'off');
    assert.equal(state.taskClarification.pending, false);
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('ralph-tasks clarification handoff escalates into the main session when no UI is available', async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), 'ralph-runtime-smoke-'));
  try {
    const pi = createMockPi();
    ralphSpecumExtension(pi);
    const ctx = createMockCtx(projectRoot, { hasUI: false });
    const specDir = join(projectRoot, 'specs', 'auth-spec');
    mkdirSync(specDir, { recursive: true });
    writeSpecArtifacts(specDir);
    installMockSubagentRpc(pi, 'TASKS_USER_INPUT_REQUIRED\nQuestions:\n1. Should MVP support OAuth or email/password only?\n2. Is unit coverage enough or do we require integration tests?');

    await pi.commands.get('ralph-init').handler('', ctx);
    await pi.commands.get('ralph-tasks').handler('auth-spec --clarify on', ctx);
    await waitTimeout(200);

    const state = JSON.parse(readFileSync(join(specDir, '.ralph-state.json'), 'utf8'));
    assert.equal(pi.sendUserMessages.length, 1, 'expected one task clarification handoff');
    assert.match(pi.sendUserMessages[0].content, /Smart Ralph needs help \(task_clarification\)/);
    assert.match(pi.sendUserMessages[0].content, /Should MVP support OAuth or email\/password only\?/);
    assert.match(pi.sendUserMessages[0].content, /When ready, resume with: \/ralph-tasks auth-spec --clarify on/);
    assert.equal(state.taskClarification.pending, true);
    assert.equal(state.taskClarification.questions[0], 'Should MVP support OAuth or email/password only?');
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
