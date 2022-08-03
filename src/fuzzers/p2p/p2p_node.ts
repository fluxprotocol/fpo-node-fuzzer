import PeerId from 'peer-id';

import { UnparsedAppConfig } from 'fpo-node/dist/src/models/AppConfig';
import { Pair } from 'fpo-node/dist/src/modules/p2p/models/P2PConfig';

export class P2PNodeInfo {
	id: number;
	port: number;
	peerId: PeerId;
	address: string;
	privateKeyEnv: string;
	rpc: string;

	constructor(id: number, port: number, peerId: PeerId, address: string, privateKeyEnv: string, rpc: string) {
		this.id = id;
		this.port = port;
		this.peerId = peerId;
		this.address = address;
		this.privateKeyEnv = privateKeyEnv;
		this.rpc = rpc;
	}

	createNodeConfig(creator: string, interval: number, deviation: number, peers: P2PNodeInfo[], pairs: Pair[], contractAddress: String): UnparsedAppConfig {
		return {
			"p2p": {
				"peer_id": this.peerId.toJSON(),
				// @ts-ignore
				"addresses": {
					"listen": [`/ip4/127.0.0.1/tcp/${this.port}/p2p/${this.peerId.toB58String()}`],
				},
				"peers": peers.map(peer => {
					return `/ip4/127.0.0.1/tcp/${peer.port}/p2p/${peer.peerId.toB58String()}`;
				}),
			},
			"networks": [
				{
					"type": "evm",
					"networkId": 1313161555,
					"chainId": 1313161555,
					"privateKeyEnvKey": this.privateKeyEnv,
					"rpc": this.rpc,
				}
			],
			"modules": [
				{
					"networkId": 1313161555,
					// @ts-ignore
					"contractAddress": contractAddress,
					"deviationPercentage": deviation,
					"minimumUpdateInterval": 1800000,
					"pairs": pairs,
					"interval": interval,
					"logFile": `node${this.id}_logs`,
					"creator": creator,
					"signers": [creator, ...peers.map(peer => peer.address)],
					"type": "P2PModule"
				}
			]
		};
	}
}
