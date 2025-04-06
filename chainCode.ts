import { ethers } from "ethers";

import stakerMultiChoiceContractJson from "./abis/SingleStake.sol/SingleStake.json";
import stakerExactScoreContractJson from "./abis/ScoreStake.sol/ScoreStake.json";
import usdcContractJson from "./abis/MyUSDC.sol/MyUSDC.json";
import stakeTreasuryContractJson from "./abis/StakeTreasury.sol/StakeTreasury.json";
import configDataAmoy from "./deployAddresses.amoy.json";
import configDataPolygon from "./deployAddresses.polygon.json";
import { EventClassFactory } from "./eventSubscription";
import * as Events from "./events.types";


export type stakerContract = {
  name: string;
  address: string; // 40-bit address of smart contract in Hex
  type: string;
};

export class ChainCode {
  public static USE_WC = true;
  public static WALLET_CONNECTED = false;
  public static chainID: number;
  public static accounts: any[] = [];
  public static signer: any;
  public static stakerContracts: Map<string, ethers.Contract> = new Map<string, ethers.Contract>();
  public static stakerContractsReadOnly: Map<string, ethers.Contract> = new Map<string, ethers.Contract>();

  public static usdcContract: any;
  public static usdcContractReadOnly: any;
  public static stakeTreasuryContract: any;
  public static stakeTreasuryContractReadOnly: any;
  public static nfticket: any;
  public static web3provider: any = null;
  public static stakes: string[] = [];

  static async wc_initWallet(provider: any, address: string, chainID: number, signer: any) {
    console.log("Starting wc_initWallet...");
    console.log("Provider:", provider);
    console.log("Address:", address);
    console.log("ChainID:", chainID);

    try {
      ChainCode.chainID = chainID;
      ChainCode.accounts[0] = address;
      ChainCode.WALLET_CONNECTED = true;
      console.log("WALLET_CONNECTED=%s", ChainCode.WALLET_CONNECTED);
      console.log("initializing ChainCode with address %s on chain %s", address, chainID);

      // Store the original WalletConnect provider for write operations
      ChainCode.web3provider = provider;

      // Create a signer that uses the WalletConnect provider directly
      ChainCode.signer = signer;
      console.log("We are signing with %s", await ChainCode.signer.address);

      // Initialize contracts with both providers
      await ChainCode.initContracts();
      console.log("wc_initWallet completed successfully");
      return true;
    } catch (error) {
      console.error("Error in wc_initWallet:", error);
      ChainCode.WALLET_CONNECTED = false;
      throw error;
    }
  }

  static async initWallet(): Promise<any> {
    if (process.env.REACT_APP_USE_WC === "false") {
      try {
        if (window.ethereum) {
          await window?.ethereum.request({
            method: "eth_requestAccounts",
          });
          let window_accounts: any = await window?.ethereum.request({
            method: "eth_accounts",
          });
          ChainCode.accounts = ((window_accounts === undefined) ? [] : window_accounts);
          if (window_accounts === undefined) {
            throw new Error("no eth_accounts found");
          } else {
            ChainCode.web3provider = new ethers.BrowserProvider(
              window?.ethereum as any
            );
            let chainIDBN: bigint = (await ChainCode.web3provider.getNetwork()).chainId;
            ChainCode.chainID = Number(chainIDBN);
            ChainCode.WALLET_CONNECTED = true;
            ChainCode.signer = await ChainCode.web3provider.getSigner(ChainCode.accounts[0]);
          }
        } else {
          throw new Error("no browser EOA wallet found");
        }
      } catch (error) {
        if (error instanceof Error) {
          alert(error.message);
          return Promise.resolve("");
        }
      }
    } else {
      throw new Error("We are not in MetaMask mode");
    }
    return Promise.resolve(ChainCode.signer);
  }
  /***
   *
   * @notice here we initialize the smart contracts for the frontend
   * @param signer ethers web3 Signer
   * @return stakerContract
   *
   ***/
  static async initContracts(): Promise<[any, any, any]> {
    let configData: any;
    let signer: any;

    console.log("USE_WC = %s", ChainCode.USE_WC);
    signer = await ChainCode.signer;
    console.log("using %s as chain", ChainCode.chainID);

    // ChainCode.chainID is already a number, no need to convert
    switch (ChainCode.chainID) {
      case 80002:  // Amoy testnet
        configData = configDataAmoy;
        break;
      case 137:    // Polygon mainnet
        configData = configDataPolygon;
        break;
      default:
        throw new Error(`Unsupported chain ID: ${ChainCode.chainID}. Please switch to Amoy testnet (80002) or Polygon mainnet (137).`);
    }

    const usdcContractAddress = configData.myUSDC;

    // Create a JsonRpcProvider for read operations using the RPC URL directly
    const rpcUrl = ChainCode.chainID === 80002
      ? 'https://rpc-amoy.polygon.technology'
      : 'https://polygon-rpc.com';
    const readProvider = new ethers.JsonRpcProvider(rpcUrl);

    let availableStakes: stakerContract[] = configData.STAKER_ADDRESSES;
    let i = 0;
    availableStakes.forEach(function (availableStake) {
      ChainCode.stakes.push(availableStake.name);

      // Create write-enabled contract for transactions
      const writeContract = new ethers.Contract(
        availableStake.address,
        availableStake.type === "MULTIPLE_CHOICE"
          ? stakerMultiChoiceContractJson.abi
          : stakerExactScoreContractJson.abi,
        signer
      );
      ChainCode.stakerContracts.set(ChainCode.stakes[i], writeContract);

      // Create read-only contract for reading data
      const readOnlyContract = new ethers.Contract(
        availableStake.address,
        availableStake.type === "MULTIPLE_CHOICE"
          ? stakerMultiChoiceContractJson.abi
          : stakerExactScoreContractJson.abi,
        readProvider
      );
      ChainCode.stakerContractsReadOnly.set(ChainCode.stakes[i], readOnlyContract);
      i++;
    }); // forEach()

    // Create write-enabled USDC contract
    ChainCode.usdcContract = new ethers.Contract(
      usdcContractAddress,
      usdcContractJson.abi,
      signer
    );

    // Create read-only USDC contract
    ChainCode.usdcContractReadOnly = new ethers.Contract(
      usdcContractAddress,
      usdcContractJson.abi,
      readProvider
    );
    console.log("USDC contract = %s", ChainCode.usdcContract.target);

    // Create write-enabled treasury contract
    const addressStakeTreasury = configData.TREASURY_ADDRESS;
    ChainCode.stakeTreasuryContract = new ethers.Contract(
      addressStakeTreasury,
      stakeTreasuryContractJson.abi,
      signer
    );

    // Create read-only treasury contract
    ChainCode.stakeTreasuryContractReadOnly = new ethers.Contract(
      addressStakeTreasury,
      stakeTreasuryContractJson.abi,
      readProvider
    );

    return [
      ChainCode.usdcContract,
      ChainCode.stakeTreasuryContract,
      ChainCode.stakerContracts,
    ];
  } // static async initContracts
} // class