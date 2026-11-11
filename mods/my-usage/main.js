import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { appHome, exec, home, layout, props, readTextFile, run, settings, theme, watchFolder } from "herdr";
import { readdir } from "fs/promises";

// Agent hooks write one snapshot per agent here (see report_usage.py), and the mod draws one card
// per file: no polling. Clicking a row asks every agent for fresh usage with --now.
const FOLDER = `${home()}/.cache/bettr/usage`;
// Redraw the age and reset countdown (minutes). Also how long to wait before watching
// again when the folder is not there yet or cannot be watched.
const TICK_MS = 30 * 1000;
// Data older than this is drawn dim: no agent has reported for a while, or the endpoint refused.
const STALE_S = 30 * 60;

// Numbers use the terminals' font (Herdr's `font_family` setting), else Herdr's
// default. Read once per render.
let font = "JetBrains Mono";
const mono = el => el.font_family(font);
const readFont = () => { font = settings()?.font_family || "JetBrains Mono"; };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const finite = v => typeof v === "number" && Number.isFinite(v);

function parseSnapshot(text) {
  const s = JSON.parse(text);
  if (typeof s?.agent !== "string" || !/^[\w-]+$/.test(s.agent) || !finite(s.updatedAt) || !Array.isArray(s.windows)) return null;
  const windows = s.windows.filter(w => typeof w?.label === "string" && finite(w.used))
    .map(w => ({ label: w.label, used: Math.max(0, Math.min(100, w.used)), resetsAt: finite(w.resetsAt) ? w.resetsAt : null }));
  return windows.length ? { agent: s.agent, name: typeof s.name === "string" ? s.name : s.agent, updatedAt: s.updatedAt, windows } : null;
}

// A card whose windows have all reset shows nothing true any more. The next report brings it back.
const current = (snapshot, now) => snapshot.windows.some(w => !w.resetsAt || w.resetsAt * 1000 > now);

function resetText(seconds, now) {
  if (!seconds) return "—";
  const minutes = Math.ceil((seconds * 1000 - now) / 60000);
  if (minutes <= 0) return "reset";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return hours >= 24 ? `${Math.floor(hours / 24)}d ${hours % 24}h` : `${hours}h ${minutes % 60}m`;
}

function ageText(updatedAt, now) {
  const minutes = Math.max(0, Math.floor((now / 1000 - updatedAt) / 60));
  return minutes < 1 ? "now" : minutes < 60 ? `${minutes}m ago` : minutes < 1440 ? `${Math.floor(minutes / 60)}h ago` : `${Math.floor(minutes / 1440)}d ago`;
}

