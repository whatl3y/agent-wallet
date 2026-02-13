import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { encodeFunctionData } from "viem";
import { getChainConfig } from "../config/chains.js";
import { getPublicClient } from "../clients.js";
import { aaveTokenAbi } from "../abis/aave-token.js";
import { governanceAbi } from "../abis/governance.js";
import { jsonResult, errorResult, type TransactionPayload } from "../utils.js";

const addressParam = z
  .string()
  .regex(/^0x[a-fA-F0-9]{40}$/)
  .describe("Ethereum address (0x-prefixed, 40 hex chars)");

/** Governance V3 core contract on Ethereum mainnet */
const GOVERNANCE_CORE = "0x9AEE0B04504CeF83A65AC3f0e838D0593BCb2BC7" as const;

export function registerGovernanceTools(server: McpServer) {
  // ── Delegate Voting Power ──────────────────────────────────────────
  server.tool(
    "aave_delegate",
    "Build transaction to delegate both voting and proposition power to another address. Ethereum only.",
    {
      delegatee: addressParam.describe("Address to delegate power to"),
    },
    async ({ delegatee }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.aaveToken) {
          return errorResult("AAVE token not configured for this chain");
        }

        const data = encodeFunctionData({
          abi: aaveTokenAbi,
          functionName: "delegate",
          args: [delegatee as `0x${string}`],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Delegate all governance power to ${delegatee}`,
              to: config.aave.aaveToken,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build delegate transaction: ${e}`);
      }
    }
  );

  // ── Delegate By Type ───────────────────────────────────────────────
  server.tool(
    "aave_delegate_by_type",
    "Build transaction to delegate either voting power or proposition power specifically. Ethereum only.",
    {
      delegatee: addressParam.describe("Address to delegate power to"),
      delegationType: z
        .enum(["voting", "proposition"])
        .describe("Type of power to delegate: 'voting' (0) or 'proposition' (1)"),
    },
    async ({ delegatee, delegationType }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.aaveToken) {
          return errorResult("AAVE token not configured for this chain");
        }

        const typeId = delegationType === "voting" ? 0 : 1;
        const data = encodeFunctionData({
          abi: aaveTokenAbi,
          functionName: "delegateByType",
          args: [delegatee as `0x${string}`, typeId],
        });

        const payload: TransactionPayload = {
          chainId: config.chain.id,
          transactions: [
            {
              step: 1,
              type: "action",
              description: `Delegate ${delegationType} power to ${delegatee}`,
              to: config.aave.aaveToken,
              data,
              value: "0",
            },
          ],
        };

        return jsonResult(payload);
      } catch (e) {
        return errorResult(`Failed to build delegate-by-type transaction: ${e}`);
      }
    }
  );

  // ── Get Proposal (read) ────────────────────────────────────────────
  server.tool(
    "aave_get_proposal",
    "Get details of an AAVE governance proposal by ID. Ethereum only.",
    {
      proposalId: z.number().int().min(0).describe("Proposal ID"),
    },
    async ({ proposalId }) => {
      try {
        const client = getPublicClient("ethereum");
        const proposal = await client.readContract({
          address: GOVERNANCE_CORE,
          abi: governanceAbi,
          functionName: "getProposal",
          args: [BigInt(proposalId)],
        });

        const stateNames = [
          "Null",
          "Created",
          "Active",
          "Queued",
          "Executed",
          "Failed",
          "Cancelled",
          "Expired",
        ];

        return jsonResult({
          proposalId,
          state: stateNames[proposal.state] ?? `Unknown(${proposal.state})`,
          creator: proposal.creator,
          votingPortal: proposal.votingPortal,
          forVotes: proposal.forVotes.toString(),
          againstVotes: proposal.againstVotes.toString(),
          creationTime: proposal.creationTime.toString(),
          votingActivationTime: proposal.votingActivationTime.toString(),
          ipfsHash: proposal.ipfsHash,
        });
      } catch (e) {
        return errorResult(`Failed to get proposal: ${e}`);
      }
    }
  );

  // ── Get Proposals Count (read) ─────────────────────────────────────
  server.tool(
    "aave_get_proposals_count",
    "Get the total number of governance proposals created. Ethereum only.",
    {},
    async () => {
      try {
        const client = getPublicClient("ethereum");
        const count = await client.readContract({
          address: GOVERNANCE_CORE,
          abi: governanceAbi,
          functionName: "getProposalsCount",
        });

        return jsonResult({ totalProposals: Number(count) });
      } catch (e) {
        return errorResult(`Failed to get proposals count: ${e}`);
      }
    }
  );

  // ── Get Delegation Info (read) ─────────────────────────────────────
  server.tool(
    "aave_get_delegation_info",
    "Get who a user has delegated their voting and proposition power to. Ethereum only.",
    {
      user: addressParam.describe("Address to check delegation for"),
    },
    async ({ user }) => {
      try {
        const config = getChainConfig("ethereum");
        if (!config.aave.aaveToken) {
          return errorResult("AAVE token not configured");
        }

        const client = getPublicClient("ethereum");
        const [votingDelegatee, propositionDelegatee] = await Promise.all([
          client.readContract({
            address: config.aave.aaveToken,
            abi: aaveTokenAbi,
            functionName: "getDelegateeByType",
            args: [user as `0x${string}`, 0],
          }),
          client.readContract({
            address: config.aave.aaveToken,
            abi: aaveTokenAbi,
            functionName: "getDelegateeByType",
            args: [user as `0x${string}`, 1],
          }),
        ]);

        return jsonResult({
          user,
          votingDelegatee,
          propositionDelegatee,
        });
      } catch (e) {
        return errorResult(`Failed to get delegation info: ${e}`);
      }
    }
  );
}
