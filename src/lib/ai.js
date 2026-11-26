// src/lib/ai.js
// The assistant's model: Gemini through Firebase AI Logic, called from the
// browser (no server). Turn it on in the Firebase console (AI Logic, Gemini
// Developer API). The model can be changed with NEXT_PUBLIC_AI_MODEL.
//
// Tools come as plain specs (src/domain/assistant) and run here, in the app:
// the model only asks for them.
'use client';

import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai';
import { app } from '@/lib/firebase';

export const AI_MODEL = process.env.NEXT_PUBLIC_AI_MODEL || 'gemini-3.8-flash';
const MAX_ROUNDS = 8; // tool calls and answers in one request

let ai = null;
const getAi = () => (ai ||= getAI(app, { backend: new GoogleAIBackend() }));

/** A tool spec's parameter as a Firebase AI schema. */
function toSchema(p) {
  const description = p.description;
  switch (p.type) {
    case 'integer': return Schema.integer({ description });
    case 'number': return Schema.number({ description });
    case 'boolean': return Schema.boolean({ description });
    case 'array': return Schema.array({ description, items: toSchema(p.items || { type: 'string' }) });
    case 'object': {
      // nested parameters, e.g. a rectangle {width, length}; same optional convention as the top level
      const entries = Object.entries(p.properties || {});
      return Schema.object({
        description,
        properties: Object.fromEntries(entries.map(([k, v]) => [k, toSchema(v)])),
        optionalProperties: entries.filter(([, v]) => v.optional).map(([k]) => k),
      });
    }
    case 'string':
    default:
      return p.enum ? Schema.enumString({ description, enum: p.enum }) : Schema.string({ description });
  }
}

export function toFunctionDeclarations(specs = []) {
  return specs.map((t) => {
    const entries = Object.entries(t.params || {});
    const decl = { name: t.name, description: t.description };
    if (entries.length) {
      decl.parameters = Schema.object({
        properties: Object.fromEntries(entries.map(([k, p]) => [k, toSchema(p)])),
        optionalProperties: entries.filter(([, p]) => p.optional).map(([k]) => k),
      });
    }
    return decl;
  });
}

/** A short reason the user can act on, from an error of the AI service. The service's own words follow. */
export function aiErrorMessage(e) {
  const m = String(e?.message || e || '');
  const detail = `\n\nDetails: ${m.slice(0, 400)}`;
  if (/App Check/i.test(m)) {
    return process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY
      ? `Firebase did not accept this app's App Check token. On localhost, copy the debug token printed in the browser console into Firebase console > App Check > Manage debug tokens. On the live site, check that its domain is in the reCAPTCHA key.${detail}`
      : `Firebase AI Logic requires App Check, and this app has no reCAPTCHA site key yet. Register the web app in Firebase console > App Check with reCAPTCHA Enterprise and put the site key in NEXT_PUBLIC_RECAPTCHA_SITE_KEY.${detail}`;
  }
  if (/API_KEY_SERVICE_BLOCKED|are blocked|\b401\b|UNAUTHENTICATED|\b403\b/i.test(m)) {
    return `The Firebase API key of this app is not allowed to call Firebase AI Logic. In Google Cloud console, APIs & Services > Credentials, open the app's Browser key and add "Firebase AI Logic API" to its API restrictions (it can take 5 minutes).${detail}`;
  }
  if (/api-not-enabled|has not been used|is disabled|SERVICE_DISABLED/i.test(m)) {
    return `Firebase AI Logic is not set up for this project yet. In the Firebase console, open AI Logic and enable the Gemini Developer API.${detail}`;
  }
  if (/quota|429|RESOURCE_EXHAUSTED/i.test(m)) return `The assistant is over its usage or spending limit right now. Try again later.${detail}`;
  if (/\b404\b|not found/i.test(m)) return `The model ${AI_MODEL} is not available. Set NEXT_PUBLIC_AI_MODEL to a current Gemini model.${detail}`;
  if (/network|failed to fetch|offline/i.test(m)) return 'The assistant could not be reached. Check the connection and try again.';
  return `The assistant failed.${detail}`;
}

/**
 * One request to the assistant: sends the message, runs every tool the model
 * asks for, and returns its answer.
 * @param {object} o
 * @param {string} o.system         instructions for the model
 * @param {Array}  o.history        earlier turns: [{role:'user'|'model', text}]
 * @param {string} o.message        what the user wrote, with the page context
 * @param {Array}  o.tools          tool specs
 * @param {(name:string, args:object) => Promise<object>|object} o.execute runs a tool, returns its result
 * @returns {Promise<{text:string, calls:number}>}
 */
