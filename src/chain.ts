import assert from "assert";
import { ethers, Wallet } from "ethers";
import Ganache, { EthereumProvider, Server } from "ganache";
import winston, { format } from 'winston';
import 'winston-daily-rotate-file';

import { grabFreePort, isPortReachable } from "./utils/port";

import FluxP2PFactory from 'fpo-node/dist/src/modules/p2p/FluxP2PFactory.json';
export class PrivateChain {
  private server: Server<"ethereum">;
  private provider: EthereumProvider;
  private port: number;

  constructor(port: number, output_dir: string) {
    const logger = winston.createLogger({
      format: format.combine(
        format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
        format.metadata({ fillExcept: ['message', 'level', 'timestamp', 'label'] }),
      ),
      transports: [
        new winston.transports.DailyRotateFile({
          level: 'debug',
          filename: 'blockchain-%DATE%.logs',
          datePattern: 'YYYY-MMM-DD',
          zippedArchive: true,
          dirname: output_dir,
          format: format.printf((info) => {
            if (info.metadata?.error) {
              return `${info.timestamp} ${info.level}: ${info.message} ${info.metadata.error}`
            }

            return `${info.timestamp} ${info.level}: ${info.message}`
          }),
          maxFiles: '14d',
        })
      ]
    });

    const options = {
      chain: {
        networkId: 5777,
        chainId: 5777,
      },
      logging: {
        logger: {
          log: (msg: string) => {
            if (!msg.startsWith('evm') && !msg.startsWith('eth')) {
              logger.info(msg);
              msg = '';
            }
          },
          verbose: true,
        }
      }
    };

    this.server = Ganache.server(options);
    this.provider = this.server.provider;
    this.port = port;
  }

  async start() {
    if (await isPortReachable(this.port, { host: 'localhost' })) {
      console.error(`Configured port '${this.port}' for blockchain not available.`)
      this.port = await grabFreePort(new Set());
    }
    await this.provider.initialize();
    await this.server.listen(this.port, '127.0.0.1');
    console.log(`Blockchain started on '${this.port}'`);
  }

  async set_account_balance(address: string, balance: string) {
    // TODO handle this result.
    const result = await this.provider.send("evm_setAccountBalance", [address, balance]);
  }

  async create_address(): Promise<Wallet> {
    const wallet = Wallet.createRandom();
    // TODO handle this result.
    const result = await this.provider.send("evm_addAccount", [wallet.address, ""]);
    await this.set_account_balance(wallet.address, "0x3635C9ADC5DEA00000");
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
      }
    ]);

    const { status, contractAddress } = await this.provider.send(
      "eth_getTransactionReceipt",
      [transactionHash]
    );

    assert.strictEqual(status, "0x1", "Contract was not deployed");
    return contractAddress;
  }

  get_first_account(): any {
    let accounts = this.provider.getInitialAccounts()
    const objArray: { address: string; data: { unlocked: boolean; secretKey: string; balance: bigint; }; }[] = [];
    Object.keys(accounts).forEach(key => objArray.push({
      address: ethers.utils.getAddress(key),
      data: accounts[key]
    }));

    return objArray[0];
  }
}
