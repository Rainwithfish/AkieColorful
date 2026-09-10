export default async (request, context) => {
    if (request.method !== "POST") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        if (!url || !token) throw new Error("Missing Upstash environment variables");

        const { qq, nickname, avatar, score, maxCombo } = await request.json();

        // 校验
        if (!/^[1-9]\d{4,10}$/.test(String(qq))) {
            return new Response(JSON.stringify({ ok: false, error: "invalid_qq" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        if (typeof score !== "number" || score < 0 || score > 999999 || !isFinite(score)) {
            return new Response(JSON.stringify({ ok: false, error: "invalid_score" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }

        const safeNick = String(nickname || ("QQ" + qq)).slice(0, 24);
        const safeAvatar = String(avatar || "").slice(0, 500);

        // 使用 pipeline 读取旧数据
        const getRes = await fetch(url + '/pipeline', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([["HGETALL", `player:${qq}`]])
        });
        const getData = await getRes.json();
        const oldData = getData[0]?.result || {};
        const oldBest = oldData.best ? Number(oldData.best) : 0;
        const isNewBest = score > oldBest;
        const newBest = Math.max(oldBest, score);

        // 使用 pipeline 批量更新
        const pipelineCommands = [
            ["HSET", `player:${qq}`, "qq", String(qq), "nickname", safeNick, "avatar", safeAvatar, "best", String(newBest), "maxCombo", String(Math.max(Number(oldData.maxCombo || 0), maxCombo || 0)), "time", String(Date.now())],
            ["ZADD", "leaderboard", String(newBest), String(qq)]
        ];
        await fetch(url + '/pipeline', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(pipelineCommands)
        });

        // 使用 pipeline 获取排名
        const rankRes = await fetch(url + '/pipeline', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([["ZREVRANK", "leaderboard", String(qq)]])
        });
        const rankData = await rankRes.json();
        const rankResult = rankData[0]?.result;
        const finalRank = rankResult !== null && rankResult !== undefined ? rankResult + 1 : 1;

        return new Response(JSON.stringify({ ok: true, isNewBest, best: newBest, rank: finalRank }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
        });
    } catch (error) {
        console.error("submit-score error:", error);
        return new Response(JSON.stringify({ ok: false, error: "server_error" }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
};

export const config = { path: "/api/score" };