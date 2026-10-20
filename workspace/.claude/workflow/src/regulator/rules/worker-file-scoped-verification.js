import { isWorker } from '../is-worker.js';

const VERIFICATION_COMMANDS = ['jest', 'eslint'],
	FILE_EXTENSION_RE = /\.[a-z0-9]+$/i,
	FLAGS_THAT_CARRY_A_VALUE = {
		jest: /^(-t|--testNamePattern)(=|$)/,
		eslint: /^(-f|--format)(=|$)/
	},
	FLAGS_THAT_CARRY_NOTHING = {
		eslint: /^--print-config$/
	},
	NEVER = /(?!)/,
	namesAFile = (argument) => !argument.startsWith('-') && (argument.includes('/') || FILE_EXTENSION_RE.test(argument)),
	opensAValue = (command) => (argument) => (FLAGS_THAT_CARRY_A_VALUE[command] ?? NEVER).test(argument) && !argument.includes('='),
	statesAReadOnlyFlag = (command, argumentList) => (argument, at) =>
		(FLAGS_THAT_CARRY_A_VALUE[command] ?? NEVER).test(argument) ||
		(FLAGS_THAT_CARRY_NOTHING[command] ?? NEVER).test(argument) ||
		opensAValue(command)(argumentList[at - 1] ?? ''),
	withoutTheReadOnlyFlags = (command, argumentList) =>
		argumentList.filter((argument, at) => !statesAReadOnlyFlag(command, argumentList)(argument, at)),
	everyArgumentNamesAFile = (argumentList) => argumentList.length > 0 && argumentList.every(namesAFile),
	NPM_TEST_SCRIPTS = ['test', 't'],
	isNpmTest = (tokens) => tokens[0] === 'npm' && NPM_TEST_SCRIPTS.includes(tokens[1]),
	npmTestArguments = (tokens) => (tokens[2] === '--' ? tokens.slice(3) : tokens.slice(2)),
	verificationOf = (tokens) => {
		if (isNpmTest(tokens)) {
			return { command: 'jest', argumentList: npmTestArguments(tokens) };
		}
		return VERIFICATION_COMMANDS.includes(tokens[0]) ? { command: tokens[0], argumentList: tokens.slice(1) } : undefined;
	},
	widensTheRun = ({ command, argumentList }) => !everyArgumentNamesAFile(withoutTheReadOnlyFlags(command, argumentList)),
	workerFileScopedVerificationRule = {
		id: 'worker-file-scoped-verification',
		decision: 'deny',
		appliesTo: isWorker,
		reason:
			'Run `jest <your own test file>` and `eslint <your own files>`, with a file path for every argument; a wider run reads sibling workers\' files. These read-only flags are yours: `jest … -t "<pattern>"`, `eslint … -f json`, `eslint --print-config <one file>`.',
		matchSegment: (tokens) => {
			const verification = verificationOf(tokens);
			return verification !== undefined && widensTheRun(verification);
		}
	};

export { workerFileScopedVerificationRule };
