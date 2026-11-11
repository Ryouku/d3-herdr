// A bell for the top bar: how many agents wait for you, and keys to jump between them.
// The idea is cockpit's (github.com/quaresc/cockpit); this one reads Herdr's own agents()
// and needs no hub.
//
// Waiting = blocked agents (they need an answer), longest waiting first, then finished
// ones (done: finished while you weren't looking; it turns idle once you look).
// Keys (keys.json, section layout:my-bettr): bell.waiting, bell.blocked, bell.done.
import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { agents, run, theme, notify, nextCommand } from "herdr";

// A lower `seq` changed longer ago: it has waited longest.
const oldest = (a, b) => a.seq - b.seq;
function lists() {
  const all = agents();
  const blocked = all.filter(a => a.status === "blocked").sort(oldest);
  const done = all.filter(a => a.status === "done").sort(oldest);
  const working = all.filter(a => a.status === "working").sort(oldest);
  return { blocked, done, working, waiting: [...blocked, ...done] };
}
const label = a => `${a.space_name} · ${a.title || a.program?.name || a.address}`;
const NONE = { waiting: "No agent is waiting", blocked: "No agent needs you", done: "No agent has finished", working: "No agent is working" };

// Go to the agent after the focused one in `list`; the first when the focused one is not in it.
// pane.focus, as the sidebar's agent rows use: it shows that agent's space and tab.
function jump(list) {
  if (!list.length) return false;
  const at = list.findIndex(a => a.focused);
  run("pane.focus", { pane: list[(at + 1) % list.length].pane });
  return true;
}

export default class Bell extends View {
  init(_props, cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (!(command in NONE)) continue;
        if (!jump(lists()[command])) notify({ title: NONE[command], timeout: 2000 });
        cx.notify();
      }
    });
  }

  render() {
    const t = theme();
    const { blocked, done, working, waiting } = lists();
    const color = blocked.length ? t.blocked : done.length ? t.done : t.dim;
    const tip = waiting.length
      ? [...blocked.map(a => `Needs you: ${label(a)}`), ...done.map(a => `Finished: ${label(a)}`), "Click: go to the one waiting longest"].join("\n")
      : NONE.waiting;
    // One count per status, each a button: a click goes to the next agent in that status.
    // Zero is dim. The need-you count breathes while it is not zero.
    const count = (id, list, word, hue) => h_flex().id(`count-${id}`).h(26).px(6).gap(4).rounded(6).items_center().flex_none()
      .cursor_pointer().text_size(11).text_color(list.length ? hue : t.dim)
      .hover(s => s.bg(t.hover))
      .tooltip(list.length ? [...list.map(label), "Click: go to the next one"].join("\n") : NONE[id])
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(() => { jump(list); })
      .child(div().font_semibold().when(id === "blocked" && list.length > 0, el => el.loop("opacity", { from: 0.6, to: 1, period: 1400 }))
        .child(String(list.length)))
      .child(word);
    return h_flex().id("bell").size_full().bg(t.chrome).items_center().justify_end().pr(6).gap(2)
      .child(count("blocked", blocked, "need you", t.blocked))
      .child(count("working", working, "working", t.working))
      .child(count("done", done, "done", t.done))
      .child(h_flex().id("bell-button").h(26).px(6).gap(4).rounded(6).items_center().flex_none().cursor_pointer()
        .hover(s => s.bg(t.hover)).tooltip(tip)
        // The block drags the window: a press on a button must not.
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => { jump(waiting); })
        .child(svg("mods/bell/bell.svg").size(14).text_color(color))
        // Nobody blocked, but some finished: a dot.
        .when(!blocked.length && done.length > 0, el => el.child(div().size(6).rounded(3).bg(t.done))));
  }
}
