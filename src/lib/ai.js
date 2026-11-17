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
