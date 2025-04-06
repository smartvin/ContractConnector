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
  public static chainID: number;
  public static accounts: any[] = [];
  public static signer: any;
  public static stakerContracts: Map<string, ethers.Contract> = new Map<string, ethers.Contract>();
  public static stakerContractsReadOnly: Map<string, ethers.Contract> = new Map<string, ethers.Contract>();

  public static usdcContract: any;
  public static usdcContractReadOnly: any;
  public static stakeTreasuryContract: any;
  public static stakeTreasuryContractReadOnly: any;
  public static web3provider: any = null;
  public static stakes: string[] = [];

  /***
   *
   * @notice here we initialize the smart contracts for the frontend
   * @param signer ethers web3 Signer
   * @return stakerContract
   *
   ***/
  static async initContracts(chain: any, network: number, signer:any): Promise<[any, any, any]> {
    let configData: any;

    ChainCode.chainID = network;
    console.log("ConfigData is %s", configDataPolygon);
    console.log("ChainCode.initContracts: using %d as chain for %s", 
      ChainCode.chainID, chain);

    // ChainCode.chainID is already a number, no need to convert
    switch (network) {
      case 80002:  // Amoy testnet
        configData = configDataAmoy;
        console.log("configData is %s", configData);
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