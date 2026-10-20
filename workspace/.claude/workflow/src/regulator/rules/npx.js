const npxRule = {
	id: 'npx',
	decision: 'deny',
	reason: 'Project policy forbids `npx`. Install the tool and invoke it directly.',
	matchSegment: (tokens) => tokens[0] === 'npx'
};

export { npxRule };
