export default async (request, context) => {
    if (request.method !== "GET") {
        return new Response(JSON.stringify({ error: "Method not allowed" }), {
            status: 405,
            headers: { "Content-Type": "application/json" },
        });
    }

    try {
        const url = process.env.UPSTASH_REDIS_REST_URL;
        const token = process.env.UPSTASH_REDIS_REST_TOKEN;
        if (!url || !token) throw new Error("Missing Upstash environment variables");

        // 获取前 50 名 QQ 号
        const zrangeRes = await fetch(url + '/pipeline', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify([["ZREVRANGE", "leaderboard", 0, 49]])
        });
        
        if (!zrangeRes.ok) {
            const errorText = await zrangeRes.text();
            throw new Error(`Upstash error: ${zrangeRes.status} ${errorText}`);
        }
        
        const zrangeData = await zrangeRes.json();
        const qqs = zrangeData[0]?.result || [];

        if (!qqs.length) {
            return new Response(JSON.stringify({ list: [] }), { status: 200, headers: { "Content-Type": "application/json" } });
        }

        // 批量获取玩家详情
        const pipelineCommands = qqs.map(qq => ["HGETALL", `player:${qq}`]);
        const pipelineRes = await fetch(url + '/pipeline', {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(pipelineCommands)
        });

        if (!pipelineRes.ok) {
            const errorText = await pipelineRes.text();
            throw new Error(`Upstash pipeline error: ${pipelineRes.status} ${errorText}`);
        }

        const pipelineData = await pipelineRes.json();

        const list = pipelineData.map((item, index) => {
            // ⭐ 修复：将 HGETALL 返回的扁平数组转为对象
            const rawData = item.result || [];
            const entry = {};
            for (let i = 0; i < rawData.length; i += 2) {
                entry[rawData[i]] = rawData[i + 1];
            }

            return {
                rank: index + 1,
                qq: entry.qq || qqs[index],
                nickname: entry.nickname || "QQ用户",
                avatar: entry.avatar || "",
                best: Number(entry.best) || 0,
                maxCombo: Number(entry.maxCombo) || 0,
            };
        });

        return new Response(JSON.stringify({ list }), {
            status: 200,
            headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=10" },
        });
    } catch (error) {
        console.error("leaderboard error:", error);
        return new Response(JSON.stringify({ list: [] }), { status: 500, headers: { "Content-Type": "application/json" } });
    }
};

export const config = { path: "/api/leaderboard" };