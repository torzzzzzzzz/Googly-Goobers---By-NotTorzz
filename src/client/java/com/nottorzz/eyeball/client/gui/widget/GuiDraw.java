package com.nottorzz.eyeball.client.gui.widget;

import net.minecraft.client.gui.GuiGraphicsExtractor;

/** Small drawing helpers for the menu's rounded, flat style. */
public final class GuiDraw {
	public static final int ACCENT = 0xFFFFC23D;
	public static final int ACCENT_DARK = 0xFFB07A10;
	public static final int ON = 0xFF3DBE68;
	public static final int ON_HOVER = 0xFF52D27D;
	public static final int OFF = 0xFF4B505C;
	public static final int OFF_HOVER = 0xFF5C6270;
	public static final int TEXT = 0xFFF2F2F5;
	public static final int TEXT_DIM = 0xFFA9ADB8;
	public static final int PANEL = 0xC0141519;
	public static final int PANEL_BORDER = 0xFF2C2F38;
	public static final int ROW_HOVER = 0x22FFFFFF;

	private GuiDraw() {
	}

	/** A filled rectangle with rounded corners (radius in GUI pixels, up to 4). */
	public static void roundedRect(GuiGraphicsExtractor g, int x, int y, int w, int h, int radius, int color) {
		int r = Math.min(radius, Math.min(w, h) / 2);
		if (r <= 0) {
			g.fill(x, y, x + w, y + h, color);
			return;
		}
		g.fill(x + r, y, x + w - r, y + h, color);
		for (int i = 0; i < r; i++) {
			int inset = r - (int) Math.round(Math.sqrt(r * r - (r - i - 0.5) * (r - i - 0.5)));
			g.fill(x + inset, y + i, x + r, y + i + 1, color);
			g.fill(x + inset, y + h - i - 1, x + r, y + h - i, color);
			g.fill(x + w - r, y + i, x + w - inset, y + i + 1, color);
			g.fill(x + w - r, y + h - i - 1, x + w - inset, y + h - i, color);
		}
		g.fill(x, y + r, x + r, y + h - r, color);
		g.fill(x + w - r, y + r, x + w, y + h - r, color);
	}

	/** A panel with a 1 pixel border. */
	public static void panel(GuiGraphicsExtractor g, int x, int y, int w, int h) {
		roundedRect(g, x, y, w, h, 4, PANEL_BORDER);
		roundedRect(g, x + 1, y + 1, w - 2, h - 2, 3, PANEL);
	}

	public static int lerpColor(int a, int b, float t) {
		float k = Math.max(0.0F, Math.min(1.0F, t));
		int aa = (a >>> 24) & 0xFF;
		int ar = (a >> 16) & 0xFF;
		int ag = (a >> 8) & 0xFF;
		int ab = a & 0xFF;
		int ba = (b >>> 24) & 0xFF;
		int br = (b >> 16) & 0xFF;
		int bg = (b >> 8) & 0xFF;
		int bb = b & 0xFF;
		return Math.round(aa + (ba - aa) * k) << 24 | Math.round(ar + (br - ar) * k) << 16
			| Math.round(ag + (bg - ag) * k) << 8 | Math.round(ab + (bb - ab) * k);
	}
}
