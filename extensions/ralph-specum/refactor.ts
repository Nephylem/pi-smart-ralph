const REFACTOR_ALLOWED_FILES = Object.freeze(["requirements", "design", "tasks"]);

function emptyRefactorOptions() {
	return {
		reference: null,
		file: null,
	};
}

export function parseRefactorArgs(args = []) {
	const options = emptyRefactorOptions();

	for (let index = 0; index < args.length; index += 1) {
		const token = args[index];
		if (typeof token !== "string" || token.trim() === "") continue;

		if (token.startsWith("--file")) {
			const valueResult = readFileOptionValue(args, index, token);
			if (!valueResult.ok) return failParse(options, valueResult.error);
			if (!REFACTOR_ALLOWED_FILES.includes(valueResult.value)) {
				return failParse(options, `Unsupported --file value: ${valueResult.value}. Expected one of: ${REFACTOR_ALLOWED_FILES.join(", ")}.`);
			}
			options.file = valueResult.value;
			index = valueResult.index;
			continue;
		}

		if (token.startsWith("--")) {
			return failParse(options, `Unsupported /ralph-refactor option: ${token}`);
		}

		if (options.reference) {
			return failParse(options, `Unexpected /ralph-refactor argument: ${token}`);
		}

		options.reference = token;
	}

	return { ok: true, options };
}

function readFileOptionValue(args, index, token) {
	if (token === "--file") {
		const value = args[index + 1];
		if (typeof value !== "string" || value.trim() === "" || value.startsWith("--")) {
			return {
				ok: false,
				error: `Missing value for --file. Expected one of: ${REFACTOR_ALLOWED_FILES.join(", ")}.`,
			};
		}
		return { ok: true, value: value.trim(), index: index + 1 };
	}

	if (!token.startsWith("--file=")) {
		return { ok: false, error: `Unsupported /ralph-refactor option: ${token}` };
	}

	const value = token.slice("--file=".length).trim();
	if (!value) {
		return {
			ok: false,
			error: `Missing value for --file. Expected one of: ${REFACTOR_ALLOWED_FILES.join(", ")}.`,
		};
	}

	return { ok: true, value, index };
}

function failParse(options, message) {
	return {
		ok: false,
		options: { ...options },
		error: new Error(message),
	};
}
