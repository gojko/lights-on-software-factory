const FALLBACK_NAME = 'there';

const nameToGreet = (name) => name.trim() || FALLBACK_NAME;

export const formatGreeting = function (name = '') {
	return `Hello, ${nameToGreet(name)}!`;
};
