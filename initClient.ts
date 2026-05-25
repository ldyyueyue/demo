//该脚本实现了“本地私钥加载 -> 判定凭证 -> 自动创建/推导 API Key -> 实例化 L2 交易客户端 -> 连通性测试”的完整闭环。
import { ClobClient } from "@polymarket/clob-client-v2";
import { createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { polygon } from "viem/chains";
import * as dotenv from "dotenv";

// 加载环境变量
dotenv.config();

async function main() {
    // 1. 验证基础环境变量
    const privateKey = process.env.PRIVATE_KEY as `0x${string}`;
    const rpcUrl = process.env.POLYGON_RPC_URL;
    
    if (!privateKey || !rpcUrl) {
        throw new Error("❌ 错误: 请先在 .env 文件中配置 PRIVATE_KEY 和 POLYGON_RPC_URL");
    }

    console.log("⏳ 正在初始化 L1 钱包客户端...");
    
    // 2. 初始化 viem 钱包客户端 (EOA)
    const account = privateKeyToAccount(privateKey);
    const walletClient = createWalletClient({
        account,
        chain: polygon,
        transport: http(rpcUrl)
    });

    console.log(`✅ L1 钱包加载成功! 钱包地址: ${account.address}`);

    // 检查本地是否已有 L2 凭证
    let apiKey = process.env.CLOB_API_KEY;
    let secret = process.env.CLOB_SECRET;
    let passphrase = process.env.CLOB_PASS_PHRASE;

    // 3. 如果没有凭证，触发自动生成/推导逻辑
    if (!apiKey || !secret || !passphrase) {
        console.log("⚠️ 检测到本地未配置 L2 凭证，正在通过钱包签名生成新的 Polymarket API Key...");
        
        try {
            // 使用临时客户端配置（仅带钱包，不带API凭证）来请求 Polymarket 派生新凭证
            const initConfig = {
                host: "https://clob.polymarket.com",
                walletClient: walletClient,
                chain: 137, // Polygon 主网 ID
                signer: walletClient
            };
            const tempClient = new ClobClient(initConfig);
            
            // 调用官方 V2 核心方法：创建或推导 API 凭证
            const apiCredentials = await tempClient.createOrDeriveApiKey();
            
            console.log("\n=================== 🚀 成功生成 L2 API 凭证 ===================");
            console.log(`CLOB_API_KEY=${apiCredentials.key}`);
            console.log(`CLOB_SECRET=${apiCredentials.secret}`);
            console.log(`CLOB_PASS_PHRASE=${apiCredentials.passphrase}`);
            console.log("===============================================================");
            console.log("💡 请立即将上方三行复制并粘贴到你的 `.env` 文件中，下次运行将直接跳过生成步骤。\n");
            
            // 赋值给变量用于下一步的正式实例化
            apiKey = apiCredentials.key;
            secret = apiCredentials.secret;
            passphrase = apiCredentials.passphrase;
        } catch (error) {
            console.error("❌ 生成 API Key 失败，请确保该钱包已在 Polymarket 网页端完成 KYC 且激活过账户。");
            console.error(error);
            return;
        }
    }

    // 4. 正式实例化功能完整的交易客户端
    console.log("⏳ 正在实例化 Polymarket 正式交易客户端...");
    const client = new ClobClient({
        signer: walletClient,
        host: "https://clob.polymarket.com",
        chain: 137,
        creds: {
            key: apiKey!,
            secret: secret!,
            passphrase: passphrase!
        }
    });

    // 5. 连通性与身份验证测试 (获取一个公开市场数据)
    try {
        console.log("⏳ 正在测试 API 连通性与身份验证...");
        // 尝试拉取最新活跃的市场（此步不需要签名，但能验证客户端实例是否正常）
        const samplingMarkets = await client.getMarkets();
        
        console.log("🎉 恭喜！Polymarket 自动化交易客户端初始化成功！");
        console.log(`📡 成功获取到市场数据，当前平台共有 ${samplingMarkets.data.length} 个活跃细分市场。`);
        
        // 6. 返回客户端实例供你的策略脚本后续调用
        return client;
        
    } catch (error) {
        console.error("❌ 连通性测试失败。请检查 RPC 节点是否可用，或 .env 中的凭证复制是否有误。");
        console.error(error);
    }
}

// 执行脚本
main();