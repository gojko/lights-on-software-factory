import { transientDir } from '../../transient-dir.js';

const SECONDS_A_WAIT_MAY_HOLD = 30,
	A_LOOP = /\b(?:for|while|until)\b[\s\S]*?\bdo\b[\s\S]*?\bdone\b/,
	A_COUNTED_HEAD = /\bseq\s+1\s+(\d+)\b/,
	A_SINGLE_ARGUMENT_HEAD = /\bseq\s+(\d+)\b/,
	A_HEAD_THAT_NEVER_ENDS = /\bwhile\s+(?:true|:)\b/,
	A_HEAD_THAT_TESTS_SOMETHING = /\b(?:while|until)\s+(?!true\b|:\s)/,
	A_SLEEP = /\bsleep\s+(\d+(?:\.\d+)?)\b/g;

function iterationsOf(command) {
	const counted = A_COUNTED_HEAD.exec(command) ?? A_SINGLE_ARGUMENT_HEAD.exec(command);

	if (counted) {
		return Number(counted[1]);
	}
	if (A_HEAD_THAT_NEVER_ENDS.test(command)) {
		return Infinity;
	}
	return null;
}

function sleepSecondsOf(command) {
	const found = [...command.matchAll(A_SLEEP)].map((one) => Number(one[1]));

	return found.length === 0 ? 0 : Math.max(...found);
}

function endsEarly(command) {
	return /\bbreak\b/.test(command) || A_HEAD_THAT_TESTS_SOMETHING.test(command);
}

function isABareTimer(command) {
	if (!A_LOOP.test(command) || endsEarly(command)) {
		return false;
	}
	const seconds = sleepSecondsOf(command),
		iterations = iterationsOf(command);

	if (seconds === 0 || iterations === null) {
		return false;
	}
	return iterations * seconds > SECONDS_A_WAIT_MAY_HOLD;
}

const bareWaitLoopRule = {
	id: 'bare-wait-loop',
	decision: 'deny',
	reason: () => {
		const dir = transientDir(process.env);
		return `A loop that sleeps more than 30 seconds in total and can never end early is a bare timer, and it costs a turn exactly as one long \`sleep\` does. Where THIS call starts what it waits for, start it and break on its sentinel: \`( <cmd> > ${dir}/x.log 2>&1; echo $? > ${dir}/x.rc ) & for i in $(seq 1 570); do [[ -f ${dir}/x.rc ]] && break; sleep 1; done\`. Where an earlier turn or another process started it, this call writes no sentinel and every wait costs a turn, so schedule the check instead: \`/loop 10m <what to check>\`, which runs the prompt again on its own and holds no turn between the runs.`;
	},
	matchRaw: isABareTimer
};

export { bareWaitLoopRule };
