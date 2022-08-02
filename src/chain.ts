import { Wallet } from "ethers";
import Ganache, { EthereumProvider, Server } from "ganache";
import { grabFreePort, isPortReachable } from "./utils/port";
import FluxP2PFactory from '../FluxP2PFactory.json';
import assert from "assert";


export class PrivateChain {
  private server: Server<"ethereum">;
  private provider: EthereumProvider;
  private port: number;

  constructor(port: number) {
    this.server = Ganache.server();
    this.provider = this.server.provider;
    this.port = port;
  }

  async start() {
    if (await isPortReachable(this.port, { host: 'localhost' })) {
      console.error(`Configured port '${this.port}' for blockchain not available.`)
      this.port = await grabFreePort(new Set());
    }
    await this.server.listen(this.port, "localhost");
    console.log(`Blockchain started on '${this.port}'`);
    let ca = await this.deploy();
    console.log("**deployed contract to address: ", ca)
  }

  async set_account_balance(address: string, balance: string) {
    // TODO handle this result.
    const result = await this.provider.send("evm_setAccountBalance", [address, balance]);
  }
  
  async create_address(): Promise<Wallet> {
    const wallet = Wallet.createRandom();
    // TODO handle this result.
    const result = await this.provider.send("evm_addAccount", [wallet.address, ""]);
    await this.set_account_balance(wallet.address, "0x1000000");
    return wallet;
  }

  used_port(): number {
		return this.port;
	}

  async deploy(): Promise<any> {

    let [from] = Object.keys(this.provider.getInitialAccounts());

    console.log("**deploying contract from account: ", from);
    const transactionHash = await this.provider.send("eth_sendTransaction", [
      {
        from,
        data: FluxP2PFactory.bytecode,
        gas: "0xffffff"
      } as any
    ]);

    const { status, contractAddress } = await this.provider.send(
      "eth_getTransactionReceipt",
      [transactionHash]
    );
    assert.strictEqual(status, "0x1", "Contract was not deployed");
    return contractAddress;
  }
}
