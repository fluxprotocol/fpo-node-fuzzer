import net from 'node:net';

import { randNumberFromRange } from './utils';

interface PortOptions {
	readonly host: string;
	readonly timeout?: number;
}

export async function isPortReachable(port: number, options: PortOptions) {
	if (typeof options.host !== 'string') {
		throw new TypeError('Specify a `host`');
	}
	const timeout = options.timeout ? options.timeout : 1000;

	const promise = new Promise(((resolve, reject) => {
		const socket = new net.Socket();

		const onError = () => {
			socket.destroy();
			reject();
		};

		socket.setTimeout(timeout);
		socket.once('error', onError);
		socket.once('timeout', onError);

		socket.connect(port, options.host, () => {
			socket.end();
			resolve(true);
		});
	}));

	try {
		await promise;
		return true;
	} catch {
		return false;
	}
}

export async function grabFreePort(taken: Set<number>): Promise<number> {
	let port: number = randNumberFromRange(8000, 12000);

	while (await isPortReachable(port, { host: 'localhost' }) && !taken.has(port)) {
		port = randNumberFromRange(8000, 12000);
	}
	taken.add(port);

	return port;
}