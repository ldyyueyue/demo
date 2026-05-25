import { ClobClient } from "@polymarket/clob-client-v2";

export class PolymarketRiskManager {
    private client: ClobClient;
    private checkInterval: NodeJS.Timeout | null = null;

    constructor(clobClient: ClobClient) {
        this.client = clobClient;
    }

    /**
     * 1. 启动定时风控与对账监控
     * @param intervalMs 检查周期，建议每 30 秒 到 1 分钟对账一次
     */
    public startMonitoring(intervalMs: number = 30000) {
        console.log(`🛡️ [RISK] 风险管理模块已启动，每 ${intervalMs / 1000} 秒执行一次对账检查...`);
        
        this.checkInterval = setInterval(async () => {
            await this.reconcileBalances();
        }, intervalMs);
    }

    /**
     * 2. 核心对账逻辑：查询当前账户在平台上的所有持仓与现金余额
     */
    public async reconcileBalances() {
        try {
            console.log(`\n--- ⏳ 开始账户对账 [${new Date().toLocaleTimeString()}] ---`);

            // 并行获取平台现金余额与当前所有持仓
            const [collateralRes, samplingAssets] = await Promise.all([
                this.client.getCollateralBalance(), // 获取 L2 账户的 USDC 现金余额
                this.client.getSamplingAssets()     // 获取当前账户持有的所有有价证券代币（Shares）
            ]);

            const usdcBalance = collateralRes ? parseFloat(collateralRes.amount) : 0;
            console.log(`💵 平台 L2 可用现金余额: ${usdcBalance.toFixed(2)} USDC`);

            // 如果有持仓，循环打印并更新本地策略账本
            if (samplingAssets && samplingAssets.length > 0) {
                console.log(`📦 当前活跃持仓清单:`);
                for (const asset of samplingAssets) {
                    const tokenId = asset.asset_id;
                    const size = parseFloat(asset.size); // 持有的代币数量

                    if (size > 0) {
                        console.log(`   🔸 资产 ID: ...${tokenId.slice(-8)} | 持仓数量 (Shares): ${size}`);
                        
                        // 💡 提示：这里就是与你第三部分策略对接的地方
                        // 比如：this.strategyEngine.updateLocalInventory(tokenId, size);
                        // 如果发现本地记录的数量和 API 返回的数量不一致，以 API 返回的真实链下持仓为准！
                    }
                }
            } else {
                console.log(`ℹ️ 当前没有未平仓的头寸。`);
            }

            console.log(`-----------------------------------------------`);
        } catch (error: any) {
            console.error("❌ 对账检查捕获到异常:", error.message || error);
        }
    }

    /**
     * 3. 自动交割清算逻辑 (Redemption)
     * 当预测事件彻底结束后（Resolved），如果你买中了正确的结果，平台会将该 Token 标记为可交割。
     * 该函数负责把胜出的代币一键兑换回真正的 USDC。
     */
    public async autoRedeemWinnings() {
        console.log("⏳ 正在扫描是否有可交割的已结束市场利润...");
        try {
            // 调用官方标准交割方法
            const redeemTx = await this.client.redeem();
            
            if (redeemTx && redeemTx.hash) {
                console.log(`🎉 [SUCCESS] 利润交割清算成功！`);
                console.log(`🔗 链上结算交易哈希 (PolygonScan): https://polygonscan.com{redeemTx.hash}`);
            } else {
                console.log("ℹ️ 暂无已结束或可交割的获胜利润。");
            }
        } catch (error: any) {
            // Polymarket 如果没有任何可交割的代币，调用此方法可能会抛错，属于正常现象
            console.log("ℹ️ 自动交割检查完毕（无满足条件的清算资产）。");
        }
    }

    /**
     * 优雅停止
     */
    public stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            console.log("🛑 风险管理监控已安全停止。");
        }
    }
}
