import { Interface } from "@ethersproject/abi";

import { BaseBuilder, BaseBuildParams } from "../base";
import { SingleTokenErc721Builder } from "../single-token/erc721";
import * as Addresses from "../../addresses";
import { Order } from "../../order";
import * as Types from "../../types";
import {
  AddressZero,
  getCurrentTimestamp,
  getRandomBytes32,
  s,
} from "../../../utils";

import Erc721Abi from "../../../common/abis/Erc721.json";

// Wyvern V2 calldata:
// `transferFrom(address from, address to, uint256 tokenId)`

const REPLACEMENT_PATTERN_BUY =
  // `transferFrom` 4byte selector
  "0x00000000" +
  // `from` (empty)
  "f".repeat(64) +
  // `to` (required)
  "0".repeat(64) +
  // `tokenId` (empty)
  "f".repeat(64);

interface BuildParams extends BaseBuildParams {
  contract: string;
}

export class ContractWideErc721Builder extends BaseBuilder {
  constructor(chainId: number) {
    super(chainId);
  }

  public isValid(order: Order) {
    try {
      const copyOrder = this.build({
        ...order.params,
        contract: order.params.target,
        side: order.params.side === Types.OrderSide.BUY ? "buy" : "sell",
        price: order.params.basePrice,
        fee: 0,
      });

      if (!copyOrder) {
        return false;
      }

      copyOrder.params.taker = order.params.taker;
      copyOrder.params.makerRelayerFee = order.params.makerRelayerFee;
      copyOrder.params.takerRelayerFee = order.params.takerRelayerFee;

      if (copyOrder.hash() !== order.hash()) {
        return false;
      }
    } catch {
      return false;
    }

    return true;
  }

  public build(params: BuildParams): Order | undefined {
    try {
      this.defaultInitialize(params);

      if (params.side === "buy") {
        return new Order(this.chainId, {
          kind: "erc721-contract-wide",
          exchange: Addresses.Exchange[this.chainId],
          maker: params.maker,
          taker: AddressZero,
          makerRelayerFee: 0,
          takerRelayerFee: params.fee,
          feeRecipient: params.feeRecipient,
          side: Types.OrderSide.BUY,
          // No dutch auctions support for now
          saleKind: Types.OrderSaleKind.FIXED_PRICE,
          target: params.contract,
          howToCall: Types.OrderHowToCall.CALL,
          calldata: new Interface(Erc721Abi).encodeFunctionData(
            "transferFrom",
            [AddressZero, params.maker, 0]
          ),
          replacementPattern: REPLACEMENT_PATTERN_BUY,
          staticTarget: AddressZero,
          staticExtradata: "0x",
          paymentToken: params.paymentToken,
          basePrice: s(params.price),
          extra: "0",
          listingTime: params.listingTime!,
          expirationTime: params.expirationTime!,
          salt: s(params.salt),
          v: params.v,
          r: params.r,
          s: params.s,
        });
      } else {
        throw new Error("Invalid side");
      }
    } catch {
      return undefined;
    }
  }

  public buildMatching = (
    order: Order,
    taker: string,
    tokenId: string
  ): Order | undefined => {
    try {
      if (order.params.side === Types.OrderSide.BUY) {
        const singleTokenBuilder = new SingleTokenErc721Builder(this.chainId);
        const matchingOrder = singleTokenBuilder.build({
          maker: taker,
          contract: order.params.target,
          tokenId,
          side: "sell",
          price: order.params.basePrice,
          paymentToken: order.params.paymentToken,
          fee: 0,
          feeRecipient: AddressZero,
          listingTime: getCurrentTimestamp(-60),
          expirationTime: 0,
          salt: getRandomBytes32(),
        })!;
        matchingOrder.params.takerRelayerFee = order.params.takerRelayerFee;

        return matchingOrder;
      } else {
        throw new Error("Invalid side");
      }
    } catch {
      return undefined;
    }
  };
}