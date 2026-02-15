import { formatEther, formatUnits, erc20Abi } from "viem";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import type { BalanceInfo, TokenBalanceInfo, NFTBalanceInfo } from "../types.js";
import { getPublicClient } from "../evm/provider.js";
import { getEVMChainConfig, EVM_CHAINS } from "../evm/chains.js";
import { getEVMAccount } from "../evm/wallet.js";
import { getConnection } from "../solana/transaction.js";
import { getSolanaClusterConfig, SOLANA_CLUSTERS } from "../solana/clusters.js";
import { getSolanaKeypair } from "../solana/wallet.js";

export async function getEVMBalance(chainName: string): Promise<BalanceInfo> {
  const config = getEVMChainConfig(chainName);
  const publicClient = getPublicClient(chainName);
  const account = getEVMAccount();

  const balance = await publicClient.getBalance({
    address: account.address,
  });

  return {
    chain: config.name,
    address: account.address,
    nativeBalance: formatEther(balance),
    nativeSymbol: config.nativeSymbol,
  };
}

export async function getSolanaBalance(
  clusterName: string
): Promise<BalanceInfo> {
  const config = getSolanaClusterConfig(clusterName);
  const connection = getConnection(clusterName);
  const keypair = getSolanaKeypair();

  const balance = await connection.getBalance(keypair.publicKey);

  return {
    chain: config.name,
    address: keypair.publicKey.toBase58(),
    nativeBalance: (balance / LAMPORTS_PER_SOL).toString(),
    nativeSymbol: config.nativeSymbol,
  };
}

export async function getBalance(chainName: string): Promise<BalanceInfo> {
  if (chainName.toLowerCase() in SOLANA_CLUSTERS) {
    return getSolanaBalance(chainName);
  }
  if (chainName.toLowerCase() in EVM_CHAINS) {
    return getEVMBalance(chainName);
  }
  throw new Error(
    `Unknown chain: ${chainName}. Supported EVM: ${Object.keys(EVM_CHAINS).join(", ")}. Supported Solana: ${Object.keys(SOLANA_CLUSTERS).join(", ")}`
  );
}

// ── ERC20 Token Balance ──────────────────────────────────────────────

export async function getERC20Balance(
  chainName: string,
  tokenAddress: string,
  owner?: string
): Promise<TokenBalanceInfo> {
  const config = getEVMChainConfig(chainName);
  const publicClient = getPublicClient(chainName);
  const ownerAddress = (owner || getEVMAccount().address) as `0x${string}`;
  const token = tokenAddress as `0x${string}`;

  const [rawBalance, decimals, symbol, name] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [ownerAddress],
    }),
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "name",
    }),
  ]);

  return {
    chain: config.name,
    owner: ownerAddress,
    tokenAddress,
    symbol: symbol as string,
    name: name as string,
    decimals: decimals as number,
    balance: formatUnits(rawBalance as bigint, decimals as number),
    rawBalance: (rawBalance as bigint).toString(),
  };
}

// ── ERC721 NFT Balance ───────────────────────────────────────────────

const erc721Abi = [
  {
    inputs: [{ name: "owner", type: "address" }],
    name: "balanceOf",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "name",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "symbol",
    outputs: [{ name: "", type: "string" }],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      { name: "owner", type: "address" },
      { name: "index", type: "uint256" },
    ],
    name: "tokenOfOwnerByIndex",
    outputs: [{ name: "", type: "uint256" }],
    stateMutability: "view",
    type: "function",
  },
] as const;

// ── Parameterized variants (for per-user wallets) ───────────────────

export async function getBalanceFor(
  chainName: string,
  address: string
): Promise<BalanceInfo> {
  const lower = chainName.toLowerCase();

  if (lower in SOLANA_CLUSTERS) {
    const config = getSolanaClusterConfig(lower);
    const connection = getConnection(lower);
    const pubkey = new PublicKey(address);
    const balance = await connection.getBalance(pubkey);

    return {
      chain: config.name,
      address,
      nativeBalance: (balance / LAMPORTS_PER_SOL).toString(),
      nativeSymbol: config.nativeSymbol,
    };
  }

  if (lower in EVM_CHAINS) {
    const config = getEVMChainConfig(lower);
    const publicClient = getPublicClient(lower);
    const balance = await publicClient.getBalance({
      address: address as `0x${string}`,
    });

    return {
      chain: config.name,
      address,
      nativeBalance: formatEther(balance),
      nativeSymbol: config.nativeSymbol,
    };
  }

  throw new Error(
    `Unknown chain: ${chainName}. Supported EVM: ${Object.keys(EVM_CHAINS).join(", ")}. Supported Solana: ${Object.keys(SOLANA_CLUSTERS).join(", ")}`
  );
}

