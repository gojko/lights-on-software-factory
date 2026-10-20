import { describe, test, expect } from '@jest/globals';
import { allowCommands } from '../../src/regulator/allow-commands.js';

describe('allowCommands', () => {
	test('returns a rule with the supplied id and decision allow', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls', 'cat'] });
		expect(rule.id).toBe('utilities');
		expect(rule.decision).toBe('allow');
	});

	test('does NOT carry a reason (allow decisions need no explanation)', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls'] });
		expect(rule.reason).toBeUndefined();
	});

	test('matches a bare command (exact, no args)', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls'] });
		expect(rule.matchSegment(['ls'])).toBe(true);
	});

	test('matches a command with arguments', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls'] });
		expect(rule.matchSegment(['ls', '-la', '/tmp'])).toBe(true);
	});

	test('does not match a different command that starts with the same letters', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls'] });
		expect(rule.matchSegment(['lsof'])).toBe(false);
	});

	test('matches any command in the list', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls', 'cat', 'grep'] });
		expect(rule.matchSegment(['cat', '/etc/hosts'])).toBe(true);
		expect(rule.matchSegment(['grep', 'foo'])).toBe(true);
	});

	test('does not match a command not in the list', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls', 'cat'] });
		expect(rule.matchSegment(['rm', '-rf', '/'])).toBe(false);
	});

	test('matches multi-word command prefixes like "docker compose"', () => {
		const rule = allowCommands({ id: 'docker-readonly', commands: ['docker compose', 'docker ps'] });
		expect(rule.matchSegment(['docker', 'compose', 'config'])).toBe(true);
		expect(rule.matchSegment(['docker', 'ps', '-a'])).toBe(true);
	});

	test('a multi-word prefix does not match a different subcommand of the same root', () => {
		const rule = allowCommands({ id: 'docker-readonly', commands: ['docker compose'] });
		expect(rule.matchSegment(['docker', 'image', 'rm'])).toBe(false);
	});

	test('an "npm t" prefix does not match "npm test" (token boundary preserved)', () => {
		const rule = allowCommands({ id: 'npm-shortcuts', commands: ['npm t'] });
		expect(rule.matchSegment(['npm', 't'])).toBe(true);
		expect(rule.matchSegment(['npm', 't', 'foo'])).toBe(true);
		expect(rule.matchSegment(['npm', 'test'])).toBe(false);
	});

	test('throws when id is missing', () => {
		expect(() => allowCommands({ commands: ['ls'] })).toThrow();
	});

	test('throws when commands is missing or empty', () => {
		expect(() => allowCommands({ id: 'utilities' })).toThrow();
		expect(() => allowCommands({ id: 'utilities', commands: [] })).toThrow();
	});

	test('returned matchSegment is pure (identical input → identical output)', () => {
		const rule = allowCommands({ id: 'utilities', commands: ['ls'] });
		expect(rule.matchSegment(['ls'])).toBe(rule.matchSegment(['ls']));
	});
});
