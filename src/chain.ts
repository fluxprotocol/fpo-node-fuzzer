import { Wallet } from "ethers";
import Ganache, { EthereumProvider, Server } from "ganache";
import { grabFreePort, isPortReachable } from "./utils/port";


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
  }

  async set_account_balance(address: string, balance: string) {
    const result = await this.provider.send("evm_setAccountBalance", [address, balance]);
  }

  async create_address(): Promise<Wallet> {
    const wallet = Wallet.createRandom();
    const result = await this.provider.send("evm_addAccount", [wallet.address, ""]);
    this.set_account_balance(wallet.address, "0x1000000");
    return wallet;
  }
}
