import { ethers, Wallet } from "ethers";
import Ganache, { EthereumProvider, Server, ServerOptions } from "ganache";
import { grabFreePort, isPortReachable } from "./utils/port";
import FluxP2PFactory from '../FluxP2PFactory.json';
import assert from "assert";


export class PrivateChain {
  private server: Server<"ethereum">;
  // private provider: EthereumProvider;
  private provider: ethers.providers.Web3Provider;
  private port: number;
  creator: Wallet;

  constructor(port: number) {
    const options = {
      chain: {
        networkId: 1313161555,
        chainId: 1313161555,
      }
    };
    this.server = Ganache.server(options);
    this.server.provider
    this.port = port;
    this.provider = new ethers.providers.Web3Provider(this.server.provider as unknown as ethers.providers.ExternalProvider);
    this.creator = Wallet.createRandom();
  }

  async start() {
    if (await isPortReachable(this.port, { host: 'localhost' })) {
      console.error(`Configured port '${this.port}' for blockchain not available.`)
      this.port = await grabFreePort(new Set());
    }
    await this.server.listen(this.port, 'localhost');
    console.log(`network`, await this.provider.getNetwork());
    console.log(`Blockchain started on '${this.port}'`);
    const result = await this.server.provider.send("evm_addAccount", [this.creator.address, ""]);
    this.provider = new ethers.providers.Web3Provider(this.server.provider as unknown as ethers.providers.ExternalProvider);
    console.log(`network`, await this.provider.getNetwork());
    await this.set_account_balance(this.creator.address, "0xffffffff");
  }

  async set_account_balance(address: string, balance: string) {
    // TODO handle this result.
    const result = await this.server.provider.send("evm_setAccountBalance", [address, balance]);
  }

  async create_address(): Promise<Wallet> {
    const wallet = Wallet.createRandom();
    // TODO handle this result.
    const result = await this.server.provider.send("evm_addAccount", [wallet.address, ""]);
    await this.set_account_balance(wallet.address, "0xffffffff");
    return wallet;
  }

  used_port(): number {
    return this.port;
  }

  async deploy(): Promise<any> {
    const [from] = Object.keys(this.server.provider.getInitialAccounts());

    console.log("**deploying contract from account: ", from);
    console.log("**deploying contract from account: ", this.creator.address);
    const transactionHash = await this.server.provider.send("eth_sendTransaction", [
      {
        from,
        data: FluxP2PFactory.bytecode,
        gas: "0xffffff"
      }
    ]);

    const { status, contractAddress } = await this.server.provider.send(
      "eth_getTransactionReceipt",
      [transactionHash]
    );

    assert.strictEqual(status, "0x1", "Contract was not deployed");
    return contractAddress;
  }

  get_first_account(): any {
    let x = this.server.provider.getInitialAccounts()
    const objArray: { address: string; data: { unlocked: boolean; secretKey: string; balance: bigint; }; }[] = [];
    Object.keys(x).forEach(key => objArray.push({
      address: key,
      data: x[key]
    }));

    return objArray[0];
  }
}
