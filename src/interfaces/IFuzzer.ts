import { PrivateChain } from "../chain";

export interface UnparsedFuzzConfig {
  generate_ports: boolean;
  ports?: number[];
  generate_pairs: boolean;
  min_pairs?: number;
  max_pairs?: number;
}

export interface FuzzConfig {
  num_pairs: number;
}


export abstract class IFuzzer {
  abstract chain: PrivateChain;
  abstract config: FuzzConfig;
  abstract type: string;

  abstract init(): void;
  static fuzz() { };
  abstract gen_pair(): any;
  abstract gen_pairs(): any[];
  abstract gen_node_config(): any;
}