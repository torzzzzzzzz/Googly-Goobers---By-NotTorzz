import { afterEach, describe, expect, it, vi } from "vitest";

function streamOf(chunks: string[]) {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

describe("streamTool SSE client", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    document.head.innerHTML = "";
  });

  it("parses events split across network chunks", async () => {
    document.head.innerHTML = '<meta name="torz-token" content="tok123">';
    const fetchMock = vi.fn(async () => new Response(streamOf(['data: {"type":"meta","model":"m"}\n\ndata: {"type":"del', 'ta","text":"Hel"}\n\n', 'data: {"type":"delta","text":"lo"}\n\ndata: {"type":"done","output":"Hello"}\n\n']), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { streamTool } = await import("../api");
    const events: any[] = [];
    await streamTool("/api/tools/x", { a: 1 }, (e) => events.push(e));
    expect(events.map((e) => e.type)).toEqual(["meta", "delta", "delta", "done"]);
    expect(events.filter((e) => e.type === "delta").map((e) => e.text).join("")).toBe("Hello");
    const init = (fetchMock.mock.calls[0] as any[])[1];
    expect(init.headers["X-TORZ-Token"]).toBe("tok123");
  });

  it("reports HTTP errors and truncated streams", async () => {
    document.head.innerHTML = '<meta name="torz-token" content="t">';
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ detail: "Add some text first." }), { status: 400, headers: { "content-type": "application/json" } })));
    let { streamTool } = await import("../api");
    const errs: any[] = [];
    await streamTool("/x", {}, (e) => errs.push(e));
    expect(errs[0]).toMatchObject({ type: "error", message: "Add some text first." });

    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn(async () => new Response(streamOf(['data: {"type":"delta","text":"partial"}\n\n']), { status: 200 })));
    ({ streamTool } = await import("../api"));
    const evs: any[] = [];
    await streamTool("/x", {}, (e) => evs.push(e));
    expect(evs.at(-1)).toMatchObject({ type: "error", kind: "stream" });
  });

  it("explains when the server is offline", async () => {
    document.head.innerHTML = '<meta name="torz-token" content="t">';
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("Failed to fetch"); }));
    const { streamTool } = await import("../api");
    const evs: any[] = [];
    await streamTool("/x", {}, (e) => evs.push(e));
    expect(evs[0]).toMatchObject({ type: "error", kind: "offline" });
  });
});
