import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Agent } from '../dist/agents/agent.js';
import { ToolExecutor } from '../dist/agents/tools.js';
import { Blackboard } from '../dist/coordination/blackboard.js';
import { costOf } from '../dist/pricing.js';

function tmpProject(name) {
  return mkdtempSync(path.join(tmpdir(), `parallel-${name}-`));
}

function registerAgent(board, id = 'agent-1', name = 'Agent-A') {
  board.registerAgent({
    id,
    name,
    alias: 'a1',
    color: 'cyan',
    task: 'test task',
    model: 'test-model',
    state: 'working',
    currentAction: '',
    steps: 0,
    tokensIn: 0,
    tokensOut: 0,
    cost: 0,
    startedAt: Date.now(),
  });
}

test('tracks real-time per-agent cost from token usage', async () => {
  const projectRoot = tmpProject('cost');
  const board = new Blackboard(projectRoot);
  const price = { input: 0.15, output: 0.6 };
  const llm = {
    async chat() {
      return {
        tokensIn: 1000,
        tokensOut: 2000,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-1',
              type: 'function',
              function: {
                name: 'task_complete',
                arguments: JSON.stringify({ summary: 'verified' }),
              },
            },
          ],
        },
      };
    },
  };

  const agent = new Agent({
    id: 'agent-1',
    name: 'Agent-A',
    alias: 'a1',
    color: 'cyan',
    task: 'finish the task',
    model: 'gpt-4o-mini',
    llm,
    board,
    projectRoot,
    maxSteps: 3,
    requestApproval: async () => true,
    requestQuestion: async () => 'recommended',
    price,
    skills: [],
  });

  await agent.run();

  const info = board.agents.get('agent-1');
  assert.equal(info.state, 'done');
  assert.equal(info.tokensIn, 1000);
  assert.equal(info.tokensOut, 2000);
  assert.equal(info.cost, costOf(price, 1000, 2000));
});

test('ask_user asks at most three questions and resumes the agent with the answer', async () => {
  const projectRoot = tmpProject('questions');
  const board = new Blackboard(projectRoot);
  registerAgent(board);
  const asked = [];
  const executor = new ToolExecutor(
    board,
    'agent-1',
    'Agent-A',
    projectRoot,
    async () => true,
    async (_agentId, question, options, recommended) => {
      asked.push({ question, options, recommended });
      return options[recommended];
    },
    [],
  );

  for (let i = 0; i < 3; i++) {
    const result = await executor.execute('ask_user', {
      question: `Choose option ${i + 1}?`,
      options: ['risky', 'safe'],
      recommended: 1,
    });
    assert.match(result, /The user answered: "safe"/);
    assert.equal(board.agents.get('agent-1').state, 'working');
  }

  const limited = await executor.execute('ask_user', {
    question: 'Fourth question?',
    options: ['no', 'yes'],
    recommended: 0,
  });

  assert.equal(asked.length, 3);
  assert.match(limited, /Question limit reached \(3 per task\)/);
});
