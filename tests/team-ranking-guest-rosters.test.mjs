import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../docs/app.js", import.meta.url), "utf8");
const bootstrap = `  boot().catch((e) => {
    console.error("[app] boot error:", e);
  });`;
assert.ok(source.includes(bootstrap), "Unexpected app bootstrap: update test harness");

const alliances = [
  { key: "zeus", group: "losp" },
  { key: "marines", group: "marines" },
  { key: "endgame-revolution-red", group: "endgame-revolution" },
  { key: "endgame-revolution-orange", group: "endgame-revolution" },
];
const instrumented = source.replace(bootstrap, `
  window.__rankingTest = {
    buildRankSources,
    rosterIdentity,
    setRostersForScore(rows) {
      TEAMS = [{ team: "Menace", mode: "Guerre", characters: ["Blob"] }];
      ROSTER_MAP = new Map(rows.map(r => [
        rosterIdentity(r.alliance, r.player), r.chars
      ]));
    },
    score: computeTeamStatsForPlayer,
  };
`);

function make(authorized) {
  const allowed = new Set(authorized);
  const window = {
    location: { href: "https://example.test/msf/index.html" },
    LoSPAccess: { isAllianceAllowed: key => allowed.has(key) },
    LoSPAlliances: {
      getKnownAlliances: () => alliances,
      getAllianceKey: value => String(value ?? "").trim().toLowerCase(),
    },
  };
  const context = {
    window, URL, console,
    document: {
      querySelector: selector => selector === "#modeSelect"
        ? { value: "Guerre", addEventListener() {} } : null,
    },
  };
  runInNewContext(instrumented, context, { filename: "docs/app.js" });
  return window.__rankingTest;
}

const roster = (alliance, player, power) => ({
  alliance, player, playerKey: player.toLowerCase(),
  chars: { blob: { power, level: 110, gear: 19, isoMax: 13 } },
});

test("MARINES players come from the roster, not joueurs.json", () => {
  const ui = make(["marines"]);
  const result = ui.buildRankSources([
    { player: "LoSP member", alliance: "zeus" },
  ], [roster("marines", "Captain Marine", 250000)]);
  assert.deepEqual(Array.from(result.players, p => [p.player, p.alliance]),
    [["Captain Marine", "marines"]]);
  assert.equal(result.rosters.length, 1);
  assert.equal(result.rosters[0].chars.blob.power, 250000);
});

test("LoSP's existing player directory still works without a roster", () => {
  const ui = make(["zeus"]);
  const result = ui.buildRankSources([
    { player: "LoSP member", alliance: "zeus" },
  ], []);
  assert.equal(result.players.length, 1);
  assert.equal(result.players[0].player, "LoSP member");
  assert.equal(result.rosters.length, 0);
});

test("identical names in two ENDGAME alliances never share powers", () => {
  const ui = make(["endgame-revolution-red", "endgame-revolution-orange"]);
  const sourceRows = [
    roster("endgame-revolution-red", "SameName", 100000),
    roster("endgame-revolution-orange", "SameName", 400000),
  ];
  const result = ui.buildRankSources([], sourceRows);
  assert.equal(result.players.length, 2);
  assert.notEqual(
    ui.rosterIdentity(result.players[0].alliance, "SameName"),
    ui.rosterIdentity(result.players[1].alliance, "SameName"));
  ui.setRostersForScore(result.rosters);
  assert.equal(ui.score("SameName", "Menace", "endgame-revolution-red").sum, 100000);
  assert.equal(ui.score("SameName", "Menace", "endgame-revolution-orange").sum, 400000);
});

test("unapproved guest rosters and ambiguous alliance identities are ignored", () => {
  const ui = make(["marines"]);
  const result = ui.buildRankSources([], [
    roster("marines", "Shared", 600000),
    roster("zeus", "Secret", 800000),
    roster("endgame-revolution-red", "Other", 900000),
    roster("ENDGAME R-évolution", "Ambiguous", 850000),
    { player: "Unnamed Alliance", chars: { blob: { power: 777000 } } },
  ]);
  assert.deepEqual(Array.from(result.players, p => p.player), ["Shared"]);
  assert.deepEqual(Array.from(result.rosters, r => r.player), ["Shared"]);
});

