import test from 'node:test'
import assert from 'node:assert'
import { parseThemeChoice, wantsDark } from './theme.ts'

test('parseThemeChoice: valid choices pass through', () => {
  assert.strictEqual(parseThemeChoice('light'), 'light')
  assert.strictEqual(parseThemeChoice('dark'), 'dark')
  assert.strictEqual(parseThemeChoice('system'), 'system')
})

test('parseThemeChoice: unknown / null -> system', () => {
  assert.strictEqual(parseThemeChoice(null), 'system')
  assert.strictEqual(parseThemeChoice(''), 'system')
  assert.strictEqual(parseThemeChoice('blue'), 'system')
})

test('wantsDark: explicit choices ignore the OS flag', () => {
  assert.strictEqual(wantsDark('dark', false), true)
  assert.strictEqual(wantsDark('light', true), false)
})

test('wantsDark: system defers to the OS flag', () => {
  assert.strictEqual(wantsDark('system', true), true)
  assert.strictEqual(wantsDark('system', false), false)
})
