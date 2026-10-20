const testPathPatternRule = {
	id: 'test-path-pattern',
	decision: 'deny',
	reason: '--testPathPattern is deprecated. Use --testNamePattern, or pass the test file path positionally.',
	matchSegment: (tokens) => tokens.some((t) => t === '--testPathPattern' || t.startsWith('--testPathPattern='))
};

export { testPathPatternRule };