export async function getERC20BalanceFor(
  chainName: string,
  tokenAddress: string,
  ownerAddress: string
): Promise<TokenBalanceInfo> {
  const config = getEVMChainConfig(chainName);
  const publicClient = getPublicClient(chainName);
  const owner = ownerAddress as `0x${string}`;
  const token = tokenAddress as `0x${string}`;

  const [rawBalance, decimals, symbol, name] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "decimals",
    }),
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "symbol",
    }),
    publicClient.readContract({
      address: token,
      abi: erc20Abi,
      functionName: "name",
    }),
  ]);

  return {
    chain: config.name,
    owner,
    tokenAddress,
    symbol: symbol as string,
    name: name as string,
    decimals: decimals as number,
    balance: formatUnits(rawBalance as bigint, decimals as number),
    rawBalance: (rawBalance as bigint).toString(),
  };
}

export async function getERC721BalanceFor(
  chainName: string,
  tokenAddress: string,
  ownerAddress: string
): Promise<NFTBalanceInfo> {
  const config = getEVMChainConfig(chainName);
  const publicClient = getPublicClient(chainName);
  const owner = ownerAddress as `0x${string}`;
  const token = tokenAddress as `0x${string}`;

  const [rawBalance, name, symbol] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [owner],
    }),
    publicClient.readContract({
      address: token,
      abi: erc721Abi,
      functionName: "name",
    }),
    publicClient.readContract({
      address: token,
      abi: erc721Abi,
      functionName: "symbol",
    }),
  ]);

  const balance = rawBalance as bigint;
  const tokenIds: string[] = [];

  const maxToFetch = balance < 50n ? Number(balance) : 50;
  for (let i = 0; i < maxToFetch; i++) {
    try {
      const tokenId = await publicClient.readContract({
        address: token,
        abi: erc721Abi,
        functionName: "tokenOfOwnerByIndex",
        args: [owner, BigInt(i)],
      });
      tokenIds.push((tokenId as bigint).toString());
    } catch {
      break;
    }
  }

  return {
    chain: config.name,
    owner,
    tokenAddress,
    name: name as string,
    symbol: symbol as string,
    balance: balance.toString(),
    tokenIds,
  };
}

export async function getERC721Balance(
  chainName: string,
  tokenAddress: string,
  owner?: string
): Promise<NFTBalanceInfo> {
  const config = getEVMChainConfig(chainName);
  const publicClient = getPublicClient(chainName);
  const ownerAddress = (owner || getEVMAccount().address) as `0x${string}`;
  const token = tokenAddress as `0x${string}`;

  const [rawBalance, name, symbol] = await Promise.all([
    publicClient.readContract({
      address: token,
      abi: erc721Abi,
      functionName: "balanceOf",
      args: [ownerAddress],
    }),
    publicClient.readContract({
      address: token,
      abi: erc721Abi,
      functionName: "name",
    }),
    publicClient.readContract({
      address: token,
      abi: erc721Abi,
      functionName: "symbol",
    }),
  ]);

  const balance = rawBalance as bigint;
  const tokenIds: string[] = [];

  // Try to enumerate token IDs via ERC721Enumerable (optional extension)
  const maxToFetch = balance < 50n ? Number(balance) : 50;
  for (let i = 0; i < maxToFetch; i++) {
    try {
      const tokenId = await publicClient.readContract({
        address: token,
        abi: erc721Abi,
        functionName: "tokenOfOwnerByIndex",
        args: [ownerAddress, BigInt(i)],
      });
      tokenIds.push((tokenId as bigint).toString());
    } catch {
      // Contract doesn't support ERC721Enumerable — that's fine
      break;
    }
  }

  return {
    chain: config.name,
    owner: ownerAddress,
    tokenAddress,
    name: name as string,
    symbol: symbol as string,
    balance: balance.toString(),
    tokenIds,
  };
}
