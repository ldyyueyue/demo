import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import { ClobClient } from "@polymarket/clob-client-v2";
import {ethers} from "ethers";
import { DateTime } from "luxon";
import * as dotenv from "dotenv";

// 引入我们之前写的模块（假设在同级目录下）
import { PolymarketPollingEngine } from "./GetMarketFromRest"; // 第二、三部分
import { PolymarketOrderExecutor } from "./Order"; // 第四部分
import { PolymarketRiskManager } from "./Redeem";   // 第五部分

// 加载环境变量
dotenv.config();

async function bootstrap() {
    console.log("🚀 正在启动 Polymarket 全自动化套利机器人...");

    // 1. 初始化交易客户端 (对应第一部分逻辑)
    const account = privateKeyToAccount(process.env.PRIVATE_KEY as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: polygon, transport: http(process.env.POLYGON_RPC_URL) });
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY!);
    const myCreds: any = {
        apiKey: process.env.CLOB_API_KEY,
        apiSecret: process.env.CLOB_SECRET,
        apiPassphrase: process.env.CLOB_PASS_PHRASE
    }
    
    const clobClient = new ClobClient({
        host: "https://clob.polymarket.com",
        signer:wallet as any,
        chain: 137,
        creds:myCreds,
    });

    // 2. 实例化执行器与风控管理
    const executor = new PolymarketOrderExecutor(clobClient);
    const riskManager = new PolymarketRiskManager(clobClient);

    // 启动定时对账监控 (每 60 秒一次)
    riskManager.startMonitoring(60000);
    // 启动时顺便做一次利润自动交割
    await riskManager.autoRedeemWinnings();

    // 3. 启动行情监听与策略引擎 (这里以 REST 轮询版为例)
    let TARGET_SLUG = "btc-updown-5m-"; 
    let time:any = DateTime.now().setZone("America/New_York");
    let minuteTime:any = Math.floor(time/1000);
    let nowTime:any = Math.floor(minuteTime/300)*300;
    TARGET_SLUG+=nowTime;
    console.log("slug:"+TARGET_SLUG);
    const pollInterval = 2000; // 2秒轮询一次
    let buyShare:any = "2";
    const tradingEngine = new PolymarketPollingEngine(TARGET_SLUG, pollInterval, clobClient, buyShare);
    
    // 💡 提示：在你的 tradingEngine 内部，当触发条件时，直接调用 executor.executeArbitrageOrders(...) 即可
    await tradingEngine.start();
}

bootstrap().catch(console.error);