import fs from 'fs';
import cluster, { Worker } from 'node:cluster';

import PeerId from 'peer-id';

import main from 'fpo-node/dist/src/main';
import { latestVersion, new_version, P2PVersion, toString } from 'fpo-node/dist/src/p2p/models/P2PVersion';
import { sleep } from 'fpo-node/dist/src/services/TimerUtils';
import { Pair } from 'fpo-node/dist/src/modules/p2p/models/P2PConfig';

import { parseFuzzConfig, P2PFuzzConfig } from "./config";
import { randNumberFromRange, randomString, random_item } from '../../utils/utils';
import { IFuzzer } from '../../interfaces/IFuzzer';
import { END_POINTS, SOURCE_PATHS } from '../../pair';
import { P2PNodeInfo } from './p2p_node';
import { grabFreePort } from '../../utils/port';
import { PrivateChain } from '../../chain';

interface NodeCluster {
	[id: number]: {
		index: string,
		node_version: P2PVersion,
		report_version: P2PVersion,
		output_dir: string,
	}
}

export class P2PFuzzer extends IFuzzer {
	chain: PrivateChain;
	config: P2PFuzzConfig;
	output_dir: string;
	type: string = "Fuzzer";

	nodes: P2PNodeInfo[];
	pairs: Pair[];
	peer_ids: PeerId[];
	ports: number[];
	contract_address: String

	constructor(path: string) {
		super();
		function exitHandler(code: number) {
			console.log(`exited with code: ${code}`)

			if (cluster.worker) {
				const workers = cluster.workers;
				for (const worker in workers) {
					workers[worker]!.kill();
				}
			}
		}
		process.on('exit', exitHandler);
		process.on('SIGINT', exitHandler);


		if (!fs.existsSync('.fuzz')) {
			fs.mkdirSync('.fuzz');
		}

		this.output_dir = process.env.FUZZ_LOGS = process.env.OUTPUT_DIR = `.fuzz/${randomString(8)}-${randomString(8)}-${randomString(8)}-${randomString(8)}`;
		if (!fs.existsSync(this.output_dir)) {
			fs.mkdirSync(this.output_dir);
		}

		this.config = parseFuzzConfig(path);
		this.chain = new PrivateChain(this.config.blockchain_port);

		this.nodes = new Array(this.config.p2p_config.num_nodes).fill(null);
		this.pairs = this.config.p2p_config.pairs.length === 0 ?
			this.gen_pairs()
			: this.config.p2p_config.pairs;
		this.peer_ids = new Array(this.config.p2p_config.num_nodes).fill(null);
		this.ports = new Array(this.config.p2p_config.num_nodes).fill(0);
		this.contract_address = "";
	}

	async init() {
		await this.chain.start();
		this.contract_address = await this.chain.deploy()
		console.log("**deployed contract to address: ", this.contract_address);
		const creator = this.chain.get_first_account();
		console.log("**creator", creator)
		this.config.p2p_config.creatorAddress = creator.address;
		process.env[this.config.p2p_config.creatorPrivKeyEnv] = creator.data.secretKey;

		// Set the port in case configured one was taken.
		this.config.blockchain_port = this.chain.used_port();
		let taken_ports: Set<number> = new Set();
		this.ports = await Promise.all(this.ports.map(async (_: number) => await grabFreePort(taken_ports)));
		this.peer_ids = await Promise.all(this.config.p2p_config.peer_ids.length === 0 ?
			this.peer_ids.map(async (_) => await PeerId.create())
			: this.config.p2p_config.peer_ids.map(async (id) => await PeerId.createFromJSON(id)));

		fs.writeFileSync(
			`${this.output_dir}/config_info.json`,
			JSON.stringify({
				num_nodes: this.config.p2p_config.num_nodes,
				ports: this.ports,
				peer_ids: this.peer_ids,
				pairs: this.pairs,
			},
				null,
				2
			));

		await this.gen_node_config();
	}

	gen_pair(): Pair {
		return {
			"pair": randomString(randNumberFromRange(1, this.config.p2p_config.string_bytes)),
			"decimals": randNumberFromRange(1, this.config.p2p_config.max_decimals),
			"sources": [
				{
					"source_path": SOURCE_PATHS.random_element(),
					"end_point": END_POINTS.random_element(),
				}
			]
		}
	}

	gen_pairs(): Pair[] {
		return Array(this.config.num_pairs).fill(null).map(
			(_: null, index: number) =>
				this.gen_pair()
		)
			.filter((pair, index, self) => {
				return index === self.findIndex((t) =>
					t.pair === pair.pair
					&& t.decimals === pair.decimals
					&& t.sources[0].source_path === pair.sources[0].source_path
					&& t.sources[0].end_point === pair.sources[0].end_point
				)
			});;
	}

