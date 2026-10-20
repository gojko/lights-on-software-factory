import { transientDir } from '../../transient-dir.js';

const PYTHON_AT_COMMAND_POSITION = /(?:^|[;&|(])\s*(?:(?:env|time|exec|command)\s+)*(?:\w+=\S*\s+)*(?:\S*\/)?python[\d.]*(?=[\s;&|)]|$)/;

function feedsPythonFromAHeredoc(command) {
	return command.split('\n').some((line) => line.includes('<<') && PYTHON_AT_COMMAND_POSITION.test(line));
}

const pythonHeredocRule = {
	id: 'python-heredoc',
	decision: 'deny',
	reason: () => {
		const dir = transientDir(process.env);
		return `Do not feed python its script from a heredoc. To edit a file, use the Edit or Write tool. For real scripting, save the python script into ${dir}/ with the Write tool and run it from there: \`python3 ${dir}/<name>.py\`.`;
	},
	matchRaw: feedsPythonFromAHeredoc
};

export { pythonHeredocRule };
