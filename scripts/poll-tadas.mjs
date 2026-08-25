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
import OpenAI from "openai";

const openai = new OpenAI();
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
    const file_contents = await fs.readFile(TADAS_PATH, "utf-8").catch(() => "[]");
    return JSON.parse(file_contents || "[]");
}

function getLastUpdateId(tadas)
{
    return tadas.reduce((max, tada) => Math.max(max, tada.update_id ?? 0), 0);
}

async function fetchNewMessages(offset)
{
    console.log("Polling Telegram bot for latest messages");
    console.log(`Last update id is ${offset}`);
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?offset=${offset + 1}&timeout=0`;
    const resp = await fetch(url);
    const data = await resp.json();
    if (!data.ok)
    {
        throw new Error(`Telegram getUpdates failed: ${JSON.stringify(data)}`);
    }
    console.log(`Number of new messages retrieved from Telegram bot: ${(data.result ?? []).length}`);
    return data.result ?? [];
}

async function downloadVoiceFile(fileId, updateId)
{
    console.log(`Downloading voice file for message with update id ${updateId}`);
    const voiceFile = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`,
    );
    const voiceFileData = await voiceFile.json();
    const voiceFilePath = voiceFileData.result.file_path;
    const voiceFileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${voiceFilePath}`;
    const voicefileResp = await fetch(voiceFileUrl);
    return Buffer.from(await voicefileResp.arrayBuffer());
}

async function transcribe(audioBuffer, updateId)
{
    console.log(`Transcribing voice content for message with update id ${updateId}`);
    const form = new FormData();
    form.append("file", new Blob([audioBuffer], { type: "audio/ogg" }), "voice.ogg");
    form.append("model", "whisper-1");
    form.append("language", "en");
    form.append("prompt", ` 
                This is called a 'tada', which is the equivalent of a 'todo'.
                It means a task done instead of a task still to do.
                Anytime you hear the word 'tada', even if it sounds like 'tadar', write it as 'tada'.`)

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

    let message = (data.text || "").trim();
    message = message.endsWith(".") ? message.slice(0, -1).trim() : message;
    message = message.length > 0
        ? String(message).charAt(0).toUpperCase() + String(message).slice(1)
        : message;

    return message || "[transcription failed]";
}

async function categoriseTada(message)
{
    const completion = await openai.chat.completions.create({
        messages: [{
            role: "developer", content: `Output a label for what this message is about.
                                                There are the only options: 'Cooking', 'Cleaning', 'Languages', 'Tech', 'Creativity', 'Exercise', 'Exploration'
                                                If you do not know, put the label as 'Unknown'.
                                                Labels can only be 1 word.
                                                Examples of messages and their associated labels:
                                                'Cooked a meal today', 'Cooking'
                                                'Discovered a recipe today', 'Cooking'
                                                'Tried out a new recipe today', 'Cooking'
                                                'Bought some exciting new ingredients today', 'Cooking'
                                                'Tidied my flat today', 'Cleaning'
                                                'Did the washing up today', 'Cleaning'
                                                'Changed my bedsheets today', 'Cleaning'
                                                'Gave a lot of clothes to charity today', 'Cleaning'
                                                'Did a big clear out today', 'Cleaning',
                                                'Learnt a new word in Japanese today', 'Languages'
                                                'Spoke Japanese in a Japanese class today', 'Languages',
                                                'Spoke French to someone today', 'Languages',
                                                'Watched a film in Spanish today', 'Languages',
                                                'Learnt 3 new kanji today', 'Languages', 
                                                'Learnt a new linux command today', 'Tech', 
                                                'Refactored a difficult section of Python code', 'Tech', 
                                                'Learnt how to use a github action', 'Tech',
                                                'Created an ansible playbook', 'Tech', 
                                                'Used the AWS APIs", 'Tech',
                                                'Drew a picture today', 'Creativity'
                                                'Made a skirt', 'Creativity',
                                                'Followed a pattern to make a headband', 'Creativity',
                                                'Made a collage', 'Creativity',
                                                'Put effort into how I dressed today', 'Creativity', 
                                                'Went to the gym', 'Exercise',
                                                'Went swimming, 'Exercise', 
                                                'Did some weights', 'Exercise'
                                                'Did a youtube workout', 'Exercise'
                                                'Saw the Northern lights!', 'Exploration',
                                                'Went to a new city', 'Exploration', 
                                                'Went on a food tour', 'Exploration'
                                                'Visited a new place for the first time', 'Exploration' ` }],
        model: "GPT-4o-mini",
        temperature: 0.1
    });

    const category = (completion.choices[0]?.message?.content ?? "").trim();
    if (category.includes(" "))
    {
        console.log(`The model has output a category that is more than 1 word. The message was ${message}`)
        throw new Error('Expected category length exceeded error')
    }

    return category || "Unknown"
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
                console.log(`Message with update id ${update.update_id} is of type: Voice`);
                const audioBuffer = await downloadVoiceFile(msg.voice.file_id, update.update_id);
                text = await transcribe(audioBuffer, update.update_id);
            } else if (msg.text)
            {
                source = "text";
                console.log(`Message with update id ${update.update_id} is of type: Text`);
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

        let category;
        try
        {
            category = await categoriseTada(text);
        } catch (e)
        {
            console.log(e)
        }

        const tada = {
            date: formatDate(new Date()),
            text,
            source,
            update_id: update.update_id,
            category: category || 'Unknown'
        };
        tadas.push(tada);
        console.log(`Logging tada from ${update.update_id} to file`);
        console.log(`New tada is: ${tada}`);

    }

    await fs.writeFile(TADAS_PATH, JSON.stringify(tadas, null, 2) + "\n");
    console.log(`Wrote ${updates.length} tada(s) to ${TADAS_PATH}`);
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});
