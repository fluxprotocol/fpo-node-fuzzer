import { cpus } from 'node:os';
import fs from 'fs';

import { FuzzConfig, UnparsedFuzzConfig } from "../../interfaces/IFuzzer";
import { NodeConfig } from '../../interfaces/Config';

import { Pair } from 'fpo-node/dist/src/modules/p2p/models/P2PConfig';

import { JSONPeerId } from "peer-id";
import YAML from 'yaml';
import { randNumberFromRange } from '../../utils/utils';

interface UnparsedP2PConfig {
  min_nodes?: number;
  max_nodes?: number;
  pairs?: Pair[];
  generate_peer_ids: boolean;
  max_decimals?: number;
  string_bytes?: number;
  peer_ids?: JSONPeerId[];
  allow_disconnects: boolean;
  disconnect_interval_min?: number;
  disconnect_interval_max?: number;
  random_disconnect_chance?: number;
  reconnect_interval_min?: number;
  reconnect_interval_max?: number;
  randomly_update_nodes: boolean;
  update_nodes_chance?: number;
  randomly_update_reports: boolean;
  update_reports_chance?: number;
  outdated_rounds_allowed?: number;
  major_update_chance?: number;
  minor_update_chance?: number;
  window?: number;
  creatorAddress: string;
  creatorPrivKeyEnv: string;
}

export interface UnparsedP2PFuzzConfig extends UnparsedFuzzConfig {
  node_config: NodeConfig;
  p2p_config: UnparsedP2PConfig;
}

interface P2PConfig {
  pairs: Pair[];
  num_nodes: number;
  peer_ids: JSONPeerId[];
  max_decimals: number;
  string_bytes: number;
  allow_disconnects: boolean;
  disconnect_interval_min: number;
  disconnect_interval_max: number;
  random_disconnect_chance: number;
  reconnect_interval_min: number;
  reconnect_interval_max: number;
  randomly_update_nodes: boolean;
  update_nodes_chance: number;
  randomly_update_reports: boolean;
  update_reports_chance: number;
  outdated_rounds_allowed: number;
  major_update_chance: number;
  minor_update_chance: number;
  window: number;
  creatorAddress: string;
  creatorPrivKeyEnv: string;
}

export interface P2PFuzzConfig extends FuzzConfig {
  node_config: NodeConfig;
  p2p_config: P2PConfig;
}

function P2PFuzzConfigFrom(unparsed: UnparsedP2PFuzzConfig): P2PFuzzConfig {
  const num_nodes = randNumberFromRange(unparsed.p2p_config.min_nodes ?? 2, unparsed.p2p_config.max_nodes ?? 20);
  return {
    num_pairs: randNumberFromRange(unparsed.min_pairs ?? 1, unparsed.max_pairs ?? 7),
    node_config: unparsed.node_config,
    p2p_config: {
      pairs: unparsed.generate_pairs ? [] : unparsed.p2p_config.pairs!,
      num_nodes,
      peer_ids: unparsed.p2p_config.generate_peer_ids ? [] : unparsed.p2p_config.peer_ids!,
      max_decimals: unparsed.p2p_config.max_decimals ?? 8,
      string_bytes: unparsed.p2p_config.string_bytes ?? 8,
      allow_disconnects: unparsed.p2p_config.allow_disconnects,
      disconnect_interval_min: unparsed.p2p_config.disconnect_interval_min ?? 180_000,
      disconnect_interval_max: unparsed.p2p_config.disconnect_interval_max ?? 200_000,
      random_disconnect_chance: unparsed.p2p_config.random_disconnect_chance ?? 15,
      reconnect_interval_max: unparsed.p2p_config.reconnect_interval_max ?? 300_000,
      reconnect_interval_min: unparsed.p2p_config.reconnect_interval_min ?? 180_000,
      randomly_update_nodes: unparsed.p2p_config.randomly_update_nodes,
      update_nodes_chance: unparsed.p2p_config.update_nodes_chance ?? 15,
      randomly_update_reports: unparsed.p2p_config.randomly_update_reports,
      update_reports_chance: unparsed.p2p_config.update_reports_chance ?? 15,
      outdated_rounds_allowed: unparsed.p2p_config.outdated_rounds_allowed ?? 3,
      major_update_chance: unparsed.p2p_config.major_update_chance ?? 15,
      minor_update_chance: unparsed.p2p_config.minor_update_chance ?? 15,
      window: unparsed.p2p_config.window ?? cpus().length,
      creatorAddress: unparsed.p2p_config.creatorAddress,
      creatorPrivKeyEnv: unparsed.p2p_config.creatorPrivKeyEnv,
    }
  };
}


function defaultFuzzConfig(path: string) {
  const p2p_fuzz_config: UnparsedP2PFuzzConfig = {
    generate_ports: true,
    generate_pairs: true,
    min_pairs: 1,
    max_pairs: 7,
    node_config: {
      networks: ["evm"],
      interval: 180000,
      deviation: 0.3,
    },
    p2p_config: {
      min_nodes: 3,
      max_nodes: 10,
      generate_peer_ids: true,
      allow_disconnects: false,
      randomly_update_nodes: false,
      randomly_update_reports: false,
      creatorAddress: "fill me in",
      creatorPrivKeyEnv: "fill me in",
    },
  };
  const yaml = YAML.stringify(p2p_fuzz_config);
  fs.writeFileSync(path, yaml);
}

export function parseFuzzConfig(path: string): P2PFuzzConfig {
  if (fs.existsSync(path)) {
    const file = fs.readFileSync(path, 'utf-8');
    const config: UnparsedP2PFuzzConfig = YAML.parse(file);

    if (!config.generate_pairs && config.p2p_config.pairs === undefined) throw new Error("You must specify pairs if the generate pairs feature is turned off.");
    if (!config.p2p_config.generate_peer_ids && config.p2p_config.peer_ids === undefined) throw new Error("You must specify peer ids if the generate peer ids feature is turned off.");
    if (!config.generate_ports && config.ports === undefined) throw new Error("You must specify ports if the generate ports feature is turned off.");

    if (config.p2p_config.window !== undefined && config.p2p_config.window <= 0) throw new Error("Window must be >= 1");

    return P2PFuzzConfigFrom(config);
  } else {
    defaultFuzzConfig(path);
    throw new Error('Config does not exist generating...');
  }
}