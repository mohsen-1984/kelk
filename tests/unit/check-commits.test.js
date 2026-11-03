/**
 * tools/check-commits.js (plan P3.1): the commit-message rule (CLAUDE.md -> Contributors and commits).
 */
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { ROOT } = require('./helpers');
const { checkMessage, contributorNames } = require('../../tools/check-commits.js');

const NAMES = ['Zarrabi', 'Hasan Nejad'];

test('contributorNames: the names of .claude/contributors.json', function () {
  assert.deepEqual(contributorNames(ROOT), NAMES);
});

test('checkMessage: a subject prefixed with a contributor name passes, merge commits included', function () {
  assert.deepEqual(checkMessage('Zarrabi: P3.1 commit check', NAMES), []);
  assert.deepEqual(checkMessage('Hasan Nejad: fix table widths\n\nBody text.\n', NAMES), []);
  assert.deepEqual(checkMessage('Zarrabi: Merge P2.4 Site quality jobs (PR #14)', NAMES), []);
  assert.deepEqual(checkMessage('Zarrabi: line one\r\n\r\nCo-authored-by: Hasan Nejad <mhn.com@gmail.com>', NAMES), []);
});

test('checkMessage: a missing, unknown, partial or empty prefix fails', function () {
  [
    'Fix table widths',
    'Merge pull request #15 from mohsen-1984/p3',
    'Ali Zarrabi: fix',            // a git name, not a contributor name
    'zarrabi: fix',                // case matters
    'Zarrabi fix',                 // no colon
    'Zarrabi:fix',                 // no space
    'Hasan: fix',                  // part of a name
    'Zarrabi: ',                   // nothing after the prefix
    ' Zarrabi: fix',               // leading space
    ''
  ].forEach(function (m) {
    const p = checkMessage(m, NAMES);
    assert.equal(p.length, 1, JSON.stringify(m));
    assert.match(p[0], /subject does not start with "<Name>: "/);
  });
});

test('checkMessage: Claude attribution lines fail (the lines .githooks/commit-msg strips)', function () {
  const cases = [
    ['Co-authored-by: Claude <noreply@anthropic.com>', /co-author/],
    ['co-authored-by: Claude Opus <x@y>', /co-author/],
    ['Co-Authored-By: someone <bot@anthropic.com>', /co-author/],
    ['🤖 Generated with [Claude Code](https://claude.com/claude-code)', /Generated with/],
    ['Generated with Claude Code', /Generated with/],
    ['Claude-Session: https://claude.ai/code/session_x', /Claude-Session/]
  ];
  cases.forEach(function (c) {
    const p = checkMessage('Zarrabi: change\n\nBody.\n\n' + c[0] + '\n', NAMES);
    assert.equal(p.length, 1, c[0]);
    assert.match(p[0], c[1]);
  });
  // both rules at once: two problems
  assert.equal(checkMessage('change\n\nCo-authored-by: Claude <noreply@anthropic.com>', NAMES).length, 2);
});
