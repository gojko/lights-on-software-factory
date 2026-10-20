export const noComments = {
	meta: {
		type: 'suggestion',
		fixable: 'whitespace',
		docs: {
			description:
				'Disallow every comment that is not a JSDoc block. A file states its meaning in its names and in its code, and a comment beside it is a second statement that nothing keeps in step. Behaviour is stated in a test, purpose in an intention-revealing name, history in a commit message. A JSDoc block is exempt because a tool reads it — an editor, a type checker — so it is an interface and not prose. A block comment whose WHOLE content is a `@jest-environment` pragma is exempt for the same reason: it is an instruction to the test runner, and its removal makes a file fall back to the node environment in silence. A block that carries the pragma AND prose is reported, and its author splits it. `jsdoc: false` and `eslintDirectives: false` tighten the rule to every comment, which is what a test file carries: a rule a test cannot obey is answered by writing the test differently, never by silencing the rule in place. The removal is behind the `fix` option and is OFF by default: a comment can carry something worth keeping, so a sweep turns the option on deliberately and a person reads the diff.'
		},
		schema: [
			{
				type: 'object',
				properties: {
					fix: { type: 'boolean' },
					jsdoc: { type: 'boolean' },
					eslintDirectives: { type: 'boolean' }
				},
				additionalProperties: false
			}
		],
		messages: {
			comment:
				'A comment is not allowed here. Say it in a name, or make the code say it — a named constant, a named helper, a smaller function. State behaviour in a test, and history in the commit message. Delete the comment when it repeats what the code already states.'
		}
	},
	create(context) {
		const sourceCode = context.sourceCode ?? context.getSourceCode(),
			options = context.options[0] ?? {},
			removes = options.fix === true,
			keepsJsdoc = options.jsdoc !== false,
			keepsDirectives = options.eslintDirectives !== false,
			lineStartOf = (start) => sourceCode.text.lastIndexOf('\n', start - 1) + 1,
			lineEndOf = (end) => (sourceCode.text.indexOf('\n', end) === -1 ? sourceCode.text.length : sourceCode.text.indexOf('\n', end) + 1),
			holdsTheWholeLine = ([start, end]) =>
				sourceCode.text.slice(lineStartOf(start), start).trim() === '' && sourceCode.text.slice(end, lineEndOf(end)).trim() === '',
			removalOf = ([start, end]) => (holdsTheWholeLine([start, end]) ? [lineStartOf(start), lineEndOf(end)] : [start - sourceCode.text.slice(lineStartOf(start), start).match(/[\t ]*$/u)[0].length, end]),
			contentOf = (comment) =>
				comment.value
					.split('\n')
					.map((line) => line.replace(/^[\t ]*\*+[\t ]*/u, '').trim())
					.filter((line) => line !== '')
					.join(' '),
			statesTheEnvironmentAndNothingElse = (comment) => comment.type === 'Block' && /^@jest-environment[\t ]+\S+$/u.test(contentOf(comment)),
			isJsdoc = (comment) => comment.type === 'Block' && /^\*(?!\*)/u.test(comment.value),
			isEslintDirective = (comment) => /^(?:eslint\b|eslint-|global\b|globals\b|exported\b)/u.test(comment.value.trim()),
			isHashbang = (comment) => comment.type === 'Hashbang' || comment.type === 'Shebang',
			isAllowed = (comment) =>
				isHashbang(comment)
				|| statesTheEnvironmentAndNothingElse(comment)
				|| (keepsJsdoc && isJsdoc(comment))
				|| (keepsDirectives && isEslintDirective(comment));

		return {
			'Program:exit'() {
				sourceCode
					.getAllComments()
					.filter((comment) => !isAllowed(comment))
					.forEach((comment) =>
						context.report({
							loc: comment.loc,
							messageId: 'comment',
							...(removes ? { fix: (fixer) => fixer.removeRange(removalOf(comment.range)) } : {})
						})
					);
			}
		};
	}
};