	async gen_node_config() {
		const rpc_url = `http://localhost:${this.config.blockchain_port}`;
		this.nodes = await Promise.all(this.nodes.map(async (_, id) => {
			if (id === 0) {
				// manually set our creator node.
				return new P2PNodeInfo(
					0,
					this.ports[0],
					this.peer_ids[0],
					this.config.p2p_config.creatorAddress,
					this.config.p2p_config.creatorPrivKeyEnv,
					rpc_url
				);
			}
			const wallet = await this.chain.create_address();
			let privateKeyEnv = `EVM_PRIVATE_KEY${id}`;
			process.env[privateKeyEnv] = wallet.privateKey;
			return new P2PNodeInfo(
				id,
				this.ports[id],
				this.peer_ids[id],
				wallet.address,
				privateKeyEnv,
				rpc_url
			);
		}));
	}

	async fuzz_main_thread() {
		const node_configs = this.nodes.map((value, index) => {
			const peers = [...this.nodes.slice(0, index), ...this.nodes.slice(index + 1)];
			return value.createNodeConfig(this.config.p2p_config.creatorAddress, this.config.node_config.interval, this.config.node_config.interval, peers, this.pairs, this.contract_address);
		});

		let node_version = new_version(`${randNumberFromRange(0, 3)}.${randNumberFromRange(2, 8)}.${randNumberFromRange(3, 11)}`);
		let latest_node_version = node_version;
		let report_version = new_version(`${randNumberFromRange(2, 4)}.${randNumberFromRange(0, 1)}.${randNumberFromRange(1, 6)}`);
		let latest_report_version = node_version;
		process.env.P2P_NODE_VERSION = toString(node_version);
		process.env.P2P_REPORT_VERSION = toString(report_version);
		let nodes_version_mismatch = false;
		let reports_version_mismatch = false;

		let workers: NodeCluster = {};
		if (this.config.p2p_config.window > 0) {
			const windowed = node_configs.window(this.config.p2p_config.window);
			windowed.forEach((window, index) => {
				const window_file = `${process.env.OUTPUT_DIR}/window_${index}.json`;
				fs.writeFileSync(
					window_file,
					JSON.stringify({
						configs: window,
					},
						null,
						2
					));
				process.env.CHILD_INDEX = index.toString();
				let new_worker = cluster.fork(process.env).on('reconnect', (child: Worker) => cluster.emit('reconnect', child));
				workers[new_worker.id] = {
					index: process.env.CHILD_INDEX,
					node_version,
					report_version,
					output_dir: process.env.OUTPUT_DIR!,
				};
			});
		}

		let resetting_node_version = false;
		let resetting_report_version = false;
		cluster.on('reconnect', async (child: Worker) => {
			console.log(`in reconnect`);
			child.process.kill();
			// Remain disconnected for a random interval
			await sleep(randNumberFromRange(
				this.config.p2p_config.reconnect_interval_min,
				this.config.p2p_config.reconnect_interval_max
			));
			const node_cluster = workers[child.id];
			delete workers[child.id];
			process.env.CHILD_INDEX = node_cluster.index;

			// Snapshot previous version
			// This is done to prevent accidentally updating other killed nodes.
			// i.e. covers more simulation cases
			let prev_node_version = process.env.P2P_NODE_VERSION;
			if (resetting_node_version) {
				process.env.P2P_NODE_VERSION = toString(latest_node_version);
				prev_node_version = process.env.P2P_NODE_VERSION;
				resetting_node_version = false;
				nodes_version_mismatch = false;
			} else if (this.config.p2p_config.randomly_update_nodes && randNumberFromRange(0, 100) <= this.config.p2p_config.update_nodes_chance) {
				let major = node_cluster.node_version.major;
				let minor = node_cluster.node_version.minor;
				let patch = node_cluster.node_version.patch;

				let num = randNumberFromRange(0, 100);
				console.log(`update major ${num}, ${num <= 100} `)
				if (num <= this.config.p2p_config.major_update_chance) {
					major += 1;
					minor = 0;
					patch = 0;
					// we only care if there is a major version mismatch.
					// as the others should still function.
					nodes_version_mismatch = true;
				} else if (randNumberFromRange(0, 100) <= this.config.p2p_config.minor_update_chance ?? 20) {
					minor += 1;
					patch = 0;
				} else {
					patch += 1;
				}
			}

			let prev_report_version = process.env.P2P_REPORT_VERSION;
			if (resetting_report_version) {
				process.env.P2P_REPORT_VERSION = toString(latest_report_version);
				prev_node_version = process.env.P2P_REPORT_VERSION;
				resetting_report_version = false;
				reports_version_mismatch = false;
			} else if (this.config.p2p_config.randomly_update_reports && randNumberFromRange(0, 100) <= this.config.p2p_config.update_reports_chance) {
				let major = node_cluster.report_version.major;
				let minor = node_cluster.report_version.minor;
				let patch = node_cluster.report_version.patch;

				let num = randNumberFromRange(0, 100);
				if (num <= this.config.p2p_config.major_update_chance) {
					major += 1;
					minor = 0;
					patch = 0;
					// we only care if there is a major version mismatch.
					// as the others should still function.
					reports_version_mismatch = true;
				} else if (randNumberFromRange(0, 100) <= this.config.p2p_config.minor_update_chance) {
					minor += 1;
					patch = 0;
				} else {
					patch += 1;
				}

				const new_v = new_version(`${major}.${minor}.${patch} `);
				process.env.P2P_REPORT_VERSION = toString(new_v);
				latest_report_version = latestVersion(new_v, report_version);
				console.log(`Updating reports in thread: ${process.env.CHILD_INDEX} to version ${process.env.P2P_REPORT_VERSION} `);
			}

			console.log(`Reconnecting nodes in thread: ${process.env.CHILD_INDEX} `);
			let new_worker = cluster.fork(process.env).on('reconnect', (child: Worker) => cluster.emit('reconnect', child));

			// restore version if not major change
			workers[new_worker.id] = {
				index: process.env.CHILD_INDEX,
				node_version: new_version(process.env.P2P_NODE_VERSION!),
				report_version: new_version(process.env.P2P_REPORT_VERSION!),
				output_dir: node_cluster.output_dir,
			};
			process.env.P2P_NODE_VERSION = prev_node_version;
			process.env.P2P_REPORT_VERSION = prev_report_version;
		});

		let node_rounds_outdated = 0;
		let reports_rounds_outdated = 0;
		while (true) {
			await sleep(randNumberFromRange(
				this.config.p2p_config.disconnect_interval_min,
				this.config.p2p_config.disconnect_interval_max
			));

			if (this.config.p2p_config.allow_disconnects && randNumberFromRange(0, 100) <= this.config.p2p_config.random_disconnect_chance) {
				const worker = random_item(cluster.workers!);
				process.env.DC_INDEX = workers[worker.id].index;
				console.log(`Disconnecting nodes in thread: ${process.env.DC_INDEX} `);
				worker.emit('reconnect', worker);
			}

			if (nodes_version_mismatch) {
				// TODO need a way to redo remaining nodes at latest version after a few runs
				if (node_rounds_outdated <= this.config.p2p_config.outdated_rounds_allowed) {
					node_rounds_outdated++;
					console.log(`node_rounds_outdated: ${node_rounds_outdated} `);
				} else {
					node_rounds_outdated = 0;
					const workers = cluster.workers!;
					resetting_node_version = true;
					console.log(`Resetting all nodes to latest version: ${toString(latest_node_version)} `);
					for (const worker in workers) {
						const non_null = workers[worker]!;
						non_null.emit('reconnect', non_null);
					}

					continue;
				}
			}

			if (reports_version_mismatch) {
				if (reports_rounds_outdated <= this.config.p2p_config.outdated_rounds_allowed) {
					reports_rounds_outdated++;
					console.log(`node_rounds_outdated: ${reports_rounds_outdated} `);
				} else {
					reports_rounds_outdated = 0;
					const workers = cluster.workers!;
					resetting_report_version = true;
					console.log(`Resetting all reports to latest version: ${toString(latest_node_version)} `);
					for (const worker in workers) {
						const non_null = workers[worker]!;
						non_null.emit('reconnect', non_null);
					}

					continue;
				}
			}
		}
	}

	static async fuzz() {
		if (cluster.isPrimary) {
			try {
				const fuzzer = new P2PFuzzer(process.argv.slice(2)[0]);
				await fuzzer.init();
				await fuzzer.fuzz_main_thread();
			} catch (err) {
				console.log(`err: `, err);
			}
		} else {
			process.env.FUZZ_LOGS = process.env.OUTPUT_DIR!;
			const config_str = fs.readFileSync(`${process.env.OUTPUT_DIR!}/window_${process.env.CHILD_INDEX!}.json`, 'utf8');
			const config_json = JSON.parse(config_str);
			for (const config of config_json.configs) {
				main(config);
			}
		}
	}
}

