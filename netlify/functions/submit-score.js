import { Redis } from "@upstash/redis";

const redis = new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

export default async (request, context) => {
    // 只允许 POST
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const { qq, nickname, avatar, score, maxCombo } = await request.json();

        // 基础校验
        if (!/^[1-9]\d{4,10}$/.test(String(qq))) {
            return new Response(JSON.stringify({ ok: false, error: "invalid_qq" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }
        if (typeof score !== "number" || score < 0 || score > 999999 || !isFinite(score)) {
            return new Response(JSON.stringify({ ok: false, error: "invalid_score" }), {
                status: 400,
                headers: { "Content-Type": "application/json" },
            });
        }

        const safeNick = String(nickname || ("QQ" + qq)).slice(0, 24);
        const safeAvatar = String(avatar || "").slice(0, 500);

        // 读取旧数据
        const oldData = await redis.hgetall(`player:${qq}`);
        const oldBest = oldData && oldData.best ? Number(oldData.best) : 0;
        const isNewBest = score > oldBest;

        // 更新玩家信息
        await redis.hset(`player:${qq}`, {
            qq: String(qq),
            nickname: safeNick,
            avatar: safeAvatar,
            best: String(Math.max(oldBest, score)),
            maxCombo: String(Math.max(Number(oldData?.maxCombo || 0), maxCombo || 0)),
            time: String(Date.now()),
        });

        // 更新排行榜有序集合（分数越高排名越前）
        await redis.zadd("leaderboard", { score: Math.max(oldBest, score), member: String(qq) });

        // 计算当前排名
        const rank = await redis.zrevrank("leaderboard", String(qq));
        const finalRank = rank !== null ? rank + 1 : 1;

        return new Response(JSON.stringify({
            ok: true,
            isNewBest,
            best: Math.max(oldBest, score),
            rank: finalRank,
        }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("submit-score error:", error);
        return new Response(JSON.stringify({ ok: false, error: "server_error" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
        });
    }
};

export const config = {
    path: "/api/score",
};