// A window's length in seconds, from the label report_usage.py gives it ("5-hour", "Weekly", "<n>h"); else null.
function windowSeconds(label) {
  if (label === "5-hour") return 5 * 3600;
  if (label === "Weekly") return 7 * 86400;
  const hours = /^(\d+)h$/.exec(label)?.[1];
  return hours ? Number(hours) * 3600 : null;
}
const shortLabel = label => label === "5-hour" ? "5h" : label === "Weekly" ? "7d" : label;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const clock = d => `${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

export default class UsageBars extends View {
  init(_props, cx) {
    this.snapshots = [];
    this.icons = {};
    this.refreshing = false;
    cx.spawn(async cx => {
      await this.reload(cx);
      // First run, or every card has reset: ask now instead of waiting for an agent's turn.
      if (!this.snapshots.some(s => current(s, Date.now()))) await this.refresh(cx);
      for (;;) {
        // The reporter makes the folder with its first snapshot; until then (or when it
        // cannot be watched) look again each tick.
        try { await watchFolder(FOLDER); } catch { await cx.sleep(TICK_MS); }
        await this.reload(cx);
      }
    });
    cx.timer.every(TICK_MS, cx => cx.notify());
  }

  async reload(cx) {
    let names = [];
    try { names = (await readdir(FOLDER)).filter(name => name.endsWith(".json")); } catch {}
    const snapshots = [];
    for (const name of names) {
      try {
        const snapshot = parseSnapshot(await readTextFile(`${FOLDER}/${name}`));
        if (snapshot) snapshots.push(snapshot);
      } catch {
        // Ignore a file that is not a snapshot.
      }
    }
    for (const { agent } of snapshots) {
      if (agent in this.icons) continue;
      let found = false;
      try { found = Boolean(await readTextFile(`${appHome()}/icons/${agent}.svg`)); } catch {}
      this.icons[agent] = found ? `icons/${agent}.svg` : "icons/agent.svg";
    }
    this.snapshots = snapshots.sort((a, b) => a.name.localeCompare(b.name));
    cx.notify();
  }

  // Ask every agent for fresh usage (an API read each), then show the files they saved.
  async refresh(cx) {
    if (this.refreshing) return;
    this.refreshing = true;
    cx.notify();
    try {
      // bettr-usage's own script, on purpose: its hooks write the snapshots this mod draws, and a bettr update keeps it current.
      await exec("python3", ["-I", `${appHome()}/mods/bettr-usage/report_usage.py`, "--now"]);
    } catch {
      // python3 is missing; still show what the hooks saved.
    } finally {
      this.refreshing = false;
      await this.reload(cx);
    }
  }

  // The look of herdr-coban's claude-status limits, for every agent: a header (icon, name, age), then one
  // row per window: label, bar with a mark for how much of the window has passed, %, time left.
  card(snapshot, t, now) {
    const stale = now / 1000 - snapshot.updatedAt > STALE_S;
    // Shortest window first (5h, then 7d); a window of unknown length last.
    const windows = snapshot.windows.map(row => ({ ...row, seconds: windowSeconds(row.label) }))
      .sort((a, b) => (a.seconds ?? Infinity) - (b.seconds ?? Infinity));
    const age = ageText(snapshot.updatedAt, now);
    const hint = this.refreshing ? "Refreshing usage…" : "Click to refresh usage from each agent";
    const body = v_flex().gap(1).when(this.refreshing, el => el.opacity(0.5));
    body.child(h_flex().h(18).gap(6).items_center()
      .child(image(this.icons[snapshot.agent] ?? "icons/agent.svg").w(11).h(11).flex_none())
      .child(div().flex_1().min_w(0).truncate().text_size(11.5).font_medium().text_color(t.dim).child(snapshot.name))
      .child(div().flex_none().text_size(11).text_color(t.dim).child(age)));
    for (const [index, row] of windows.entries()) {
      const left = row.resetsAt ? row.resetsAt - now / 1000 : null;
      const expired = left !== null && left <= 0;
      const used = expired ? 0 : row.used;
      // passed: the part of the window behind us. pace: the % at the reset if the use goes on at
      // the same rate; none in the first 5% of a window, where it would swing wildly.
      const passed = !expired && left !== null && row.seconds ? Math.min(1, Math.max(0, 1 - left / row.seconds)) : null;
      const pace = passed !== null && passed >= 0.05 ? used / passed : null;
      const tone = used >= 90 || pace >= 100 ? t.ansi1 : used >= 70 || pace >= 85 ? t.ansi3 : t.accent;
      // A window that has reset, or data older than STALE_S, is dim until new data comes.
      const quiet = expired || stale;
      const lines = [`${snapshot.name} · ${row.label}: ${Math.round(used)}% used`];
      if (expired) lines.push("The window has reset. New numbers come with the next report.");
      else if (row.resetsAt) lines.push(`Resets ${clock(new Date(row.resetsAt * 1000))} (in ${resetText(row.resetsAt, now)})`);
      if (pace !== null) lines.push(`At this pace: ${Math.round(pace)}% by the reset`);
      lines.push(`Updated ${age}`, hint);
      const bar = div().flex_1().min_w(0).h(6).rounded(3).bg(t.border).relative()
        .child(div().h_full().w(`${used}%`).rounded(3).bg(quiet ? t.dim : tone))
        .when(passed !== null, el => el.child(
          div().absolute().top(-3).h(12).w(2).rounded(1).bg(t.foreground).opacity(0.55).left(`${passed * 100}%`)));
      body.child(h_flex().id(`usage-${snapshot.agent}-${index}`).w_full().h(20).gap(8).items_center().cursor_pointer()
        .tooltip(lines.join("\n")).accessibility_label(lines[0])
        .on_click((_event, cx) => cx.spawn(async cx => { await this.refresh(cx); }))
        .child(div().w(22).flex_none().text_size(11).text_color(t.dim).child(shortLabel(row.label)))
        .child(bar)
        .child(mono(div()).w(32).flex_none().text_right().text_size(11.5)
          .text_color(quiet ? t.dim : tone === t.accent ? t.foreground : tone).child(`${Math.round(used)}%`))
        .child(mono(div()).w(54).flex_none().text_right().text_size(11).text_color(t.dim).truncate()
          .child(resetText(row.resetsAt, now))));
    }
    return body;
  }

  // The block is not resizable: it always fits its rows.
  fitHeight() {
    const id = props()?.autoSize;
    const node = id && this.contentHeight ? find(layout(), id) : null;
    if (node && node.size?.px !== this.contentHeight) run("layout.resize", { id, px: this.contentHeight });
  }

  render() {
    const t = theme();
    readFont();
    const now = Date.now();
    const shown = this.snapshots.filter(s => current(s, now));
    const empty = div().id("usage-empty").cursor_pointer().text_size(11).text_color(t.dim)
      .tooltip("Plan usage of Claude Code (with a Claude plan login) and Codex (with a ChatGPT login).\n"
        + "Agents update it after each turn once the agent hooks are set up.\nClick to check now.")
      .on_click((_event, cx) => cx.spawn(async cx => { await this.refresh(cx); }))
      .child(this.refreshing ? "Checking usage…" : "No plan usage yet. Click to check.");
    // Rows only, directly above the footer: no heading and no refresh button.
    const content = v_flex().id("usage-providers").w_full().flex_none()
      .on_size_change(size => {
        this.contentHeight = Math.min(400, Math.ceil(size.height));
        this.fitHeight();
      })
      .px(16).pt(6).pb(12).gap(6).text_size(12).text_color(t.foreground)
      .children(shown.length ? shown.map(s => this.card(s, t, now)) : [empty]);
    return v_flex().id("usage-root").size_full().min_h(0).bg(t.chrome).overflow_y_scrollbar().child(content);
  }
}
