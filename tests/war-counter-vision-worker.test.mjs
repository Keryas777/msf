import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import worker,{createMockResponse,validateMockResponse,ROUTE} from "../workers/msf-war-counter-vision/worker.js";
test("worker dédié sans Groq réel",()=>{const mock=createMockResponse("full_capture");assert.equal(mock.groqRealCalls,0);assert.equal(validateMockResponse(mock),true);});
test("route dédiée et aucune route de débrief",()=>{const source=fs.readFileSync(new URL("../workers/msf-war-counter-vision/worker.js",import.meta.url),"utf8");assert.equal(ROUTE,"/api/war-counter-vision/analyze");assert.doesNotMatch(source,/parse-gemini|write-analyses|publish-report|msf-war-ocr/);assert.doesNotMatch(source,/api\.groq\.com/);});
test("multipart requis",async()=>{const response=await worker.fetch(new Request(`https://example.test${ROUTE}`,{method:"POST",headers:{Origin:"https://keryas777.github.io","Content-Type":"application/json"},body:"{}"}));assert.equal(response.status,415);});
