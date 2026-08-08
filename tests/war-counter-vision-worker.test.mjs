import test from"node:test";import assert from"node:assert/strict";import worker,{buildGroqPayload,callGroqVision,createMockResponse,validateVisionResult,ROUTE,GROQ_ENDPOINT}from"../workers/msf-war-counter-vision/worker.js";
const catalog=[{id:"AgentVenom"}],ids=new Set(["AgentVenom"]);
test("payload Vision image et modèle",()=>{const p=buildGroqPayload({imageDataUrl:"data:image/jpeg;base64,AA==",catalog});assert.equal(p.model,"qwen/qwen3.6-27b");assert.equal(p.messages[0].content[1].type,"image_url")});
test("réponse stricte",()=>assert.equal(validateVisionResult(createMockResponse(),ids),true));
test("hors catalogue refusé",()=>{const r=createMockResponse();r.slots[0].candidates[0].characterId="Batman";assert.throws(()=>validateVisionResult(r,ids),/hors catalogue/)});
test("JSON invalide simulé",async()=>await assert.rejects(()=>callGroqVision({env:{GROQ_API_KEY:"x"},payload:{},fetchImpl:async()=>new Response("{}",{status:200,headers:{"content-type":"application/json"}})}),/vide/));
test("timeout simulé",async()=>await assert.rejects(()=>callGroqVision({env:{GROQ_API_KEY:"x"},payload:{},timeoutMs:5,fetchImpl:(_,o)=>new Promise((_,rej)=>o.signal.addEventListener("abort",()=>rej(Object.assign(new Error(),{name:"AbortError"}))))}),/Timeout/));
test("route R2 bloque Groq réel",async()=>{const f=new FormData();f.set("image",new File(["x"],"x.jpg",{type:"image/jpeg"}));f.set("strategy","full_capture");f.set("layout","war-result-ultrawide-v1");const r=await worker.fetch(new Request(`https://x${ROUTE}`,{method:"POST",headers:{Origin:"https://keryas777.github.io"},body:f}),{});assert.equal(r.status,503);assert.equal((await r.json()).groqRealCalls,0)});
test("endpoint dédié",()=>assert.match(GROQ_ENDPOINT,/api\.groq\.com/));
