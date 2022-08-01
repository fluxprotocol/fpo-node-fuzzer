import { PrivateChain } from "./chain";
import { P2PFuzzer } from "./fuzzers/p2p/fuzzer";


async function main() {
  P2PFuzzer.fuzz();
  // const pc = new PrivateChain(8888)
  // await pc.start();
  // const wallet = await pc.create_address();
}

(async () => main())()