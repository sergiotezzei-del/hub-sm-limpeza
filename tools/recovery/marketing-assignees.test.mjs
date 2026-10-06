import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/modules/marketing/marketingConfig.ts', import.meta.url), 'utf8');
const exports = {};
vm.runInNewContext(ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText, { exports });
const { getMarketingAssigneeOptions, isMarketingOperator } = exports;

test('new requests offer Maria and Murilo, without Arthur', () => {
  const options = getMarketingAssigneeOptions('');
  assert.deepEqual(Array.from(options, (option) => option.value), ['Maria', 'Murilo']);
  assert.ok(options.every((option) => !option.disabled));
});

test('Arthur remains displayed on historical requests but cannot be selected again', () => {
  const options = getMarketingAssigneeOptions('Arthur');
  assert.equal(options[0].value, 'Arthur');
  assert.equal(options[0].label, 'Arthur (histórico)');
  assert.equal(options[0].disabled, true);
  assert.deepEqual(Array.from(options.filter((option) => !option.disabled), (option) => option.value), ['Maria', 'Murilo']);
});

test('only Maria and Murilo with the Marketing role receive operational controls', () => {
  assert.equal(isMarketingOperator('maria', 'marketing'), true);
  assert.equal(isMarketingOperator('murilo', 'marketing'), true);
  assert.equal(isMarketingOperator('arthur', 'marketing'), false);
  assert.equal(isMarketingOperator('murilo', 'admin'), false);
  assert.equal(isMarketingOperator('murilo', 'sales_manager'), false);
  assert.equal(isMarketingOperator('tezzei', 'admin'), false);
});