test("legacy untagged LoSP roster is accepted only for one known alliance", () => {
  const ui = make(["zeus"]);
  const matched = ui.buildRankSources([{ player: "Recognized", alliance: "zeus" }],
    [{ player: "Recognized", chars: { blob: { power: 777 } } }]);
  assert.equal(matched.rosters.length, 1);
  assert.equal(matched.rosters[0].alliance, "zeus");
  assert.equal(ui.buildRankSources([], [
    { player: "Unverified", chars: { blob: { power: 888 } } },
  ]).rosters.length, 0);
});

test("the screen and player detail both use alliance-scoped roster identity", () => {
  assert.match(source, /computeTeamStatsForPlayer\(p\.player, teamName, p\.alliance\)/);
  assert.match(source, /rosterIdentity\(player\.allianceKey, player\.player\)/);
  assert.match(source, /rosterIdentity\(r\.alliance, r\.player\)/);
});


test("MARINES guest roster is fetched with existing signed Discord session",async()=>{
  const calls=[];
  const token="v1."+"A".repeat(55)+"."+"B".repeat(43);
  const app = source.replace(bootstrap,`
    window.__guestRead = {fetchAuthorizedGuestRosters, message:()=>guestRosterMessage};
  `);
  const window={
    location:{href:"https://keryas777.github.io/msf/index.html"},
    LoSPAlliances:{getKnownAlliances:()=>alliances,
      getAllianceKey:value=>String(value||"").toLowerCase()},
    LoSPAccess:{isAllianceAllowed:key=>key==="marines"}
  };
  const context={URL,window,console,
    document:{querySelector:()=>null},
    localStorage:{getItem:()=>token},
    fetch:async (url,opts)=>{
      calls.push({url:String(url),opts});
      return Response.json({status:"ok",version:1,kind:"authorized-guest-rosters",
        alliance:"marines",state:"complete",rosters:[roster("marines","Marine",990000)]});
    }};
  runInNewContext(app,context,{filename:"docs/app.js"});
  const data=await window.__guestRead.fetchAuthorizedGuestRosters();
  assert.equal(data.length,1);
  assert.equal(data[0].player,"Marine");
  assert.equal(calls.length,1);
  assert.ok(calls[0].url.endsWith("/api/secure/guest-rosters?alliance=marines"));
  assert.equal(calls[0].opts.headers.Authorization,"Bearer "+token);
  assert.equal(calls[0].opts.cache,"no-store");
  assert.equal(window.__guestRead.message(),"");
});
test("LoSP-only user never sends a request for private guest rosters",async()=>{
  const token="v1."+"A".repeat(55)+"."+"B".repeat(43);
  const instrumentedSource=source.replace(bootstrap,
    "window.__privateRead=fetchAuthorizedGuestRosters;");
  const window={location:{href:"https://example.test/"},
    LoSPAlliances:{getKnownAlliances:()=>alliances,
      getAllianceKey:value=>String(value||"").toLowerCase()},
    LoSPAccess:{isAllianceAllowed:key=>key==="zeus"}};
  let requests=0;
  runInNewContext(instrumentedSource,{window,URL,console,
    document:{querySelector:()=>null},
    localStorage:{getItem:()=>token},
    fetch:async()=>{requests++;throw Error("no request expected");}},
  {filename:"docs/app.js"});
  assert.deepEqual(await window.__privateRead(),[]);
  assert.equal(requests,0);
});
test("unsigned legacy sessions never receive guest rosters",async()=>{
  const instrumentedSource=source.replace(bootstrap,
    "window.__privateRead={read:fetchAuthorizedGuestRosters,warning:()=>guestRosterMessage};");
  const window={location:{href:"https://example.test/"},
    LoSPAlliances:{getKnownAlliances:()=>alliances,
      getAllianceKey:value=>String(value||"").toLowerCase()},
    LoSPAccess:{isAllianceAllowed:key=>key==="marines"}};
  let calls=0;
  runInNewContext(instrumentedSource,{window,URL,console,
    document:{querySelector:()=>null},
    localStorage:{getItem:()=>"eyJyb2xlIjoiYWRtaW4ifQ"},
    fetch:async()=>{calls++;return Response.json({});}},
  {filename:"docs/app.js"});
  assert.equal((await window.__privateRead.read()).length,0);
  assert.match(window.__privateRead.warning(),/Reconnecte-toi/);
  assert.equal(calls,0);
});
