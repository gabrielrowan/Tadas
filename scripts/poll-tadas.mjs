#!/usr/bin/env node
/**
 * Polls the Telegram bot for new messages and appends them to data/tadas.json.
 *
 * The last processed Telegram update id is derived from the highest
 * `update_id` already stored in data/tadas.json, so no external state is kept.
 *
 * Required env vars:
 *   TELEGRAM_BOT_TOKEN
 *   OPENAI_API_KEY
 */

import fs from "node:fs/promises";
import path from "node:path";

const TADAS_PATH = path.join(process.cwd(), "public", "data", "tadas.json");

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

if (!TELEGRAM_BOT_TOKEN)
{
    throw new Error("Missing TELEGRAM_BOT_TOKEN env var");
}
if (!OPENAI_API_KEY)
{
    throw new Error("Missing OPENAI_API_KEY env var");
}

async function readTadas()
{
    const raw = await fs.readFile(TADAS_PATH, "utf-8").catch(() => "[]");
    return JSON.parse(raw || "[]");
}

function getLastUpdateId(tadas)
{
    return tadas.reduce((max, tada) => Math.max(max, tada.update_id ?? 0), 0);
}

async function fetchNewMessages(offset)
{
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset + 1}&timeout=0`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.ok)
    {
        throw new Error(`Telegram getUpdates failed: ${JSON.stringify(data)}`);
    }
    return data.result ?? [];
}

async function downloadVoiceFile(fileId)
{
    const infoResp = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
    );
    const infoData = await infoResp.json();
    const filePath = infoData.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileResp = await fetch(fileUrl);
    return Buffer.from(await fileResp.arrayBuffer());
}

async function transcribe(audioBuffer)
{
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");
    form.append("model", "whisper-1");

    const resp = await fetch("https://api.openai.com/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
        body: form,
    });
    const data = await resp.json();
    if (!resp.ok)
    {
        throw new Error(`Whisper transcription failed: ${JSON.stringify(data)}`);
    }
    return (data.text || "[transcription failed]").trim();
}

function formatDate(date)
{
    const parts = new Intl.DateTimeFormat("en-GB", {
        timeZone: "Europe/London",
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
    }).formatToParts(date);
    const lookup = Object.fromEntries(parts.map((p) => [p.type, p.value]));
    return `${lookup.day}/${lookup.month}/${lookup.year}`;
}

async function main()
{
    const tadas = await readTadas();
    const lastUpdateId = getLastUpdateId(tadas);
    console.log(`Last update id: ${lastUpdateId}`);

    const updates = await fetchNewMessages(lastUpdateId);
    if (updates.length === 0)
    {
        console.log("No new messages.");
        return;
    }

    console.log(`Fetched ${updates.length} update(s) from Telegram.`);

    for (const update of updates)
    {
        const msg = update.message;
        if (!msg) continue;

        // Always record the update, even on failure, so a bad message can't block the offset forever.
        let source = "text";
        let text = "[failed to process message]";

        try
        {
            if (msg.voice)
            {
                source = "voice";
                const audioBuffer = await downloadVoiceFile(msg.voice.file_id);
                text = await transcribe(audioBuffer);
            } else if (msg.text)
            {
                source = "text";
                text = msg.text;
            } else
            {
                source = "unsupported";
                text = "[unsupported message type]";
            }
        } catch (err)
        {
            console.error(`Failed to process update ${update.update_id}: ${err.message}`);
        }

        tadas.push({
            date: formatDate(new Date()),
            text,
            source,
            update_id: update.update_id,
        });
    }

    await fs.writeFile(TADAS_PATH, JSON.stringify(tadas, null, 2) + "\n");
    console.log(`Wrote ${tadas.length} tada(s) to ${TADAS_PATH}`);
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});
