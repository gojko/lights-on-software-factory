import { describe, expect, test } from '@jest/globals';

import { holdsProcessSubstitution } from '../../src/regulator/holds-process-substitution.js';

describe('holdsProcessSubstitution', () => {
	test.each([
		['comm -3 <(sort -u a.txt) <(sort -u b.txt)'],
		['diff <(cat a) <(cat b)'],
		['tee >(cat) < in.txt'],
		['node <(echo x)'],
		['while read l; do echo $l; done < <(ls)']
	])('"%s" → true', (command) => {
		expect(holdsProcessSubstitution(command)).toBe(true);
	});

	test.each([
		[`grep '<(' file.txt`],
		[`grep '>(' file.txt`],
		['echo "a >( b"'],
		['sort -u a.txt > out.txt'],
		['wc -l < in.txt'],
		['echo $(date)'],
		['test 1 -lt 2 && echo yes'],
		['awk "NR<10 && /x/{print}" file.txt']
	])('"%s" → false', (command) => {
		expect(holdsProcessSubstitution(command)).toBe(false);
	});
});
