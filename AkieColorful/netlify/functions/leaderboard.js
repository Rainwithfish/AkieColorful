import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async (request, context) => {
    if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        // 取前 50 名（分数从高到低）
        const topQqs = await redis.zrange("leaderboard", 0, 49, { rev: true });

        if (!topQqs.length) {
            return new Response(JSON.stringify({ list: [] }), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        // 批量获取玩家详情
        const pipeline = redis.pipeline();
        for (const qq of topQqs) {
            pipeline.hgetall(`player:${qq}`);
        }
        const results = await pipeline.exec();

        const list = results
            .filter(Boolean)
            .map((entry, index) => ({
                rank: index + 1,
                qq: entry.qq || "",
                nickname: entry.nickname || "QQ用户",
                avatar: entry.avatar || "",
                best: Number(entry.best) || 0,
                maxCombo: Number(entry.maxCombo) || 0,
            }));

        return new Response(JSON.stringify({ list }), {
            status: 200,
            headers: {
                "Content-Type": "application/json",
                "Cache-Control": "public, max-age=10",
            },
        });
    } catch (error) {
        console.error("leaderboard error:", error);
        return new Response(JSON.stringify({ list: [] }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const config = {
    path: "/api/leaderboard",
};