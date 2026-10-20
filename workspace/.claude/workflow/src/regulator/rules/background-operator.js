const backgroundOperatorRule = {
	id: 'background-operator',
	decision: 'allow',
	matchSegment: (tokens) => tokens.length === 1 && tokens[0] === '&'
};

export { backgroundOperatorRule };