export async function askAssistant({ system, history = [], message, tools = [], execute }) {
  const model = getGenerativeModel(getAi(), {
    model: AI_MODEL,
    systemInstruction: system,
    ...(tools.length ? { tools: [{ functionDeclarations: toFunctionDeclarations(tools) }] } : {}),
  });
  const chat = model.startChat({ history: history.map((h) => ({ role: h.role, parts: [{ text: h.text }] })) });
  let result = await chat.sendMessage(message);
  let calls = 0;
  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const fc = result.response.functionCalls?.() || [];
    if (!fc.length) break;
    const parts = [];
    for (const call of fc) {
      calls += 1;
      let out;
      try { out = await execute(call.name, call.args || {}); } catch (e) { out = { ok: false, error: String(e?.message || e) }; }
      parts.push({ functionResponse: { name: call.name, response: out } });
    }
    result = await chat.sendMessage(parts);
  }
  let text = '';
  try { text = result.response.text() || ''; } catch { text = ''; }
  return { text: text.trim(), calls };
}

const HEADER_SCHEDULE_SCHEMA = Schema.object({
  properties: {
    name: Schema.string({ description: 'Short title of the header schedule table, if shown' }),
    rows: Schema.array({
      description: 'Every row of the header schedule across all wall sizes and story/floor-above bands',
      items: Schema.object({
        properties: {
          walls: Schema.enumString({ enum: ['bearing', 'nonbearing', 'any'], description: 'bearing for exterior, load-bearing, or shear walls; nonbearing for interior non-bearing partitions; any if unspecified' }),
          size: Schema.enumString({ enum: ['2x4', '2x6', '2x8', 'any'], description: 'Wall stud size: 4 inch / 4" walls -> 2x4, 6 inch / 6" walls -> 2x6, 8 inch -> 2x8, or any' }),
          above: Schema.enumString({ enum: ['any', '0', '1', '2', '3', '4'], description: 'Number of floors carried above this level: 0 = top floor / 1-story / roof only; 1 = 1 floor above (e.g. 2nd floor of 3-story or 1st floor of 2-story); 2 = 2 floors above (ground floor of 3-story); any if the table does not vary by floors' }),
          upToIn: Schema.integer({ description: 'Maximum rough opening width in inches (e.g. 3\'-0" -> 36, 5\'-0" -> 60, 7\'-3" -> 87)' }),
          header: Schema.string({ description: 'Header callout as written (e.g. "4x10", "6x8", "(2) 2x10", "5-1/4x11-7/8 PSL")' }),
          plies: Schema.integer({ description: 'Number of header plies only if explicitly different from the callout, otherwise 0' }),
          sill: Schema.string({ description: 'Window sill callout as written (e.g. "2x", "(2) 2x"), or empty string if none' }),
          jacks: Schema.string({ description: 'Post / trimmer / jack stud callout each side (e.g. "2x4", "(2) 2x4", "4x4", "2x6")' }),
          kings: Schema.string({ description: 'King stud callout each side (e.g. "2x4", "(2) 2x4", "(2) 2x6")' }),
          note: Schema.string({ description: 'Short row-specific note if any, otherwise empty string' }),
        },
        optionalProperties: ['plies', 'sill', 'jacks', 'kings', 'note'],
      }),
    }),
  },
});

const HEADER_SCHEDULE_PROMPT = [
  'Read this structural wood-framing Header Schedule image and extract every row into the JSON schema.',
  'Rules:',
  '- Convert all opening widths to total inches (e.g. UP TO 3\'-0" = 36, UP TO 5\'-0" = 60, UP TO 7\'-3" = 87).',
  '- If the table has separate side-by-side blocks (e.g. 4 INCH WALLS on the left and 6 INCH WALLS on the right), emit rows for both blocks.',
  '- If the table uses house/story diagrams with a shaded floor to show which level each band applies to: shaded top floor (or 1-story) = "0" floors above; 1 floor above the shaded floor = "1"; 2 floors above the shaded floor = "2"; 3 floors above = "3".',
  '- Keep callouts concise and faithful to the table (e.g. "4x8", "6x12", "(2) 2x4", "4x4", "(2) 2x").',
  '- Return ONLY the structured JSON matching the schema.',
].join('\n');

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read the image file.'));
    reader.onload = () => {
      const s = String(reader.result || '');
      const i = s.indexOf(',');
      resolve(i >= 0 ? s.slice(i + 1) : s);
    };
    reader.readAsDataURL(file);
  });
}

/**
 * Read a header schedule screenshot / image with Gemini Vision and return the
 * raw structured object ({ name, rows }).
 * @param {File|Blob} file
 */
export async function readHeaderScheduleImage(file) {
  const mimeType = file.type && file.type.startsWith('image/') ? file.type : 'image/png';
  const data = await fileToBase64(file);
  const model = getGenerativeModel(getAi(), {
    model: AI_MODEL,
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: HEADER_SCHEDULE_SCHEMA,
      temperature: 0,
    },
  });
  const result = await model.generateContent([
    { text: HEADER_SCHEDULE_PROMPT },
    { inlineData: { mimeType, data } },
  ]);
  const text = result.response.text();
  return JSON.parse(text);
}
