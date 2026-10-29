import { allowCommands } from '../../../src/regulator/allow-commands.js';

export default [
	allowCommands({
		id: 'custom-allow-hello',
		commands: ['hello']
	})
];
