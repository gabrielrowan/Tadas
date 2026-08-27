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
import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
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

const CATEGORIES = [
    "Cooking",
    "Cleaning",
    "Languages",
    "Tech",
    "Creativity",
    "Exercise",
    "Exploration",
    "Unknown",
];

const SYSTEM_PROMPT = `You classify short log entries of personal achievements ("tadas") into exactly one category.

Valid categories: ${CATEGORIES.join(", ")}.

You will be shown examples of previously labeled messages before the one you
need to classify. Use them as a guide for how similar messages have been
categorised. If nothing clearly applies, use "Unknown".`;

// Returns data rows from labelled dataset
function loadData()
{
    const csvPath = "/public/data/labeled_data.csv";
    const data = fs.readFileSync(csvPath, 'utf8');
    const rows = parse(data, { columns: true, skip_empty_lines: true, trim: true });
    return rows.map((r) => ({ text: r.Message, category: r.Label }));
}

// Turn labeled rows into input-ouput pairs
function formatPromptExamples(data_rows)
{
    const input_output_pairs = [];
    for (const row of data_rows)
    {
        input_output_pairs.push({ role: "user", content: row.text });
        input_output_pairs.push({
            role: "assistant",
            content: JSON.stringify({ category: row.category }),
        });
    }
    return input_output_pairs;
}

const LABELLED_DATA = loadData();
const INPUT_OUTPUT_PAIRS = formatPromptExamples(LABELLED_DATA);

// Classify a single message
async function categoriseTada(text)
{
    const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        temperature: 0.1,
        messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...INPUT_OUTPUT_PAIRS,
            { role: "user", content: text },
        ],
        response_format: {
            type: "json_schema",
            json_schema: {
                name: "category_label",
                strict: true,
                schema: {
                    type: "object",
                    properties: {
                        category: { type: "string", enum: CATEGORIES },
                    },
                    required: ["category"],
                    additionalProperties: false,
                },
            },
        },
    });

    const parsed = JSON.parse(completion.choices[0].message.content);
    return parsed.category;
}

async function readTadas()
{
    const file_contents = await fsPromises.readFile(TADAS_PATH, "utf-8").catch(() => "[]");
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
        console.log(`New tada is: ${JSON.stringify(tada)}`);

    }

    await fsPromises.writeFile(TADAS_PATH, JSON.stringify(tadas, null, 2) + "\n");
    console.log(`Wrote ${updates.length} tada(s) to ${TADAS_PATH}`);
}

main().catch((err) =>
{
    console.error(err);
    process.exit(1);
});
