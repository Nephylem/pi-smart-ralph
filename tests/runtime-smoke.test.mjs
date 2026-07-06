import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
    emit(name, payload) {
      for (const handler of events.get(name) ?? []) handler(payload);
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
      setWidget(key, value, options) { widgets.push({ kind: 'widget', key, value, options }); },
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
    assert.equal(renderedLines.length, 1, 'expected started lifecycle event to update the existing row in place');
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

test('resources_discover is registered and safe before bundled runtime bootstrap', async () => {
  const pi = createMockPi();
  ralphSpecumExtension(pi);

  const handlers = pi.events.get('resources_discover');
  assert.equal(handlers.length, 1);
  const result = await handlers[0]();
  assert.equal(typeof result, 'object');
  assert.equal(Array.isArray(result.skillPaths) || result.skillPaths === undefined, true);
});
