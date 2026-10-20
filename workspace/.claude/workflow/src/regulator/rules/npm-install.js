import { regexAskRule } from '../regex-ask-rule.js';

const npmInstallRule = regexAskRule({
	id: 'npm-install',
	regex: /^npm\s+(install|i)(\s|$)/,
	reason: "Confirm before running 'npm install'."
});

export { npmInstallRule };
