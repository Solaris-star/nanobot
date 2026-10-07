import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import postcss from "postcss";
import { describe, expect, it } from "vitest";

import { buttonVariants } from "@/components/ui/button";
import { floatingItemFocusClassName } from "@/components/ui/floating-surface";

type Color = number[];

const tokens = new Map<string, string>();
postcss.parse(readFileSync(resolve(process.cwd(), "src/globals.css"), "utf8"))
  .walkRules(".dark", (rule) => {
    rule.walkDecls(/^--/, ({ prop, value }) => { tokens.set(prop, value); });
  });

function color(name: string): Color {
  const value = tokens.get(`--${name}`)!;
  const alias = /^var\(--(.+)\)$/.exec(value);
  if (alias) return color(alias[1]);
  const [hue, saturation, lightness] = value.split(" ").map(parseFloat);
  const light = lightness / 100;
  const amplitude = saturation / 100 * Math.min(light, 1 - light);
  return [0, 8, 4].map((offset) => {
    const k = (offset + hue / 30) % 12;
    return light - amplitude * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  });
}

function composite(foreground: Color, background: Color, opacity: number): Color {
  return foreground.map((channel, i) => channel * opacity + background[i] * (1 - opacity));
}

function luminance(rgb: Color): number {
  return rgb.reduce((sum, channel, i) => {
    const linear = channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    return sum + linear * [0.2126, 0.7152, 0.0722][i];
  }, 0);
}

function contrast(a: Color, b: Color): number {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

describe("dark destructive contrast", () => {
  // The token is shared by filled buttons and standalone menu labels. Making
  // only the fill lighter can fix its boundary while breaking its label.
  it.each(["background", "card"])("keeps button labels and boundaries legible on %s", (surface) => {
    const background = color(surface);
    const classes = buttonVariants({ variant: "destructive" });
    expect(classes.split(" ")).toEqual(expect.arrayContaining(["bg-destructive", "text-destructive-foreground"]));
    const hover = /hover:bg-destructive\/(\d+)/.exec(classes);
    expect(hover).not.toBeNull();
    for (const opacity of [1, Number(hover![1]) / 100]) {
      const fill = composite(color("destructive"), background, opacity);
      expect(contrast(color("destructive-foreground"), fill)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(fill, background)).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps destructive menu labels legible before and during focus", () => {
    const background = color("popover");
    const focus = /dark:focus:bg-white\/\[([\d.]+)\]/.exec(floatingItemFocusClassName);
    expect(focus).not.toBeNull();
    const focused = composite([1, 1, 1], background, Number(focus![1]));
    for (const surface of [background, focused]) {
      expect(contrast(color("destructive"), surface)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the offset keyboard-focus ring visible on button surfaces", () => {
    expect(buttonVariants({ variant: "destructive" }).split(" ")).toEqual(expect.arrayContaining([
      "focus-visible:ring-ring", "focus-visible:ring-offset-2", "ring-offset-background",
    ]));
    for (const surface of ["background", "card"]) {
      expect(contrast(color("ring"), color(surface))).toBeGreaterThanOrEqual(3);
    }
  });
});
