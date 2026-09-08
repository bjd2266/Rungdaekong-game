import { getStore } from "@netlify/blobs";

const KEY = "global";
const MAX_ENTRIES = 100;

const HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,OPTIONS"
};

function cleanName(v) {
  const s = String(v || "").trim().slice(0, 10);
  return /^[가-힣A-Za-z0-9_]{2,10}$/.test(s) ? s : null;
}

function cleanScore(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 && n <= 100000 ? n : null;
}

function cleanDuration(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 1 && n <= 86400 ? n : null;
}

function safeList(x) {
  if (!Array.isArray(x)) return [];

  return x
    .filter(e => e && cleanName(e.name) && cleanScore(e.score) !== null)
    .map(e => ({
      name: cleanName(e.name),
      score: cleanScore(e.score),
      updatedAt: e.updatedAt || 0
    }))
    .sort((a, b) => b.score - a.score || a.updatedAt - b.updatedAt)
    .slice(0, MAX_ENTRIES);
}

async function readBoard(store) {
  try {
    const data = await store.get(KEY, { type: "json" });
    return safeList(data?.leaderboard || data || []);
  } catch {
    return [];
  }
}

export default async (request) => {

  if (request.method === "OPTIONS") {
    return new Response("", {
      status: 204,
      headers: HEADERS
    });
  }

  const store = getStore("reongdaekong-leaderboard");

  if (request.method === "GET") {
    const leaderboard = await readBoard(store);

    return new Response(
      JSON.stringify({
        leaderboard: leaderboard.slice(0, 10)
      }),
      {
        status: 200,
        headers: HEADERS
      }
    );
  }

  if (request.method !== "POST") {
    return new Response(
      JSON.stringify({
        error: "Method not allowed"
      }),
      {
        status: 405,
        headers: HEADERS
      }
    );
  }

  let body;

  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({
        error: "잘못된 요청입니다."
      }),
      {
        status: 400,
        headers: HEADERS
      }
    );
  }

  const name = cleanName(body.name);
  const score = cleanScore(body.score);
  const duration = cleanDuration(body.duration);

  if (!name || score === null || duration === null) {
    return new Response(
      JSON.stringify({
        error: "닉네임/점수 형식 오류"
      }),
      {
        status: 400,
        headers: HEADERS
      }
    );
  }

  const plausibleMax = Math.floor(duration * 2.5 + 1200);

  if (score > plausibleMax) {
    return new Response(
      JSON.stringify({
        error: "점수 검증 실패"
      }),
      {
        status: 400,
        headers: HEADERS
      }
    );
  }

  let leaderboard = await readBoard(store);

  const old = leaderboard.find(x => x.name === name);

  const personalBest = !old || score > old.score;

  if (personalBest) {

    leaderboard = leaderboard.filter(
      x => x.name !== name
    );

    leaderboard.push({
      name,
      score,
      updatedAt: Date.now()
    });

    leaderboard.sort(
      (a, b) =>
        b.score - a.score ||
        a.updatedAt - b.updatedAt
    );

    leaderboard = leaderboard.slice(
      0,
      MAX_ENTRIES
    );

    await store.setJSON(KEY, {
      leaderboard
    });
  }

  const rank =
    leaderboard.findIndex(
      x => x.name === name
    ) + 1;

  return new Response(
    JSON.stringify({
      ok: true,
      personalBest,
      rank: rank || null,
      leaderboard: leaderboard.slice(0, 10)
    }),
    {
      status: 200,
      headers: HEADERS
    }
  );
};
