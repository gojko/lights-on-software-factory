export default {
	projects: [
		{
			displayName: 'project',
			roots: ['<rootDir>/src', '<rootDir>/tests'],
			transform: {}
		},
		{
			displayName: 'tooling',
			roots: ['<rootDir>/.claude/workflow/src', '<rootDir>/.claude/workflow/tests'],
			transform: {}
		}
	]
};
