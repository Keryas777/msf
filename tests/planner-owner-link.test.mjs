import assert from "node:assert/strict";
import test,{after} from "node:test";
import {isPlannerOwner,isPlannerLinkVisible,plannerUrlForEvent} from "../docs/planner-owner-link.mjs";

const previousWindow=globalThis.window;
globalThis.window={LoSPAccess:{isLoSPOwnerAdmin:session=>session?.ok===true&&session.role==="admin"&&String(session.id||"")==="300305626926415874"}};
after(()=>{if(previousWindow===undefined)delete globalThis.window;else globalThis.window=previousWindow;});
const owner={ok:true,role:"admin",id:"300305626926415874"};

test("only the authenticated LoSP owner administrator qualifies",()=>{
  assert.equal(isPlannerOwner(owner),true);
  assert.equal(isPlannerOwner({...owner,id:"300305626926415875"}),false);
  assert.equal(isPlannerOwner({...owner,role:"member"}),false);
  assert.equal(isPlannerOwner({...owner,role:"guest"}),false);
  assert.equal(isPlannerOwner({...owner,ok:false}),false);
  assert.equal(isPlannerOwner(null),false);
  assert.equal(isPlannerLinkVisible(owner,owner),true);
  assert.equal(isPlannerLinkVisible(owner,{...owner,role:"member",previewMode:true}),false);
  assert.equal(isPlannerLinkVisible(null,{...owner,role:"member"}),false);
});

test("event links contain only a validated stable id and target the protected Worker page",()=>{
  const url=new URL(plannerUrlForEvent("planner-test"));
  assert.equal(url.origin,"https://losp-roster-service.deliriousfan7.workers.dev");
  assert.equal(url.pathname,"/admin/events-planner");
  assert.equal(url.searchParams.get("eventId"),"planner-test");
  assert.equal(plannerUrlForEvent(""),null);
  assert.equal(plannerUrlForEvent("../admin"),null);
  assert.equal(plannerUrlForEvent("id?resource=roster"),null);
});
