import { ClobClient, Side, OrderType } from "@polymarket/clob-client-v2";

export class PolymarketOrderExecutor {
    private client: ClobClient;
    private isTrading: boolean = false;

    // 风控参数配置
    private readonly MIN_TRADE_AMOUNT_USDC = 5.0; // 官方通常限制最低交易额
    private readonly FIXED_TRADE_VOLUME_USDC = 1.0; // 示例：每笔信号默认下注 10 USDC

    constructor(clobClient: ClobClient) {
        this.client = clobClient;
    }

    /**
     * 核心下单方法：同时对 YES 和 NO 两个市场执行套利吃单
     * @param yesTokenId YES 资产 ID
     * @param yesPrice 预期的 YES 买入价（卖一价）
     * @param noTokenId NO 资产 ID
     * @param noPrice 预期的 NO 买入价（卖一价）
     */
    public async executeArbitrageOrders(
        yesTokenId: string, 
        yesPrice: string, 
        noTokenId: string, 
        noPrice: string,
        share: string,
        side: boolean
    ) {
        // 防止上一个订单还没处理完，重复触发高频并发导致资金冲突（锁逻辑）
        if (this.isTrading) {
            console.log("⏳ 上一笔套利订单正在执行中，跳过当前信号...");
            return;
        }

        this.isTrading = true;
        console.log(`\n🚀 [TRADE] 正在启动双向套利原子下单流程...`);

        try {
            // 1. 根据分配的 USDC 资金，反推需要买入的 Shares（代币数量）
            // 数量 = 投入金额 / 代币单价
            // const yesShares = (this.FIXED_TRADE_VOLUME_USDC / yesPrice).toFixed(2);
            // const noShares = (this.FIXED_TRADE_VOLUME_USDC / noPrice).toFixed(2);

            console.log(`📝 正在构建订单 | YES: 价格 $${yesPrice}, 数量 ${share} | NO: 价格 $${noPrice}, 数量 ${share}`);

            // 2. 构造 Polymarket 标准 V2 限价单结构 (为了确保高频吃单成功，限价单价格可以稍微往上浮动 0.005 作为滑点保护)
            if(side){
                const yesOrderArgs:any = {
                tokenId: yesTokenId,
                price: (parseFloat((yesPrice) + 0.002).toFixed(3)), // 稍微垫高价格确保吃单
                size: parseFloat(share),
                side: "BUY" // 或者是 "SELL" 视策略而定
            };
            console.log("⏳ 正在进行本地签名并提交至 CLOB 撮合中心...YES方向");
            const yesResponse = await this.client.createOrder(yesOrderArgs);
            this.verifyOrderStatus("YES", yesResponse);
            }else{
                const noOrderArgs: any = {
                tokenId: noTokenId,
                price: (parseFloat((noPrice) + 0.002).toFixed(3)),
                size: parseFloat(share),
                side: "BUY"
            };
            console.log("⏳ 正在进行本地签名并提交至 CLOB 撮合中心...NO方向");
            const noResponse = await this.client.createOrder(noOrderArgs);
            this.verifyOrderStatus("NO", noResponse);
            }


            // 3. 并行向 Polymarket CLOB 服务器提交订单（降低网络延迟延迟差异）
            // console.log("⏳ 正在进行本地签名并提交至 CLOB 撮合中心...");
            
            // const [yesResponse, noResponse] = await Promise.all([
            //     this.client.createOrder(yesOrderArgs),
            //     this.client.createOrder(noOrderArgs)
            // ]);

            // 4. 检查并追踪订单执行结果
            // this.verifyOrderStatus("YES", yesResponse);
            // this.verifyOrderStatus("NO", noResponse);

        } catch (error: any) {
            console.error("❌ 订单执行阶段发生严重异常:", error.message || error);
        } finally {
            // 无论成功还是失败，最终都要解锁，允许脚本响应下一个套利信号
            this.isTrading = false;
        }
    }

    /**
     * 验证并打印订单状态
     */
    private verifyOrderStatus(label: string, response: any) {
        if (response && response.success) {
            console.log(`✅ [${label} 订单发送成功] 订单 ID: ${response.orderID || "已进入撮合队列"}`);
            // 💡 提示：高级套利机器人会在这里继续调用 client.getOrder(orderId) 来轮询确保状态是 "FILLED" 还是 "PARTIAL"
        } else {
            console.error(`❌ [${label} 订单被平台拒绝] 原因:`, response?.errorMsg || JSON.stringify(response));
        }
    }
}
