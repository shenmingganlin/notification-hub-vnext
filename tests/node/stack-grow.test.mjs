import assert from 'node:assert/strict';
import test from 'node:test';

import {
  allowedStackGrows,
  defaultStackGrow,
  resolveStackGrow,
  resolveStackWrap,
  stackGrowToNativeDirection,
  stackWrapGrow
} from '../../plugin/domain/stack-grow.js';

test('each corner allows the two directions away from the walls', () => {
  assert.deepEqual(allowedStackGrows('top-left'), { up: false, down: true, left: false, right: true });
  assert.deepEqual(allowedStackGrows('top-right'), { up: false, down: true, left: true, right: false });
  assert.deepEqual(allowedStackGrows('bottom-left'), { up: true, down: false, left: false, right: true });
  assert.deepEqual(allowedStackGrows('bottom-right'), { up: true, down: false, left: true, right: false });
});

test('default grow keeps current vertical stacking', () => {
  assert.equal(defaultStackGrow('bottom-right'), 'up');
  assert.equal(defaultStackGrow('top-left'), 'down');
  assert.equal(resolveStackGrow('bottom-right'), 'up');
  assert.equal(resolveStackGrow('top-right', 'left'), 'left');
  assert.equal(resolveStackGrow('top-right', 'up'), 'down');
  assert.equal(resolveStackGrow('bottom-right', 'right'), 'up');
});

test('native packing direction is the opposite of user-facing grow so newest stays on the corner', () => {
  assert.equal(stackGrowToNativeDirection('bottom-right'), 'down');
  assert.equal(stackGrowToNativeDirection('top-left'), 'up');
  assert.equal(stackGrowToNativeDirection('bottom-right', 'left'), 'right');
  assert.equal(stackGrowToNativeDirection('top-left', 'right'), 'left');
});

test('wrap axis is the other allowed direction from the corner', () => {
  assert.equal(stackWrapGrow('bottom-right', 'up'), 'left');
  assert.equal(stackWrapGrow('bottom-right', 'left'), 'up');
  assert.equal(stackWrapGrow('top-left', 'down'), 'right');
  assert.equal(stackWrapGrow('top-left', 'right'), 'down');
});

test('missing wrap is parallel; snake keeps native direction equal to grow', () => {
  assert.equal(resolveStackWrap(), 'parallel');
  assert.equal(resolveStackWrap('nope'), 'parallel');
  assert.equal(resolveStackWrap('off'), 'off');
  assert.equal(resolveStackWrap('snake'), 'snake');
  assert.equal(stackGrowToNativeDirection('top-left', 'right', 'snake'), 'right');
  assert.equal(stackGrowToNativeDirection('bottom-right', 'up', 'snake'), 'up');
  assert.equal(stackGrowToNativeDirection('top-left', 'right', 'parallel'), 'left');
  assert.equal(stackGrowToNativeDirection('bottom-right', 'up', 'off'), 'down');
});
