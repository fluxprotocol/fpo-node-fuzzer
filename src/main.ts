import { P2PFuzzer } from "./fuzzers/p2p/fuzzer";

async function main() {
  P2PFuzzer.fuzz();
}

(async () => main())()